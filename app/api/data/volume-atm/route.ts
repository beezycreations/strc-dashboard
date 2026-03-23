import { NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";
import { MSTR_SHARES_AT_FILING } from "@/src/lib/data/capital-structure";
import { calibrateParticipationRate, getConfirmedPeriodMetrics, allocateByVolume } from "@/src/lib/calculators/issuance-engine";
import { runForecast, type DayMarketData } from "@/src/lib/calculators/flywheel-forecast";
import { CONFIRMED_STRC_ATM, TOTAL_STRC_SHARES, TOTAL_STRC_PROCEEDS } from "@/src/lib/data/confirmed-strc-atm";
import { CONFIRMED_PURCHASES, LATEST_CONFIRMED_DATE } from "@/src/lib/data/confirmed-purchases";
import { LATEST_ATM_PERIOD_END, CONFIRMED_ATM_PERIODS } from "@/src/lib/data/confirmed-atm-all";

/**
 * Derive the latest confirmed period end from DB if newer than static data.
 * This allows new 8-K filings (ingested by edgar-check cron) to automatically
 * shift the confirmed/estimated boundary without manual static file updates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLatestConfirmedBoundary(db: any): Promise<string> {
  try {
    const { strcFilings } = await import("@/src/db/schema");
    const [latest] = await db
      .select({ periodEnd: strcFilings.periodEnd })
      .from(strcFilings)
      .orderBy(desc(strcFilings.periodEnd))
      .limit(1);

    if (latest?.periodEnd && latest.periodEnd > LATEST_ATM_PERIOD_END) {
      return latest.periodEnd;
    }
  } catch {
    // Fall through to static
  }
  return LATEST_ATM_PERIOD_END;
}

/**
 * Get confirmed BTC purchases from DB that are newer than static data.
 * Converts cumulative btcCount into per-period delta (btc purchased).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDbPurchases(db: any): Promise<Array<{ date: string; btc: number; cost_m: number; cumulative: number }>> {
  try {
    const { btcHoldings } = await import("@/src/db/schema");
    const rows = await db
      .select()
      .from(btcHoldings)
      .where(gte(btcHoldings.reportDate, LATEST_CONFIRMED_DATE))
      .orderBy(btcHoldings.reportDate);

    // Last known cumulative from static data
    const lastStaticCum = CONFIRMED_PURCHASES[CONFIRMED_PURCHASES.length - 1]?.cumulative ?? 0;

    const result: Array<{ date: string; btc: number; cost_m: number; cumulative: number }> = [];
    let prevCum = lastStaticCum;

    for (const r of rows) {
      if (r.reportDate <= LATEST_CONFIRMED_DATE) continue;
      const cum = r.btcCount;
      const delta = cum - prevCum;
      if (delta > 0) {
        result.push({
          date: r.reportDate,
          btc: delta,
          cost_m: r.totalCostUsd ? Math.round(parseFloat(r.totalCostUsd) / 1e6) : 0,
          cumulative: cum,
        });
      }
      prevCum = cum;
    }

    return result;
  } catch {
    return [];
  }
}

export const revalidate = 0;

const EMPTY_RESPONSE = (source: string) => ({
  volume_history: [],
  cumulative_atm: [],
  atm_events: [],
  flywheel_days: [],
  kpi: {
    strc_volume_today: 0,
    strc_volume_avg_5d: 0,
    strc_volume_avg_20d: 0,
    strc_volume_ratio: 0,
    strc_atm_deployed_usd: 0,
    strc_atm_authorized_usd: 0,
    strc_atm_remaining_usd: 0,
    strc_atm_pct_deployed: 0,
    strc_atm_pace_30d_usd: 0,
    strc_atm_pace_90d_monthly_usd: 0,
    mstr_atm_deployed_usd: 0,
    mstr_atm_authorized_usd: 0,
    mstr_atm_remaining_usd: 0,
    mstr_atm_pct_deployed: 0,
    participation_rate_current: 0,
    participation_rate_source: "unavailable",
    participation_rate_range: [0, 0],
    est_days_to_exhaustion: 0,
    flywheel_estimated_btc: null,
    flywheel_estimated_mnav: null,
    flywheel_estimated_pref_notional: null,
  },
  last_updated: new Date().toISOString(),
  source,
});

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const { db } = await import("@/src/db/client");
    const {
      priceHistory,
      atmIssuance,
      capitalStructureSnapshots,
      atmCalibrationParams,
    } = await import("@/src/db/schema");

    // Volume history — STRC EOD prices with volume (from IPO date)
    const STRC_IPO_DATE = "2025-07-29";
    const cutoffStr = STRC_IPO_DATE;

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

    // Calibration params from DB
    const [dbCalibration] = await db
      .select()
      .from(atmCalibrationParams)
      .limit(1);

    if (volumeRows.length === 0 && atmEvents.length === 0) {
      return NextResponse.json(EMPTY_RESPONSE("unavailable"));
    }

    // Resolve confirmed/estimated boundary — prefer DB if newer than static
    const latestPeriodEnd = await getLatestConfirmedBoundary(db);
    // Merge any DB-only purchases newer than static data
    const dbPurchases = await getDbPurchases(db);

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
      // Only include trading days where STRC has data (excludes weekends/holidays from BTC-only rows)
      .filter(([, v]) => v.strc_price > 0)
      .map(([date, v]) => ({ date, ...v }));

    // ── Flywheel: calibrate participation rate from volume vs 8-K ──
    const calibration = calibrateParticipationRate(volumeHistory);
    const confirmedMetrics = getConfirmedPeriodMetrics();

    // Get BTC + MSTR prices from DB for the flywheel
    const btcByDate = new Map<string, number>();
    const mstrByDate = new Map<string, { price: number; volume: number }>();
    // Track last known prices for fallback (avoids stale hardcoded values)
    let lastKnownBtcPrice = 0;
    let lastKnownMstrPrice = 0;
    let lastKnownMstrVolume = 0;
    for (const row of volumeRows) {
      const dateStr = new Date(row.ts).toISOString().slice(0, 10);
      const ticker = row.ticker.toUpperCase();
      if (ticker === "BTC") {
        const p = parseFloat(row.price);
        btcByDate.set(dateStr, p);
        lastKnownBtcPrice = p;
      }
      if (ticker === "MSTR") {
        const p = parseFloat(row.price);
        const vol = parseFloat(row.volume ?? "0");
        mstrByDate.set(dateStr, { price: p, volume: vol });
        lastKnownMstrPrice = p;
        lastKnownMstrVolume = vol;
      }
    }

    // Skip flywheel if no BTC price data available (would produce invalid estimates)
    const canRunFlywheel = lastKnownBtcPrice > 0;

    // ── Two-phase approach: confirmed days + estimated days ──
    // Phase 1: Build confirmed days from CONFIRMED_PURCHASES (covers ALL weeks).
    //   Each purchase entry creates a period from (prev_date+1) to (this_date).
    //   BTC + issuance are volume-weighted across trading days in the period.
    //   Where we have detailed STRC ATM data (CONFIRMED_ATM_PERIODS), use it.
    //   Where we only have BTC data, estimate STRC proceeds from cost (~100% conversion).
    // Phase 2: Run flywheel ONLY on days AFTER the last confirmed purchase date.

    // Build a lookup to find STRC ATM detail for dates within confirmed ATM periods
    const atmPeriodForDate = (dateStr: string) =>
      confirmedMetrics.find((m) => dateStr >= m.period_start && dateStr <= m.period_end);

    // Build MSTR proceeds lookup from CONFIRMED_ATM_PERIODS (multi-instrument 8-K data)
    const mstrPeriodForDate = (dateStr: string) => {
      const period = CONFIRMED_ATM_PERIODS.find(
        (p) => dateStr >= p.period_start && dateStr <= p.period_end,
      );
      if (!period) return 0;
      const mstr = period.instruments.find((i) => i.ticker === "MSTR");
      return mstr?.net_proceeds ?? 0;
    };

    interface ConfirmedDayResult {
      date: string;
      strc_shares: number;
      strc_proceeds: number;
      mstr_proceeds: number;
      btc_estimate: number;
    }
    const confirmedDayResults: ConfirmedDayResult[] = [];
    const confirmedDaySet = new Set<string>();

    // Build confirmed period ranges from CONFIRMED_PURCHASES (post-IPO only)
    // 8-K filing date is typically 1 day after period end, so include purchases
    // filed up through the day after the confirmed boundary.
    const lastConfirmedCutoff = nextDay(latestPeriodEnd);
    const allPurchases = [
      ...CONFIRMED_PURCHASES,
      ...dbPurchases.filter((dp) => !CONFIRMED_PURCHASES.some((cp) => cp.date === dp.date)),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const postIpoPurchases = allPurchases.filter(
      (p) => p.date >= STRC_IPO_DATE && p.date <= lastConfirmedCutoff,
    );

    for (let i = 0; i < postIpoPurchases.length; i++) {
      const purchase = postIpoPurchases[i];
      // Period start: day after previous purchase date (or IPO date for first)
      const prevDate = i > 0
        ? postIpoPurchases[i - 1].date
        : STRC_IPO_DATE;
      const periodStart = i > 0
        ? nextDay(prevDate)
        : STRC_IPO_DATE;
      // Cap period end at confirmed boundary (filing date may be after period end)
      const periodEnd = purchase.date > latestPeriodEnd
        ? latestPeriodEnd
        : purchase.date;

      // Get trading days with volume in this period
      const periodVols = volumeHistory.filter(
        (v) => v.date >= periodStart && v.date <= periodEnd && v.strc_volume > 0,
      );
      if (periodVols.length === 0) continue;

      // Check if we have detailed STRC ATM data for this period
      const atmPeriod = atmPeriodForDate(periodStart) ?? atmPeriodForDate(periodEnd);
      const hasStrcDetail = atmPeriod && atmPeriod.strc_shares > 0;

      // MSTR proceeds for this period (from multi-instrument 8-K data)
      const periodMstrProceeds = mstrPeriodForDate(periodStart) || mstrPeriodForDate(periodEnd);

      // Full period STRC proceeds
      const periodStrcProceeds = hasStrcDetail
        ? atmPeriod!.strc_proceeds
        : purchase.cost_m * 1e6;
      const periodStrcShares = hasStrcDetail
        ? atmPeriod!.strc_shares
        : periodStrcProceeds / 100; // rough estimate

      // Place full 8-K proceeds on the last trading day of the period
      // (data integrity: show actuals at period level, not daily allocation)
      const lastTradingDay = periodVols[periodVols.length - 1];

      for (const v of periodVols) {
        const isAnchorDay = v.date === lastTradingDay.date;

        confirmedDayResults.push({
          date: v.date,
          strc_shares: isAnchorDay ? periodStrcShares : 0,
          strc_proceeds: isAnchorDay ? periodStrcProceeds : 0,
          mstr_proceeds: isAnchorDay ? periodMstrProceeds : 0,
          btc_estimate: isAnchorDay ? purchase.btc : 0,
        });
        confirmedDaySet.add(v.date);
      }
    }

    // Phase 2: Flywheel ONLY on days AFTER the last confirmed 8-K period end
    const estimatedDays = volumeHistory.filter(
      (v) => !confirmedDaySet.has(v.date) && v.date > latestPeriodEnd,
    );
    const flywheelMarketData: DayMarketData[] = estimatedDays.map((v) => ({
      date: v.date,
      btcPrice: btcByDate.get(v.date) ?? lastKnownBtcPrice,
      strcPrice: v.strc_price > 0 ? v.strc_price : 100,
      strcVolume: v.strc_volume,
      mstrPrice: mstrByDate.get(v.date)?.price ?? lastKnownMstrPrice,
      mstrVolume: mstrByDate.get(v.date)?.volume ?? lastKnownMstrVolume,
      mstrSharesOutstanding: MSTR_SHARES_AT_FILING,
    }));

    const flywheelResult = (canRunFlywheel && flywheelMarketData.length > 0)
      ? runForecast(
          flywheelMarketData,
          { STRC: calibration.rate },
          { participationCalibration: calibration },
        )
      : null;

    // Merge confirmed + estimated into unified flywheel_days for the chart
    const confirmedDayMap = new Map(confirmedDayResults.map((d) => [d.date, d]));
    const flywheelDayMap = new Map((flywheelResult?.days ?? []).map((d) => [d.date, d]));

    // Build chart-ready flywheel_days array covering all volume days
    const flywheelDays = volumeHistory.map((v) => {
      const confirmed = confirmedDayMap.get(v.date);
      const estimated = flywheelDayMap.get(v.date);

      if (confirmed) {
        return {
          date: v.date,
          strc_issuance_confirmed: confirmed.strc_proceeds / 1e6,
          strc_issuance_estimated: 0,
          mstr_issuance_confirmed: confirmed.mstr_proceeds / 1e6,
          mstr_issuance_estimated: 0,
          strc_shares_issued: confirmed.strc_shares,
          mstr_shares_issued: 0,
          btc_purchased: confirmed.btc_estimate,
          cumulative_btc: 0,
          mnav: 0,
          source: "confirmed" as const,
        };
      }

      if (estimated) {
        return {
          date: v.date,
          strc_issuance_confirmed: 0,
          strc_issuance_estimated: estimated.strcProceeds / 1e6,
          mstr_issuance_confirmed: 0,
          mstr_issuance_estimated: estimated.mstrProceeds / 1e6,
          strc_shares_issued: estimated.strcSharesIssued,
          mstr_shares_issued: estimated.mstrSharesIssued,
          btc_purchased: estimated.btcPurchased,
          cumulative_btc: estimated.cumulativeBtc,
          mnav: estimated.mnav,
          source: "estimated" as const,
        };
      }

      // Days before first purchase or in non-trading gaps — no data
      return {
        date: v.date,
        strc_issuance_confirmed: 0,
        strc_issuance_estimated: 0,
        mstr_issuance_confirmed: 0,
        mstr_issuance_estimated: 0,
        strc_shares_issued: 0,
        mstr_shares_issued: 0,
        btc_purchased: 0,
        cumulative_btc: 0,
        mnav: 0,
        source: "confirmed" as const,
      };
    });

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

    // ── ATM events from confirmed STRC 8-K filings + estimated running total ──
    // Build from CONFIRMED_STRC_ATM static data (ground truth) rather than empty DB table
    const confirmedEvents = [...CONFIRMED_STRC_ATM].reverse().map((f) => ({
      date: f.filed,
      period_start: f.period_start,
      period_end: f.period_end,
      type: f.type,
      proceeds_usd: f.net_proceeds,
      shares_issued: f.shares_sold,
      avg_price: f.net_proceeds / f.shares_sold,
      btc_purchased: f.btc_purchased,
      avg_btc_price: f.avg_btc_price,
      is_estimated: false,
      cumulative_proceeds: 0 as number,
    }));

    // Compute cumulative proceeds (most recent first, so reverse to sum, then reverse back)
    {
      let cum = TOTAL_STRC_PROCEEDS;
      for (const evt of confirmedEvents) {
        evt.cumulative_proceeds = cum;
        cum -= evt.proceeds_usd;
      }
    }

    // Add estimated issuance since last confirmed filing
    const lastConfirmedFiling = CONFIRMED_STRC_ATM[CONFIRMED_STRC_ATM.length - 1];
    const estimatedDaysSinceLastFiling = flywheelDays.filter(
      (d) => d.date > lastConfirmedFiling.period_end && (d.strc_issuance_estimated > 0)
    );
    const estTotalProceeds = estimatedDaysSinceLastFiling.reduce(
      (s, d) => s + d.strc_issuance_estimated * 1e6, 0
    );
    const estTotalShares = estimatedDaysSinceLastFiling.reduce(
      (s, d) => s + d.strc_shares_issued, 0
    );
    const estTotalBtc = estimatedDaysSinceLastFiling.reduce(
      (s, d) => s + d.btc_purchased, 0
    );

    const formattedEvents = [
      // Estimated running total since last filing (always first)
      ...(estTotalProceeds > 0 ? [{
        date: new Date().toISOString().slice(0, 10),
        period_start: lastConfirmedFiling.period_end,
        period_end: new Date().toISOString().slice(0, 10),
        type: "ATM" as const,
        proceeds_usd: estTotalProceeds,
        shares_issued: estTotalShares,
        avg_price: estTotalShares > 0 ? estTotalProceeds / estTotalShares : 0,
        btc_purchased: estTotalBtc,
        avg_btc_price: estTotalBtc > 0 ? estTotalProceeds / estTotalBtc : 0,
        is_estimated: true,
        cumulative_proceeds: TOTAL_STRC_PROCEEDS + estTotalProceeds,
      }] : []),
      // Confirmed filings (most recent first)
      ...confirmedEvents,
    ];

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

    const participationLow = dbCalibration
      ? parseFloat(dbCalibration.participationRateLow ?? "0")
      : 0;
    const participationHigh = dbCalibration
      ? parseFloat(dbCalibration.participationRateHigh ?? "0")
      : 0;

    const remaining = strcAtmAuthorized - strcAtmDeployed;
    const estDaysToExhaustion = pace30d > 0 ? Math.floor((remaining / pace30d) * 30) : 999;

    return NextResponse.json({
      volume_history: volumeHistory,
      cumulative_atm: cumulativeAtm,
      atm_events: formattedEvents,
      flywheel_days: flywheelDays,
      kpi: {
        strc_volume_today: volToday,
        strc_volume_avg_5d: volAvg5d,
        strc_volume_avg_20d: volAvg20d,
        strc_volume_ratio: volAvg20d > 0 ? volToday / volAvg20d : 0,
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
        participation_rate_current: calibration.rate,
        participation_rate_source: calibration.source,
        participation_rate_range: [participationLow, participationHigh],
        est_days_to_exhaustion: estDaysToExhaustion,
        // Flywheel-derived KPIs
        flywheel_estimated_btc: flywheelResult?.estimatedBtcHoldings ?? null,
        flywheel_estimated_mnav: flywheelResult?.estimatedMnav ?? null,
        flywheel_estimated_pref_notional: flywheelResult?.estimatedTotalPrefNotional ?? null,
      },
      last_updated: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(EMPTY_RESPONSE("error"));
  }
}
