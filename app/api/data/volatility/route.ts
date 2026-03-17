import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import {
  realizedVol,
  beta,
  correlation,
  logReturns,
  std,
} from "@/src/lib/calculators/volatility";

export const revalidate = 0;

interface InstrumentVol {
  ticker: string;
  vol_30d: number | null;
  vol_90d: number | null;
  vol_ratio: number | null;
  iv: number | null;
  beta_btc_30d: number | null;
  beta_mstr_30d: number | null;
  signal: "low" | "normal" | "elevated" | "high" | null;
}

interface StrcMetrics {
  sharpe_ratio: number | null;
  corr_btc: number | null;
  corr_spy: number | null;
  vol_1y: number | null;
  vol_1y_days: number | null;
  vol_1y_is_calendar: boolean;
}

function volSignal(
  ratio: number | null,
): "low" | "normal" | "elevated" | "high" | null {
  if (ratio == null) return null;
  if (ratio < 0.8) return "low";
  if (ratio < 1.2) return "normal";
  if (ratio < 1.5) return "elevated";
  return "high";
}

function pf(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function safeDiv(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

// ── Live compute from FMP when no DB data ──────────────────────────

interface DatedPrice { date: string; close: number }

async function fetchFmpHistoricalDated(
  ticker: string,
  days: number,
): Promise<DatedPrice[]> {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return [];
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${ticker}&from=${from}&to=${to}&apikey=${fmpKey}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const hist = Array.isArray(data) ? data : (data?.historical ?? []);
    return hist
      .filter((h: { close: number }) => h.close > 0)
      .map((h: { date: string; close: number }) => ({ date: h.date, close: h.close }))
      .reverse(); // oldest first
  } catch {
    return [];
  }
}

function fetchFmpHistorical(ticker: string, days: number): Promise<number[]> {
  return fetchFmpHistoricalDated(ticker, days).then(arr => arr.map(p => p.close));
}

/** Extract prices for a specific calendar year */
function calendarYearPrices(dated: DatedPrice[], year: number): number[] {
  const prefix = `${year}-`;
  return dated.filter(p => p.date.startsWith(prefix)).map(p => p.close);
}

async function fetchBtcHistorical(days: number): Promise<number[]> {
  // Use Coinbase Exchange API (free, no auth, reliable)
  const COINBASE = 'https://api.exchange.coinbase.com';
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const allPrices: Array<{ ts: number; close: number }> = [];

  try {
    // Coinbase max 300 candles per request — paginate
    let chunkEnd = new Date(end);
    while (chunkEnd > start) {
      const chunkStart = new Date(Math.max(chunkEnd.getTime() - 300 * 86400000, start.getTime()));
      const url = `${COINBASE}/products/BTC-USD/candles?granularity=86400&start=${chunkStart.toISOString()}&end=${chunkEnd.toISOString()}`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) break;
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const [ts, , , , close] of data) {
          if (close > 0) allPrices.push({ ts, close });
        }
      }
      chunkEnd = new Date(chunkStart.getTime() - 86400000);
    }
  } catch {
    return [];
  }

  // Sort oldest-first, deduplicate, return close prices
  allPrices.sort((a, b) => a.ts - b.ts);
  const seen = new Set<number>();
  return allPrices
    .filter(p => { if (seen.has(p.ts)) return false; seen.add(p.ts); return true; })
    .map(p => p.close);
}

function computeLiveMetrics(): Promise<{
  instruments: InstrumentVol[];
  strc_metrics: StrcMetrics;
  corr_history: Array<{ date: string; strc_mstr: number; strc_btc: number; mstr_btc: number; strc_spy: number }>;
  last_updated: string;
}> {
  return (async () => {
    // Fetch ~500 days to cover prior calendar year
    const [strcDated, mstrPrices, btcPrices, spyPrices, strfPrices, strkPrices, strdPrices] =
      await Promise.all([
        fetchFmpHistoricalDated("STRC", 500),
        fetchFmpHistorical("MSTR", 500),
        fetchBtcHistorical(500),
        fetchFmpHistorical("SPY", 500),
        fetchFmpHistorical("STRF", 500),
        fetchFmpHistorical("STRK", 500),
        fetchFmpHistorical("STRD", 500),
      ]);
    const strcPrices = strcDated.map(p => p.close);

    function buildInstrument(
      ticker: string,
      prices: number[],
      btcPrices: number[],
      mstrPrices: number[],
      overrides?: Partial<InstrumentVol>,
    ): InstrumentVol {
      const v30 = prices.length > 21 ? realizedVol(prices, 21) : null;
      const v90 = prices.length > 90 ? realizedVol(prices, 90) : null;
      const ratio = safeDiv(v30, v90);
      return {
        ticker,
        vol_30d: v30 != null ? +v30.toFixed(2) : null,
        vol_90d: v90 != null ? +v90.toFixed(2) : null,
        vol_ratio: ratio != null ? +ratio.toFixed(2) : null,
        iv: null,
        beta_btc_30d:
          prices.length > 30 && btcPrices.length > 30
            ? +beta(prices, btcPrices, 30).toFixed(4)
            : null,
        beta_mstr_30d:
          prices.length > 30 && mstrPrices.length > 30
            ? +beta(prices, mstrPrices, 30).toFixed(4)
            : null,
        signal: volSignal(ratio),
        ...overrides,
      };
    }

    const instruments: InstrumentVol[] = [
      buildInstrument("STRC", strcPrices, btcPrices, mstrPrices),
      buildInstrument("STRF", strfPrices, btcPrices, mstrPrices),
      buildInstrument("STRK", strkPrices, btcPrices, mstrPrices),
      buildInstrument("STRD", strdPrices, btcPrices, mstrPrices),
      buildInstrument("MSTR", mstrPrices, btcPrices, mstrPrices, {
        beta_btc_30d: mstrPrices.length > 30 && btcPrices.length > 30 ? +beta(mstrPrices, btcPrices, 30).toFixed(4) : 1.85,
        beta_mstr_30d: 1.0,
      }),
      buildInstrument("BTC", btcPrices, btcPrices, mstrPrices, {
        beta_btc_30d: 1.0,
        beta_mstr_30d: null,
      }),
      buildInstrument("SPY", spyPrices, btcPrices, mstrPrices),
    ];

    // STRC key metrics
    const corrBtc =
      strcPrices.length > 30 && btcPrices.length > 30
        ? +correlation(strcPrices, btcPrices, 30).toFixed(4)
        : null;
    const corrSpy =
      strcPrices.length > 30 && spyPrices.length > 30
        ? +correlation(strcPrices, spyPrices, 30).toFixed(4)
        : null;
    // Calendar-year vol: use prior year's trading days (matches MSTR dashboard)
    const priorYear = new Date().getFullYear() - 1;
    const calYearPrices = calendarYearPrices(strcDated, priorYear);
    // Fall back to since-inception if not enough prior-year data (e.g. IPO mid-year)
    const vol1yPrices = calYearPrices.length > 21 ? calYearPrices : strcPrices;
    const vol1yWindow = vol1yPrices.length > 21 ? vol1yPrices.length - 1 : 0;
    const vol1y = vol1yWindow > 0 ? +realizedVol(vol1yPrices, vol1yWindow).toFixed(2) : null;
    const vol30 = strcPrices.length > 21 ? realizedVol(strcPrices, 21) : null;

    // Sharpe: use STRC effective yield if available, else estimate from price return
    let sharpeRatio: number | null = null;
    const volForSharpe = vol30 ?? vol1y;
    if (volForSharpe != null && volForSharpe > 0 && strcPrices.length > 30) {
      // Annualized return from price series (last 30 days)
      const recent = strcPrices.slice(-31);
      const annReturn =
        (recent[recent.length - 1] / recent[0] - 1) * (252 / 30);
      // Risk-free ≈ 4.3% (SOFR)
      sharpeRatio = +((annReturn - 0.043) / volForSharpe).toFixed(2);
    }

    // Build rolling correlation history from last 90 days of prices
    const corrHistory: Array<{
      date: string;
      strc_mstr: number;
      strc_btc: number;
      mstr_btc: number;
      strc_spy: number;
    }> = [];

    const minLen = Math.min(strcPrices.length, mstrPrices.length, btcPrices.length);
    if (minLen > 60) {
      // Compute rolling 30d correlation for last 60 data points
      for (let i = 60; i <= minLen; i += 3) {
        const d = new Date();
        d.setDate(d.getDate() - (minLen - i));
        const window = 30;
        const sSlice = strcPrices.slice(i - window - 1, i);
        const mSlice = mstrPrices.slice(i - window - 1, i);
        const bSlice = btcPrices.slice(i - window - 1, i);
        const spSlice = spyPrices.slice(i - window - 1, i);

        if (sSlice.length > window && mSlice.length > window && bSlice.length > window) {
          corrHistory.push({
            date: d.toISOString().slice(0, 10),
            strc_mstr: +correlation(sSlice, mSlice, window).toFixed(4),
            strc_btc: +correlation(sSlice, bSlice, window).toFixed(4),
            mstr_btc: +correlation(mSlice, bSlice, window).toFixed(4),
            strc_spy:
              spSlice.length > window
                ? +correlation(sSlice, spSlice, window).toFixed(4)
                : 0,
          });
        }
      }
    }

    return {
      instruments,
      strc_metrics: {
        sharpe_ratio: sharpeRatio,
        corr_btc: corrBtc,
        corr_spy: corrSpy,
        vol_1y: vol1y,
        vol_1y_days: vol1yWindow > 0 ? vol1yWindow : null,
        vol_1y_is_calendar: calYearPrices.length > 21,
      },
      corr_history: corrHistory,
      last_updated: new Date().toISOString(),
    };
  })();
}

// ── Main handler ───────────────────────────────────────────────────

export async function GET() {
  try {
    const { db } = await import("@/src/db/client");
    const { dailyMetrics } = await import("@/src/db/schema");

    const [latest] = await db
      .select()
      .from(dailyMetrics)
      .orderBy(desc(dailyMetrics.date))
      .limit(1);

    if (!latest || !latest.vol30dStrc) {
      // No DB data — compute live from FMP
      const live = await computeLiveMetrics();
      if (live.instruments.length === 0 || live.instruments[0].vol_30d == null) {
        return NextResponse.json({
          instruments: [],
          mstr_iv_30d: null,
          mstr_iv_60d: null,
          mstr_iv_percentile_252d: null,
          corr_history: [],
          strc_metrics: { sharpe_ratio: null, corr_btc: null, corr_spy: null, vol_1y: null, vol_1y_days: null, vol_1y_is_calendar: false },
          data_available: false,
          last_updated: new Date().toISOString(),
        });
      }
      return NextResponse.json({
        ...live,
        mstr_iv_30d: null,
        mstr_iv_60d: null,
        mstr_iv_percentile_252d: null,
        data_available: true,
      });
    }

    // ── DB path: read from daily_metrics ──
    const instruments: InstrumentVol[] = [
      {
        ticker: "STRC",
        vol_30d: pf(latest.vol30dStrc),
        vol_90d: pf(latest.vol90dStrc),
        vol_ratio: pf(latest.volRatioStrc),
        iv: null,
        beta_btc_30d: pf(latest.betaStrcBtc30d),
        beta_mstr_30d: pf(latest.betaStrcMstr30d),
        signal: volSignal(pf(latest.volRatioStrc)),
      },
      {
        ticker: "STRF",
        vol_30d: pf(latest.vol30dStrf),
        vol_90d: pf(latest.vol90dStrf),
        vol_ratio: safeDiv(pf(latest.vol30dStrf), pf(latest.vol90dStrf)),
        iv: null,
        beta_btc_30d: pf(latest.betaStrfBtc30d),
        beta_mstr_30d: pf(latest.betaStrfMstr30d),
        signal: volSignal(safeDiv(pf(latest.vol30dStrf), pf(latest.vol90dStrf))),
      },
      {
        ticker: "STRK",
        vol_30d: pf(latest.vol30dStrk),
        vol_90d: pf(latest.vol90dStrk),
        vol_ratio: safeDiv(pf(latest.vol30dStrk), pf(latest.vol90dStrk)),
        iv: null,
        beta_btc_30d: pf(latest.betaStrkBtc30d),
        beta_mstr_30d: pf(latest.betaStrkMstr30d),
        signal: volSignal(safeDiv(pf(latest.vol30dStrk), pf(latest.vol90dStrk))),
      },
      {
        ticker: "STRD",
        vol_30d: pf(latest.vol30dStrd),
        vol_90d: pf(latest.vol90dStrd),
        vol_ratio: safeDiv(pf(latest.vol30dStrd), pf(latest.vol90dStrd)),
        iv: null,
        beta_btc_30d: pf(latest.betaStrdBtc30d),
        beta_mstr_30d: pf(latest.betaStrdMstr30d),
        signal: volSignal(safeDiv(pf(latest.vol30dStrd), pf(latest.vol90dStrd))),
      },
      {
        ticker: "MSTR",
        vol_30d: pf(latest.vol30dMstr),
        vol_90d: pf(latest.vol90dMstr),
        vol_ratio: safeDiv(pf(latest.vol30dMstr), pf(latest.vol90dMstr)),
        iv: pf(latest.mstrIv30d),
        beta_btc_30d: 1.85,
        beta_mstr_30d: 1.0,
        signal: volSignal(safeDiv(pf(latest.vol30dMstr), pf(latest.vol90dMstr))),
      },
      {
        ticker: "BTC",
        vol_30d: pf(latest.vol30dBtc),
        vol_90d: pf(latest.vol90dBtc),
        vol_ratio: safeDiv(pf(latest.vol30dBtc), pf(latest.vol90dBtc)),
        iv: null,
        beta_btc_30d: 1.0,
        beta_mstr_30d: null,
        signal: volSignal(safeDiv(pf(latest.vol30dBtc), pf(latest.vol90dBtc))),
      },
      {
        ticker: "SPY",
        vol_30d: null,
        vol_90d: null,
        vol_ratio: null,
        iv: null,
        beta_btc_30d: null,
        beta_mstr_30d: null,
        signal: null,
      },
    ];

    // Correlation history
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const { gte } = await import("drizzle-orm");

    const metricRows = await db
      .select()
      .from(dailyMetrics)
      .where(gte(dailyMetrics.date, cutoff.toISOString().slice(0, 10)))
      .orderBy(dailyMetrics.date);

    const corrHistory = metricRows
      .filter((m) => m.corrStrcMstr30d || m.corrStrcBtc30d)
      .map((m) => ({
        date: m.date,
        strc_mstr: pf(m.corrStrcMstr30d) ?? null,
        strc_btc: pf(m.corrStrcBtc30d) ?? null,
        mstr_btc: null,
        strc_spy: pf(m.corrStrcSpy30d) ?? null,
      }));

    const lastCorr =
      corrHistory.length > 0 ? corrHistory[corrHistory.length - 1] : null;
    const strcMetrics: StrcMetrics = {
      sharpe_ratio: pf(latest.sharpeRatioStrc),
      corr_btc:
        lastCorr && lastCorr.strc_btc !== 0
          ? lastCorr.strc_btc
          : pf(latest.corrStrcBtc30d),
      corr_spy: pf(latest.corrStrcSpy30d),
      vol_1y: pf(latest.vol1yStrc),
      vol_1y_days: null,
      vol_1y_is_calendar: true,
    };

    return NextResponse.json({
      instruments,
      mstr_iv_30d: pf(latest.mstrIv30d),
      mstr_iv_60d: pf(latest.mstrIv60d),
      mstr_iv_percentile_252d: pf(latest.mstrIvPercentile252d),
      corr_history: corrHistory,
      strc_metrics: strcMetrics,
      data_available: true,
      last_updated: latest.date + "T16:00:00Z",
    });
  } catch {
    // DB unavailable — compute live from FMP
    const live = await computeLiveMetrics();
    if (live.instruments.length === 0 || live.instruments[0].vol_30d == null) {
      return NextResponse.json({
        instruments: [],
        mstr_iv_30d: null,
        mstr_iv_60d: null,
        mstr_iv_percentile_252d: null,
        corr_history: [],
        strc_metrics: { sharpe_ratio: null, corr_btc: null, corr_spy: null, vol_1y: null, vol_1y_days: null, vol_1y_is_calendar: false },
        data_available: false,
        last_updated: new Date().toISOString(),
      });
    }
    return NextResponse.json({
      ...live,
      mstr_iv_30d: null,
      mstr_iv_60d: null,
      mstr_iv_percentile_252d: null,
      data_available: true,
    });
  }
}
