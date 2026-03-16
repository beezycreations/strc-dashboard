import { NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";

export const revalidate = 0;

// ── Seeded random for deterministic mock data ────────────────────────
// Simple mulberry32 PRNG so mock data is stable across requests
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Consistent mock data: volume drives ATM events ───────────────────
// The participation rate in the mock must match DEFAULT_PARTICIPATION_RATE (3.0%)
// so that the backtest formula can be validated against internally consistent data.
const MOCK_PARTICIPATION_RATE = 0.030;
const MOCK_NOISE_RANGE = 0.15; // ±15% noise on actual vs estimated (realistic error)

function generateMockData() {
  const rng = seededRng(42);

  // Step 1: Generate volume history (90 trading days)
  // Exclude today — we only show volume for completed trading days.
  // ATM estimates require finalized EOD volume; showing pre-market or
  // intraday partial volume would produce misleading issuance estimates.
  const volumeHistory: { date: string; strc_volume: number; strc_price: number; mstr_volume: number }[] = [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  let strcPrice = 99.5;

  for (let i = 90; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    // Skip today — no finalized volume yet
    if (d.toISOString().slice(0, 10) === todayStr) continue;

    strcPrice = Math.max(96, Math.min(105, strcPrice + (rng() - 0.48) * 0.4));
    const baseVol = 2_800_000 + rng() * 2_000_000;
    const dayOfMonth = d.getDate();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const nearMonthEnd = monthEnd - dayOfMonth < 5;
    const volMultiplier = nearMonthEnd ? 1.5 + rng() * 0.8 : 1.0;

    volumeHistory.push({
      date: d.toISOString().slice(0, 10),
      strc_volume: Math.floor(baseVol * volMultiplier),
      strc_price: +strcPrice.toFixed(2),
      mstr_volume: Math.floor(15_000_000 + rng() * 20_000_000),
    });
  }

  // Step 2: Generate ATM events DERIVED from volume data.
  // Confirmed 8-K events cover a period of ~5 trading days each.
  // The "actual" proceeds = sum of (volume × true_participation × price) + noise.
  // This makes the mock data internally consistent with our estimation methodology.
  const confirmedDates: string[] = [];
  const tradingDays = volumeHistory.map((v) => v.date);

  // Place confirmed 8-Ks roughly every 5 trading days
  for (let i = 4; i < tradingDays.length - 5; i += 5) {
    confirmedDates.push(tradingDays[i]);
  }
  // Keep last ~6 as confirmed (rest would be too many periods)
  const recentConfirmed = confirmedDates.slice(-6);

  const atmEvents: Array<{
    date: string; ticker: string; proceeds_usd: number;
    shares_issued: number; avg_price: number; is_estimated: boolean;
  }> = [];

  for (let ci = 0; ci < recentConfirmed.length; ci++) {
    const endDate = recentConfirmed[ci];
    const startDate = ci > 0
      ? recentConfirmed[ci - 1]
      : tradingDays[Math.max(0, tradingDays.indexOf(endDate) - 5)];

    // Sum volume-based proceeds for the period
    const periodDays = volumeHistory.filter(
      (v) => v.date > startDate && v.date <= endDate
    );
    let periodProceeds = 0;
    let totalShares = 0;
    let weightedPrice = 0;
    for (const day of periodDays) {
      const dayProceeds = day.strc_volume * MOCK_PARTICIPATION_RATE * day.strc_price;
      periodProceeds += dayProceeds;
      totalShares += Math.floor(day.strc_volume * MOCK_PARTICIPATION_RATE);
      weightedPrice += day.strc_price * dayProceeds;
    }
    const avgPrice = periodProceeds > 0 ? weightedPrice / periodProceeds : 100;

    // Add realistic noise: actual differs from formula by ±15%
    const noise = 1 + (rng() - 0.5) * 2 * MOCK_NOISE_RANGE;
    const actualProceeds = Math.round(periodProceeds * noise);

    atmEvents.push({
      date: endDate,
      ticker: "STRC",
      proceeds_usd: actualProceeds,
      shares_issued: Math.round(totalShares * noise),
      avg_price: +avgPrice.toFixed(2),
      is_estimated: false,
    });
  }

  // Add a few estimated (non-confirmed) events for recent days after last confirmed
  const lastConfirmedDate = recentConfirmed[recentConfirmed.length - 1];
  const recentUnconfirmed = volumeHistory.filter((v) => v.date > lastConfirmedDate);
  for (const day of recentUnconfirmed) {
    const dayProceeds = day.strc_volume * MOCK_PARTICIPATION_RATE * day.strc_price;
    atmEvents.push({
      date: day.date,
      ticker: "STRC",
      proceeds_usd: Math.round(dayProceeds),
      shares_issued: Math.floor(day.strc_volume * MOCK_PARTICIPATION_RATE),
      avg_price: day.strc_price,
      is_estimated: true,
    });
  }

  // Step 3: Generate cumulative ATM from volume
  let strcCum = 2_800_000_000;
  let mstrCum = 15_000_000_000;
  const cumulativeAtm = volumeHistory.map((v) => {
    strcCum += Math.round(v.strc_volume * MOCK_PARTICIPATION_RATE * v.strc_price);
    mstrCum += Math.round(v.mstr_volume * 0.008 * 350); // ~0.8% of MSTR vol × $350
    return {
      date: v.date,
      strc_cumulative_usd: strcCum,
      mstr_cumulative_usd: mstrCum,
    };
  });

  // Sort events newest first for display
  atmEvents.sort((a, b) => b.date.localeCompare(a.date));

  return { volumeHistory, cumulativeAtm, atmEvents };
}

const mockData = generateMockData();

const MOCK_RESPONSE = {
  volume_history: mockData.volumeHistory,
  cumulative_atm: mockData.cumulativeAtm,
  atm_events: mockData.atmEvents,
  kpi: {
    strc_volume_today: 0, // No volume until market closes
    strc_volume_avg_5d: 3_800_000,
    strc_volume_avg_20d: 3_100_000,
    strc_volume_ratio: 0,
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
    participation_rate_current: 0.030,
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

    // Volume KPIs — only show "today" volume if market has closed (finalized EOD)
    const todayStr = new Date().toISOString().slice(0, 10);
    const completedVolume = volumeHistory.filter((v) => v.date < todayStr);
    const recentVols = completedVolume.slice(-20).map((v) => v.strc_volume);
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
