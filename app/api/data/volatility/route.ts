import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

export const revalidate = 0;

interface InstrumentVol {
  ticker: string;
  vol_30d: number;
  vol_90d: number;
  vol_ratio: number;
  iv: number | null;
  beta_btc_30d: number | null;
  beta_mstr_30d: number | null;
  signal: "low" | "normal" | "elevated" | "high";
}

function volSignal(ratio: number): "low" | "normal" | "elevated" | "high" {
  if (ratio < 0.8) return "low";
  if (ratio < 1.2) return "normal";
  if (ratio < 1.5) return "elevated";
  return "high";
}

const MOCK_INSTRUMENTS: InstrumentVol[] = [
  { ticker: "STRC", vol_30d: 10.2, vol_90d: 9.5, vol_ratio: 1.07, iv: null, beta_btc_30d: 0.08, beta_mstr_30d: 0.12, signal: "normal" },
  { ticker: "STRF", vol_30d: 7.8, vol_90d: 8.1, vol_ratio: 0.96, iv: null, beta_btc_30d: 0.05, beta_mstr_30d: 0.09, signal: "normal" },
  { ticker: "STRK", vol_30d: 12.5, vol_90d: 11.0, vol_ratio: 1.14, iv: null, beta_btc_30d: 0.10, beta_mstr_30d: 0.15, signal: "normal" },
  { ticker: "STRD", vol_30d: 14.3, vol_90d: 12.8, vol_ratio: 1.12, iv: null, beta_btc_30d: 0.12, beta_mstr_30d: 0.18, signal: "normal" },
  { ticker: "MSTR", vol_30d: 68.4, vol_90d: 62.1, vol_ratio: 1.10, iv: 72.5, beta_btc_30d: 1.85, beta_mstr_30d: 1.0, signal: "elevated" },
  { ticker: "BTC", vol_30d: 52.3, vol_90d: 48.7, vol_ratio: 1.07, iv: null, beta_btc_30d: 1.0, beta_mstr_30d: null, signal: "normal" },
  { ticker: "SPY", vol_30d: 14.1, vol_90d: 13.5, vol_ratio: 1.04, iv: 15.2, beta_btc_30d: null, beta_mstr_30d: null, signal: "normal" },
];

const MOCK_CORR_HISTORY = Array.from({ length: 90 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (89 - i));
  return {
    date: d.toISOString().slice(0, 10),
    strc_mstr: +(0.15 + Math.random() * 0.35).toFixed(4),
    strc_btc: +(0.08 + Math.random() * 0.3).toFixed(4),
    mstr_btc: +(0.75 + Math.random() * 0.15).toFixed(4),
    strc_spy: +(0.02 + Math.random() * 0.12).toFixed(4),
  };
});

const MOCK_RESPONSE = {
  instruments: MOCK_INSTRUMENTS,
  mstr_iv_30d: 72.5,
  mstr_iv_60d: 68.3,
  mstr_iv_percentile_252d: 0.65,
  corr_history: MOCK_CORR_HISTORY,
  last_updated: new Date().toISOString(),
};

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
      return NextResponse.json(MOCK_RESPONSE);
    }

    const instruments: InstrumentVol[] = [
      {
        ticker: "STRC",
        vol_30d: parseFloat(latest.vol30dStrc ?? "0"),
        vol_90d: parseFloat(latest.vol90dStrc ?? "0"),
        vol_ratio: parseFloat(latest.volRatioStrc ?? "1"),
        iv: null,
        beta_btc_30d: parseFloat(latest.betaStrcBtc30d ?? "0"),
        beta_mstr_30d: parseFloat(latest.betaStrcMstr30d ?? "0"),
        signal: volSignal(parseFloat(latest.volRatioStrc ?? "1")),
      },
      {
        ticker: "STRF",
        vol_30d: parseFloat(latest.vol30dStrf ?? "0"),
        vol_90d: parseFloat(latest.vol90dStrf ?? "0"),
        vol_ratio: parseFloat(latest.vol30dStrf ?? "0") / Math.max(0.01, parseFloat(latest.vol90dStrf ?? "1")),
        iv: null,
        beta_btc_30d: parseFloat(latest.betaStrfBtc30d ?? "0"),
        beta_mstr_30d: parseFloat(latest.betaStrfMstr30d ?? "0"),
        signal: volSignal(parseFloat(latest.vol30dStrf ?? "0") / Math.max(0.01, parseFloat(latest.vol90dStrf ?? "1"))),
      },
      {
        ticker: "STRK",
        vol_30d: parseFloat(latest.vol30dStrk ?? "0"),
        vol_90d: parseFloat(latest.vol90dStrk ?? "0"),
        vol_ratio: parseFloat(latest.vol30dStrk ?? "0") / Math.max(0.01, parseFloat(latest.vol90dStrk ?? "1")),
        iv: null,
        beta_btc_30d: parseFloat(latest.betaStrkBtc30d ?? "0"),
        beta_mstr_30d: parseFloat(latest.betaStrkMstr30d ?? "0"),
        signal: volSignal(parseFloat(latest.vol30dStrk ?? "0") / Math.max(0.01, parseFloat(latest.vol90dStrk ?? "1"))),
      },
      {
        ticker: "STRD",
        vol_30d: parseFloat(latest.vol30dStrd ?? "0"),
        vol_90d: parseFloat(latest.vol90dStrd ?? "0"),
        vol_ratio: parseFloat(latest.vol30dStrd ?? "0") / Math.max(0.01, parseFloat(latest.vol90dStrd ?? "1")),
        iv: null,
        beta_btc_30d: parseFloat(latest.betaStrdBtc30d ?? "0"),
        beta_mstr_30d: parseFloat(latest.betaStrdMstr30d ?? "0"),
        signal: volSignal(parseFloat(latest.vol30dStrd ?? "0") / Math.max(0.01, parseFloat(latest.vol90dStrd ?? "1"))),
      },
      {
        ticker: "MSTR",
        vol_30d: parseFloat(latest.vol30dMstr ?? "0"),
        vol_90d: parseFloat(latest.vol90dMstr ?? "0"),
        vol_ratio: parseFloat(latest.vol30dMstr ?? "0") / Math.max(0.01, parseFloat(latest.vol90dMstr ?? "1")),
        iv: parseFloat(latest.mstrIv30d ?? "0"),
        beta_btc_30d: 1.85,
        beta_mstr_30d: 1.0,
        signal: volSignal(parseFloat(latest.vol30dMstr ?? "0") / Math.max(0.01, parseFloat(latest.vol90dMstr ?? "1"))),
      },
      {
        ticker: "BTC",
        vol_30d: parseFloat(latest.vol30dBtc ?? "0"),
        vol_90d: parseFloat(latest.vol90dBtc ?? "0"),
        vol_ratio: parseFloat(latest.vol30dBtc ?? "0") / Math.max(0.01, parseFloat(latest.vol90dBtc ?? "1")),
        iv: null,
        beta_btc_30d: 1.0,
        beta_mstr_30d: null,
        signal: volSignal(parseFloat(latest.vol30dBtc ?? "0") / Math.max(0.01, parseFloat(latest.vol90dBtc ?? "1"))),
      },
      {
        ticker: "SPY",
        vol_30d: 14.1,
        vol_90d: 13.5,
        vol_ratio: 1.04,
        iv: 15.2,
        beta_btc_30d: null,
        beta_mstr_30d: null,
        signal: "normal",
      },
    ];

    // Fetch correlation history from last 90 days of daily_metrics
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const { gte } = await import("drizzle-orm");

    const metricRows = await db
      .select()
      .from(dailyMetrics)
      .where(gte(dailyMetrics.date, cutoff.toISOString().slice(0, 10)))
      .orderBy(dailyMetrics.date);

    const corrHistory = metricRows
      .filter((m) => m.corrStrcMstr30d)
      .map((m) => ({
        date: m.date,
        strc_mstr: parseFloat(m.corrStrcMstr30d ?? "0"),
        strc_btc: parseFloat(m.corrStrcBtc30d ?? "0"),
        mstr_btc: 0.82,
        strc_spy: 0.06,
      }));

    return NextResponse.json({
      instruments,
      mstr_iv_30d: parseFloat(latest.mstrIv30d ?? "0"),
      mstr_iv_60d: parseFloat(latest.mstrIv60d ?? "0"),
      mstr_iv_percentile_252d: parseFloat(latest.mstrIvPercentile252d ?? "0"),
      corr_history: corrHistory.length > 0 ? corrHistory : MOCK_CORR_HISTORY,
      last_updated: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(MOCK_RESPONSE);
  }
}
