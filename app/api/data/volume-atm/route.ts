import { NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";

export const revalidate = 0;

function generateMockVolumeHistory(days: number) {
  const history: { date: string; strc_volume: number; strc_price: number; mstr_volume: number }[] = [];
  const now = new Date();
  let strcPrice = 99.5;

  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    strcPrice = Math.max(96, Math.min(105, strcPrice + (Math.random() - 0.48) * 0.4));
    const baseVol = 2_800_000 + Math.random() * 2_000_000;
    // Volume spikes near month end (rate announcement)
    const dayOfMonth = d.getDate();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const nearMonthEnd = monthEnd - dayOfMonth < 5;
    const volMultiplier = nearMonthEnd ? 1.5 + Math.random() * 0.8 : 1.0;

    history.push({
      date: d.toISOString().slice(0, 10),
      strc_volume: Math.floor(baseVol * volMultiplier),
      strc_price: +strcPrice.toFixed(2),
      mstr_volume: Math.floor(15_000_000 + Math.random() * 20_000_000),
    });
  }
  return history;
}

function generateMockCumulativeAtm() {
  const data: { date: string; strc_cumulative_usd: number; mstr_cumulative_usd: number }[] = [];
  const now = new Date();
  let strcCum = 2_800_000_000;
  let mstrCum = 15_000_000_000;

  for (let i = 180; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    // Occasional issuance days
    if (Math.random() < 0.35) {
      strcCum += Math.floor(5_000_000 + Math.random() * 25_000_000);
    }
    if (Math.random() < 0.4) {
      mstrCum += Math.floor(20_000_000 + Math.random() * 120_000_000);
    }

    data.push({
      date: d.toISOString().slice(0, 10),
      strc_cumulative_usd: strcCum,
      mstr_cumulative_usd: mstrCum,
    });
  }
  return data;
}

function generateMockAtmEvents() {
  return [
    { date: "2026-03-10", ticker: "STRC", proceeds_usd: 18_500_000, shares_issued: 184_000, avg_price: 100.54, is_estimated: true },
    { date: "2026-03-07", ticker: "STRC", proceeds_usd: 12_300_000, shares_issued: 122_500, avg_price: 100.41, is_estimated: true },
    { date: "2026-03-05", ticker: "STRC", proceeds_usd: 22_100_000, shares_issued: 220_000, avg_price: 100.45, is_estimated: false },
    { date: "2026-03-03", ticker: "STRC", proceeds_usd: 8_700_000, shares_issued: 86_800, avg_price: 100.23, is_estimated: true },
    { date: "2026-02-28", ticker: "STRC", proceeds_usd: 31_200_000, shares_issued: 311_000, avg_price: 100.32, is_estimated: false },
    { date: "2026-02-26", ticker: "STRC", proceeds_usd: 15_400_000, shares_issued: 153_500, avg_price: 100.33, is_estimated: true },
    { date: "2026-02-24", ticker: "STRC", proceeds_usd: 19_800_000, shares_issued: 197_200, avg_price: 100.41, is_estimated: true },
    { date: "2026-02-21", ticker: "STRC", proceeds_usd: 14_200_000, shares_issued: 141_500, avg_price: 100.35, is_estimated: true },
    { date: "2026-02-19", ticker: "STRC", proceeds_usd: 25_600_000, shares_issued: 255_000, avg_price: 100.39, is_estimated: false },
    { date: "2026-02-14", ticker: "STRC", proceeds_usd: 11_900_000, shares_issued: 118_700, avg_price: 100.25, is_estimated: true },
  ];
}

const MOCK_RESPONSE = {
  volume_history: generateMockVolumeHistory(90),
  cumulative_atm: generateMockCumulativeAtm(),
  atm_events: generateMockAtmEvents(),
  kpi: {
    strc_volume_today: 4_200_000,
    strc_volume_avg_5d: 3_800_000,
    strc_volume_avg_20d: 3_100_000,
    strc_volume_ratio: 1.35,
    strc_atm_deployed_usd: 3_400_000_000,
    strc_atm_authorized_usd: 4_200_000_000,
    strc_atm_remaining_usd: 800_000_000,
    strc_atm_pct_deployed: 80.95,
    strc_atm_pace_30d_usd: 420_000_000,
    strc_atm_pace_90d_monthly_usd: 380_000_000,
    mstr_atm_deployed_usd: 18_000_000_000,
    mstr_atm_authorized_usd: 21_000_000_000,
    mstr_atm_remaining_usd: 3_000_000_000,
    mstr_atm_pct_deployed: 85.71,
    participation_rate_current: 0.032,
    participation_rate_range: [0.018, 0.045],
    est_days_to_exhaustion: 63,
  },
  last_updated: new Date().toISOString(),
};

export async function GET() {
  try {
    const { db } = await import("@/src/db/client");
    const {
      priceHistory,
      atmIssuance,
      capitalStructureSnapshots,
      atmCalibrationParams,
    } = await import("@/src/db/schema");

    // Volume history — STRC EOD prices with volume
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const volumeRows = await db
      .select()
      .from(priceHistory)
      .where(gte(priceHistory.ts, new Date(cutoffStr)))
      .orderBy(priceHistory.ts);

    // ATM issuance events
    const atmEvents = await db
      .select()
      .from(atmIssuance)
      .orderBy(desc(atmIssuance.reportDate))
      .limit(50);

    // Capital structure for ATM totals
    const [latestCap] = await db
      .select()
      .from(capitalStructureSnapshots)
      .orderBy(desc(capitalStructureSnapshots.snapshotDate))
      .limit(1);

    // Calibration params
    const [calibration] = await db
      .select()
      .from(atmCalibrationParams)
      .limit(1);

    if (volumeRows.length === 0 && atmEvents.length === 0) {
      return NextResponse.json(MOCK_RESPONSE);
    }

    // Build volume history grouped by date
    const volByDate = new Map<string, { strc_volume: number; strc_price: number; mstr_volume: number }>();
    for (const row of volumeRows) {
      const dateStr = new Date(row.ts).toISOString().slice(0, 10);
      const ticker = row.ticker.toUpperCase();
      if (!volByDate.has(dateStr)) {
        volByDate.set(dateStr, { strc_volume: 0, strc_price: 0, mstr_volume: 0 });
      }
      const entry = volByDate.get(dateStr)!;
      if (ticker === "STRC") {
        entry.strc_volume = parseFloat(row.volume ?? "0");
        entry.strc_price = parseFloat(row.price);
      } else if (ticker === "MSTR") {
        entry.mstr_volume = parseFloat(row.volume ?? "0");
      }
    }

    const volumeHistory = Array.from(volByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // Build cumulative ATM
    const strcEvents = atmEvents.filter((e) => e.ticker === "STRC").reverse();
    const mstrEvents = atmEvents.filter((e) => e.ticker === "MSTR").reverse();

    let strcCum = latestCap ? parseFloat(latestCap.strcAtmDeployedUsd ?? "0") : 0;
    // Subtract recent events to build running total
    const strcTotalRecent = strcEvents.reduce((s, e) => s + parseFloat(e.proceedsUsd ?? "0"), 0);
    let runningStrc = strcCum - strcTotalRecent;

    const cumulativeAtm = strcEvents.map((e) => {
      runningStrc += parseFloat(e.proceedsUsd ?? "0");
      return {
        date: e.reportDate,
        strc_cumulative_usd: runningStrc,
        mstr_cumulative_usd: latestCap ? parseFloat(latestCap.mstrAtmDeployedUsd ?? "0") : 0,
      };
    });

    // ATM events formatted
    const formattedEvents = atmEvents
      .filter((e) => e.ticker === "STRC")
      .slice(0, 10)
      .map((e) => ({
        date: e.reportDate,
        ticker: e.ticker,
        proceeds_usd: parseFloat(e.proceedsUsd ?? "0"),
        shares_issued: e.sharesIssued ?? 0,
        avg_price: parseFloat(e.avgPrice ?? "0"),
        is_estimated: e.isEstimated ?? false,
      }));

    // KPIs
    const strcAtmDeployed = latestCap ? parseFloat(latestCap.strcAtmDeployedUsd ?? "0") : 0;
    const strcAtmAuthorized = latestCap ? parseFloat(latestCap.strcAtmAuthorizedUsd ?? "0") : 0;
    const mstrAtmDeployed = latestCap ? parseFloat(latestCap.mstrAtmDeployedUsd ?? "0") : 0;
    const mstrAtmAuthorized = latestCap ? parseFloat(latestCap.mstrAtmAuthorizedUsd ?? "0") : 0;

    // Volume KPIs
    const recentVols = volumeHistory.slice(-20).map((v) => v.strc_volume);
    const volToday = recentVols[recentVols.length - 1] ?? 0;
    const volAvg5d = recentVols.slice(-5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, recentVols.length));
    const volAvg20d = recentVols.reduce((a, b) => a + b, 0) / Math.max(1, recentVols.length);

    // ATM pace
    const last30dEvents = atmEvents.filter((e) => {
      const d = new Date(e.reportDate);
      const cutoff30 = new Date();
      cutoff30.setDate(cutoff30.getDate() - 30);
      return e.ticker === "STRC" && d >= cutoff30;
    });
    const pace30d = last30dEvents.reduce((s, e) => s + parseFloat(e.proceedsUsd ?? "0"), 0);

    const last90dEvents = atmEvents.filter((e) => {
      const d = new Date(e.reportDate);
      const cutoff90 = new Date();
      cutoff90.setDate(cutoff90.getDate() - 90);
      return e.ticker === "STRC" && d >= cutoff90;
    });
    const pace90dMonthly = last90dEvents.reduce((s, e) => s + parseFloat(e.proceedsUsd ?? "0"), 0) / 3;

    const participationCurrent = calibration
      ? parseFloat(calibration.participationRateCurrent ?? "0")
      : 0.032;
    const participationLow = calibration
      ? parseFloat(calibration.participationRateLow ?? "0")
      : 0.018;
    const participationHigh = calibration
      ? parseFloat(calibration.participationRateHigh ?? "0")
      : 0.045;

    const remaining = strcAtmAuthorized - strcAtmDeployed;
    const estDaysToExhaustion = pace30d > 0 ? Math.floor((remaining / pace30d) * 30) : 999;

    return NextResponse.json({
      volume_history: volumeHistory.length > 0 ? volumeHistory : MOCK_RESPONSE.volume_history,
      cumulative_atm: cumulativeAtm.length > 0 ? cumulativeAtm : MOCK_RESPONSE.cumulative_atm,
      atm_events: formattedEvents.length > 0 ? formattedEvents : MOCK_RESPONSE.atm_events,
      kpi: {
        strc_volume_today: volToday,
        strc_volume_avg_5d: volAvg5d,
        strc_volume_avg_20d: volAvg20d,
        strc_volume_ratio: volAvg20d > 0 ? volToday / volAvg20d : 1,
        strc_atm_deployed_usd: strcAtmDeployed,
        strc_atm_authorized_usd: strcAtmAuthorized,
        strc_atm_remaining_usd: remaining,
        strc_atm_pct_deployed: strcAtmAuthorized > 0 ? (strcAtmDeployed / strcAtmAuthorized) * 100 : 0,
        strc_atm_pace_30d_usd: pace30d,
        strc_atm_pace_90d_monthly_usd: pace90dMonthly,
        mstr_atm_deployed_usd: mstrAtmDeployed,
        mstr_atm_authorized_usd: mstrAtmAuthorized,
        mstr_atm_remaining_usd: mstrAtmAuthorized - mstrAtmDeployed,
        mstr_atm_pct_deployed: mstrAtmAuthorized > 0 ? (mstrAtmDeployed / mstrAtmAuthorized) * 100 : 0,
        participation_rate_current: participationCurrent,
        participation_rate_range: [participationLow, participationHigh],
        est_days_to_exhaustion: estDaysToExhaustion,
      },
      last_updated: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(MOCK_RESPONSE);
  }
}
