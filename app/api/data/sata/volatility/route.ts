import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import {
  realizedVol,
  beta,
  correlation,
} from "@/src/lib/calculators/volatility";

export const revalidate = 0;

interface InstrumentVol {
  ticker: string;
  vol_30d: number | null;
  vol_90d: number | null;
  vol_ratio: number | null;
  beta_btc_30d: number | null;
  beta_mstr_30d: number | null;
  signal: "low" | "normal" | "elevated" | "high" | null;
}

interface SataMetrics {
  sharpe_ratio: number | null;
  corr_btc: number | null;
  vol_1y: number | null;
  vol_1y_days: number | null;
  vol_1y_is_calendar: boolean;
}

function volSignal(ratio: number | null): "low" | "normal" | "elevated" | "high" | null {
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

// ── Live compute from FMP ──────────────────────────────────────────

interface DatedPrice { date: string; close: number }

async function fetchFmpHistoricalDated(ticker: string, days: number): Promise<DatedPrice[]> {
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
      .reverse();
  } catch {
    return [];
  }
}

function fetchFmpHistorical(ticker: string, days: number): Promise<number[]> {
  return fetchFmpHistoricalDated(ticker, days).then(arr => arr.map(p => p.close));
}

function calendarYearPrices(dated: DatedPrice[], year: number): number[] {
  const prefix = `${year}-`;
  return dated.filter(p => p.date.startsWith(prefix)).map(p => p.close);
}

async function fetchBtcHistorical(days: number): Promise<number[]> {
  const COINBASE = "https://api.exchange.coinbase.com";
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const allPrices: Array<{ ts: number; close: number }> = [];

  try {
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

  allPrices.sort((a, b) => a.ts - b.ts);
  const seen = new Set<number>();
  return allPrices
    .filter(p => { if (seen.has(p.ts)) return false; seen.add(p.ts); return true; })
    .map(p => p.close);
}

async function computeLiveMetrics(): Promise<{
  instruments: InstrumentVol[];
  sata_metrics: SataMetrics;
  corr_history: Array<{ date: string; sata_mstr: number; sata_btc: number }>;
  last_updated: string;
}> {
  const [sataDated, asstPrices, mstrPrices, btcPrices] = await Promise.all([
    fetchFmpHistoricalDated("SATA", 500),
    fetchFmpHistorical("ASST", 500),
    fetchFmpHistorical("MSTR", 500),
    fetchBtcHistorical(500),
  ]);
  const sataPrices = sataDated.map(p => p.close);

  function buildInstrument(
    ticker: string,
    prices: number[],
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
    buildInstrument("SATA", sataPrices),
    buildInstrument("ASST", asstPrices),
    buildInstrument("MSTR", mstrPrices, {
      beta_btc_30d: mstrPrices.length > 30 && btcPrices.length > 30 ? +beta(mstrPrices, btcPrices, 30).toFixed(4) : null,
      beta_mstr_30d: 1.0,
    }),
    buildInstrument("BTC", btcPrices, {
      beta_btc_30d: 1.0,
      beta_mstr_30d: null,
    }),
  ];

  // SATA key metrics
  const corrBtc = sataPrices.length > 30 && btcPrices.length > 30
    ? +correlation(sataPrices, btcPrices, 30).toFixed(4) : null;

  const priorYear = new Date().getFullYear() - 1;
  const calYearPrices = calendarYearPrices(sataDated, priorYear);
  const vol1yPrices = calYearPrices.length > 21 ? calYearPrices : sataPrices;
  const vol1yWindow = vol1yPrices.length > 21 ? vol1yPrices.length - 1 : 0;
  const vol1y = vol1yWindow > 0 ? +realizedVol(vol1yPrices, vol1yWindow).toFixed(2) : null;
  const vol30 = sataPrices.length > 21 ? realizedVol(sataPrices, 21) : null;

  let sharpeRatio: number | null = null;
  const volForSharpe = vol30 ?? vol1y;
  if (volForSharpe != null && volForSharpe > 0 && sataPrices.length > 30) {
    const recent = sataPrices.slice(-31);
    const annReturn = (recent[recent.length - 1] / recent[0] - 1) * (252 / 30);
    sharpeRatio = +((annReturn - 0.043) / volForSharpe).toFixed(2);
  }

  // Rolling correlation history
  const corrHistory: Array<{ date: string; sata_mstr: number; sata_btc: number }> = [];
  const minLen = Math.min(sataPrices.length, mstrPrices.length, btcPrices.length);
  if (minLen > 60) {
    for (let i = 60; i <= minLen; i += 3) {
      const d = new Date();
      d.setDate(d.getDate() - (minLen - i));
      const window = 30;
      const sSlice = sataPrices.slice(i - window - 1, i);
      const mSlice = mstrPrices.slice(i - window - 1, i);
      const bSlice = btcPrices.slice(i - window - 1, i);

      if (sSlice.length > window && mSlice.length > window && bSlice.length > window) {
        corrHistory.push({
          date: d.toISOString().slice(0, 10),
          sata_mstr: +correlation(sSlice, mSlice, window).toFixed(4),
          sata_btc: +correlation(sSlice, bSlice, window).toFixed(4),
        });
      }
    }
  }

  return {
    instruments,
    sata_metrics: {
      sharpe_ratio: sharpeRatio,
      corr_btc: corrBtc,
      vol_1y: vol1y,
      vol_1y_days: vol1yWindow > 0 ? vol1yWindow : null,
      vol_1y_is_calendar: calYearPrices.length > 21,
    },
    corr_history: corrHistory,
    last_updated: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const { db } = await import("@/src/db/client");
    const { sataDailyMetrics } = await import("@/src/db/schema");

    const [latest] = await db
      .select()
      .from(sataDailyMetrics)
      .orderBy(desc(sataDailyMetrics.date))
      .limit(1);

    if (!latest || !latest.vol30dSata) {
      const live = await computeLiveMetrics();
      if (live.instruments.length === 0 || live.instruments[0].vol_30d == null) {
        return NextResponse.json({
          instruments: [],
          corr_history: [],
          sata_metrics: { sharpe_ratio: null, corr_btc: null, vol_1y: null, vol_1y_days: null, vol_1y_is_calendar: false },
          data_available: false,
          last_updated: new Date().toISOString(),
        });
      }
      return NextResponse.json({ ...live, data_available: true });
    }

    // DB path
    const instruments: InstrumentVol[] = [
      {
        ticker: "SATA",
        vol_30d: pf(latest.vol30dSata),
        vol_90d: pf(latest.vol90dSata),
        vol_ratio: pf(latest.volRatioSata),
        beta_btc_30d: pf(latest.betaSataBtc30d),
        beta_mstr_30d: pf(latest.betaSataMstr30d),
        signal: volSignal(pf(latest.volRatioSata)),
      },
      {
        ticker: "ASST",
        vol_30d: pf(latest.vol30dAsst),
        vol_90d: pf(latest.vol90dAsst),
        vol_ratio: safeDiv(pf(latest.vol30dAsst), pf(latest.vol90dAsst)),
        beta_btc_30d: pf(latest.betaAsstBtc30d),
        beta_mstr_30d: pf(latest.betaAsstMstr30d),
        signal: volSignal(safeDiv(pf(latest.vol30dAsst), pf(latest.vol90dAsst))),
      },
      {
        ticker: "MSTR",
        vol_30d: null, vol_90d: null, vol_ratio: null,
        beta_btc_30d: null, beta_mstr_30d: 1.0,
        signal: null,
      },
      {
        ticker: "BTC",
        vol_30d: null, vol_90d: null, vol_ratio: null,
        beta_btc_30d: 1.0, beta_mstr_30d: null,
        signal: null,
      },
    ];

    // Correlation history
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const { gte } = await import("drizzle-orm");
    const metricRows = await db
      .select()
      .from(sataDailyMetrics)
      .where(gte(sataDailyMetrics.date, cutoff.toISOString().slice(0, 10)))
      .orderBy(sataDailyMetrics.date);

    const corrHistory = metricRows
      .filter((m) => m.corrSataMstr30d || m.corrSataBtc30d)
      .map((m) => ({
        date: m.date,
        sata_mstr: pf(m.corrSataMstr30d) ?? 0,
        sata_btc: pf(m.corrSataBtc30d) ?? 0,
      }));

    return NextResponse.json({
      instruments,
      sata_metrics: {
        sharpe_ratio: pf(latest.sharpeRatioSata),
        corr_btc: pf(latest.corrSataBtc30d),
        vol_1y: pf(latest.vol1ySata),
        vol_1y_days: null,
        vol_1y_is_calendar: true,
      },
      corr_history: corrHistory,
      data_available: true,
      last_updated: latest.date + "T16:00:00Z",
    });
  } catch {
    const live = await computeLiveMetrics();
    if (live.instruments.length === 0 || live.instruments[0].vol_30d == null) {
      return NextResponse.json({
        instruments: [],
        corr_history: [],
        sata_metrics: { sharpe_ratio: null, corr_btc: null, vol_1y: null, vol_1y_days: null, vol_1y_is_calendar: false },
        data_available: false,
        last_updated: new Date().toISOString(),
      });
    }
    return NextResponse.json({ ...live, data_available: true });
  }
}
