/**
 * Unified Issuance & BTC Forecast Engine
 *
 * SINGLE SOURCE OF TRUTH for all estimation between 8-K filings.
 * Every parameter is derived directly from confirmed SEC 8-K data.
 * No assumed participation rates. No mock-data calibration.
 *
 * Key 8-K-derived findings:
 *   - Implied STRC price: ~$99.88 (near par)
 *   - Conversion rate: ~100% (all proceeds → BTC)
 *   - STRC is ~75% of total proceeds, MSTR ~25%
 *   - Daily pace is highly variable ($1.4M–$236M/day)
 *
 * Estimation chain:
 *   Confirmed 8-K data → weighted daily pace → go-forward forecast →
 *   estimated BTC holdings → mNAV, coverage ratio
 *
 * Consumers:
 *   - app/api/data/snapshot/route.ts (KPI cards: mNAV, BTC holdings, coverage)
 *   - VolumeATMTracker.tsx (ATM estimation bars + KPIs)
 *   - BtcPurchaseChart.tsx (BTC accumulation estimates)
 *   - flywheel-forecast.ts (calibrated default rates)
 */

import {
  CONFIRMED_ATM_PERIODS,
  type ConfirmedAtmPeriod,
  LATEST_ATM_PERIOD_END,
  LATEST_CONFIRMED_BTC_FROM_ATM,
} from "@/src/lib/data/confirmed-atm-all";

import {
  CONFIRMED_STRC_ATM_EVENTS,
} from "@/src/lib/data/confirmed-strc-atm";

import {
  LATEST_CONFIRMED_BTC,
} from "@/src/lib/data/confirmed-purchases";

import {
  ATM_DEPLOYED,
  CURRENT_PREF_NOTIONAL,
} from "@/src/lib/data/capital-structure";

// ── Types ───────────────────────────────────────────────────────────

export interface PeriodMetrics {
  filed: string;
  period_start: string;
  period_end: string;
  trading_days: number;
  strc_shares: number;
  strc_proceeds: number;
  strc_daily_proceeds: number;
  implied_strc_price: number;
  mstr_proceeds: number;
  mstr_daily_proceeds: number;
  total_proceeds: number;
  total_daily_proceeds: number;
  btc_purchased: number;
  btc_daily: number;
  avg_btc_price: number;
  btc_cost: number;
  /** btc_cost / total_proceeds — confirmed ~100% */
  conversion_rate: number;
  cumulative_btc: number;
}

export interface IssuancePace {
  /** Weighted average daily STRC proceeds ($) */
  strc_daily: number;
  /** Weighted average daily MSTR proceeds ($) */
  mstr_daily: number;
  /** Weighted average daily total proceeds ($) */
  total_daily: number;
  /** Weighted average daily BTC purchased (at historical prices) */
  btc_daily_historical: number;
  /** Confirmed conversion rate (proceeds → BTC cost) */
  conversion_rate: number;
  /** Number of 8-K periods used */
  periods_used: number;
  /** Total trading days covered */
  trading_days_covered: number;
  /** STRC share of total proceeds (0-1) */
  strc_share: number;
}

export interface BtcForecast {
  /** Last confirmed BTC holdings from 8-K */
  confirmed_btc: number;
  /** Date of last confirmed 8-K period end */
  confirmed_date: string;
  /** Trading days since last confirmed period */
  forecast_days: number;
  /** Estimated BTC accumulated since last 8-K */
  estimated_btc_since: number;
  /** Total estimated BTC holdings */
  total_estimated_btc: number;
  /** Estimated daily total proceeds used for forecast */
  daily_total_pace: number;
  /** Estimated daily STRC proceeds used for forecast */
  daily_strc_pace: number;
  /** Estimated STRC ATM deployed (base + forecast issuance) */
  estimated_strc_atm_deployed: number;
  /** Estimated total preferred notional (base + forecast STRC issuance) */
  estimated_pref_notional: number;
  /** Conversion rate used (from 8-K data) */
  conversion_rate: number;
  /** Confidence score (0-100) */
  confidence: number;
  /** Confidence label */
  confidence_label: string;
}

export interface DailyEstimate {
  date: string;
  /** STRC ATM proceeds for this day ($) */
  strc_proceeds: number;
  /** Total ATM proceeds for this day ($) */
  total_proceeds: number;
  /** Estimated BTC purchased this day */
  btc_estimate: number;
  /** Data source */
  source: "confirmed" | "estimated";
}

export interface PaceBacktestResult {
  periods: number;
  /** Mean absolute percentage error */
  mape: number;
  /** Average directional bias (positive = overestimate) */
  bias: number;
  /** Confidence score derived from MAPE */
  confidence: number;
  period_results: Array<{
    period_end: string;
    actual_btc: number;
    predicted_btc: number;
    error_pct: number;
  }>;
}

// ── Utilities ───────────────────────────────────────────────────────

/**
 * Count trading days (weekdays) between two dates inclusive.
 * Does not account for US market holidays (typically 0-1 per period).
 */
export function countTradingDays(start: string, end: string): number {
  let count = 0;
  const d = new Date(start + "T12:00:00Z");
  const endDate = new Date(end + "T12:00:00Z");
  while (d <= endDate) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return Math.max(1, count);
}

/**
 * Count trading days from the day after a given date through today.
 */
export function tradingDaysSince(dateStr: string): number {
  const today = new Date().toISOString().slice(0, 10);
  if (today <= dateStr) return 0;
  const nextDay = new Date(dateStr + "T12:00:00Z");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return countTradingDays(nextDay.toISOString().slice(0, 10), today);
}

// ── Core: Period Metrics from 8-K Data ──────────────────────────────

// Cache: computed once, reused
let _cachedMetrics: PeriodMetrics[] | null = null;

/**
 * Build unified period metrics from all confirmed 8-K sources.
 *
 * Merges confirmed-atm-all (multi-instrument, has MSTR data) with
 * confirmed-strc-atm (STRC-only, covers older periods like Nov 2025).
 *
 * Returns chronologically sorted (oldest first).
 */
export function getConfirmedPeriodMetrics(): PeriodMetrics[] {
  if (_cachedMetrics) return _cachedMetrics;

  const allPeriodEnds = new Set(
    CONFIRMED_ATM_PERIODS.map((p) => p.period_end),
  );

  const fromAll: PeriodMetrics[] = CONFIRMED_ATM_PERIODS.map((p) => {
    const days = countTradingDays(p.period_start, p.period_end);
    const strc = p.instruments.find((i) => i.ticker === "STRC");
    const mstr = p.instruments.find((i) => i.ticker === "MSTR");
    const strcProceeds = strc?.net_proceeds ?? 0;
    const mstrProceeds = mstr?.net_proceeds ?? 0;
    const totalProceeds = strcProceeds + mstrProceeds;

    return {
      filed: p.filed,
      period_start: p.period_start,
      period_end: p.period_end,
      trading_days: days,
      strc_shares: strc?.shares_sold ?? 0,
      strc_proceeds: strcProceeds,
      strc_daily_proceeds: strcProceeds / days,
      implied_strc_price:
        (strc?.shares_sold ?? 0) > 0
          ? strcProceeds / strc!.shares_sold
          : 100,
      mstr_proceeds: mstrProceeds,
      mstr_daily_proceeds: mstrProceeds / days,
      total_proceeds: totalProceeds,
      total_daily_proceeds: totalProceeds / days,
      btc_purchased: p.btc_purchased,
      btc_daily: p.btc_purchased / days,
      avg_btc_price: p.avg_btc_price,
      btc_cost: p.btc_cost,
      conversion_rate:
        totalProceeds > 0 ? p.btc_cost / totalProceeds : 1.0,
      cumulative_btc: p.cumulative_btc,
    };
  });

  // Add STRC-only periods not covered by confirmed-atm-all (Nov 2025)
  const fromStrcOnly: PeriodMetrics[] = CONFIRMED_STRC_ATM_EVENTS.filter(
    (e) => !allPeriodEnds.has(e.period_end),
  ).map((e) => {
    const days = countTradingDays(e.period_start, e.period_end);
    const btcCost = e.btc_purchased * e.avg_btc_price;
    return {
      filed: e.filed,
      period_start: e.period_start,
      period_end: e.period_end,
      trading_days: days,
      strc_shares: e.shares_sold,
      strc_proceeds: e.net_proceeds,
      strc_daily_proceeds: e.net_proceeds / days,
      implied_strc_price:
        e.shares_sold > 0 ? e.net_proceeds / e.shares_sold : 100,
      mstr_proceeds: 0,
      mstr_daily_proceeds: 0,
      total_proceeds: e.net_proceeds,
      total_daily_proceeds: e.net_proceeds / days,
      btc_purchased: e.btc_purchased,
      btc_daily: e.btc_purchased / days,
      avg_btc_price: e.avg_btc_price,
      btc_cost: btcCost,
      conversion_rate:
        e.net_proceeds > 0 ? btcCost / e.net_proceeds : 1.0,
      cumulative_btc: 0,
    };
  });

  _cachedMetrics = [...fromAll, ...fromStrcOnly].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
  return _cachedMetrics;
}

// ── Core: Weighted Issuance Pace ────────────────────────────────────

/**
 * Exponential decay factor for pace weighting.
 * 0.65 means each older period retains 65% of the next period's weight.
 * The 3 most recent periods contribute ~70% of the weighted result.
 */
const PACE_DECAY = 0.65;

/**
 * Compute exponentially-weighted daily issuance pace from confirmed 8-K data.
 *
 * More recent periods carry more weight. Weight also scales by trading days
 * in the period (longer periods = more statistically significant).
 *
 * @param lookbackPeriods - Max number of recent periods (default: all)
 */
export function getWeightedDailyPace(lookbackPeriods?: number): IssuancePace {
  const metrics = getConfirmedPeriodMetrics();
  if (metrics.length === 0) {
    return {
      strc_daily: 0,
      mstr_daily: 0,
      total_daily: 0,
      btc_daily_historical: 0,
      conversion_rate: 1.0,
      periods_used: 0,
      trading_days_covered: 0,
      strc_share: 1.0,
    };
  }

  // Take the most recent N periods (metrics is sorted oldest-first)
  const recent = lookbackPeriods
    ? metrics.slice(-lookbackPeriods)
    : metrics;

  const n = recent.length;
  let totalWeight = 0;
  let wStrc = 0;
  let wMstr = 0;
  let wTotal = 0;
  let wBtc = 0;
  let wConv = 0;
  let totalDays = 0;
  let totalStrcProceeds = 0;
  let totalAllProceeds = 0;

  for (let i = 0; i < n; i++) {
    const rank = n - 1 - i; // 0 for most recent
    const m = recent[i];
    const weight = m.trading_days * Math.pow(PACE_DECAY, rank);

    totalWeight += weight;
    wStrc += m.strc_daily_proceeds * weight;
    wMstr += m.mstr_daily_proceeds * weight;
    wTotal += m.total_daily_proceeds * weight;
    wBtc += m.btc_daily * weight;
    wConv += m.conversion_rate * weight;
    totalDays += m.trading_days;
    totalStrcProceeds += m.strc_proceeds;
    totalAllProceeds += m.total_proceeds;
  }

  return {
    strc_daily: totalWeight > 0 ? wStrc / totalWeight : 0,
    mstr_daily: totalWeight > 0 ? wMstr / totalWeight : 0,
    total_daily: totalWeight > 0 ? wTotal / totalWeight : 0,
    btc_daily_historical: totalWeight > 0 ? wBtc / totalWeight : 0,
    conversion_rate: totalWeight > 0 ? wConv / totalWeight : 1.0,
    periods_used: n,
    trading_days_covered: totalDays,
    strc_share:
      totalAllProceeds > 0 ? totalStrcProceeds / totalAllProceeds : 1.0,
  };
}

// ── Core: BTC Holdings Forecast ─────────────────────────────────────

/**
 * Estimate current BTC holdings from confirmed 8-K baseline +
 * go-forward projection using weighted daily pace.
 *
 * This is the CANONICAL function for BTC holdings estimation.
 * Every consumer (snapshot, charts, flywheel) should use this.
 *
 * @param btcPrice - Current BTC price (for converting proceeds to BTC/day)
 */
export function forecastBtcHoldings(btcPrice: number): BtcForecast {
  const confirmedBtc = LATEST_CONFIRMED_BTC_FROM_ATM;
  const confirmedDate = LATEST_ATM_PERIOD_END;
  const forecastDays = tradingDaysSince(confirmedDate);
  const pace = getWeightedDailyPace();

  // Estimate BTC accumulated since last 8-K:
  //   daily_total_proceeds × conversion_rate / btc_price × forecast_days
  const dailyBtcAtCurrentPrice =
    btcPrice > 0
      ? (pace.total_daily * pace.conversion_rate) / btcPrice
      : 0;
  const estimatedBtcSince = dailyBtcAtCurrentPrice * forecastDays;

  // Estimate STRC ATM deployed increase since last 8-K
  // STRC issues at ~$99.88 → $100 par, so proceeds ≈ notional increase
  const strcNotionalIncrease = pace.strc_daily * forecastDays;
  const estimatedStrcAtmDeployed = ATM_DEPLOYED.STRC + strcNotionalIncrease;
  const estimatedPrefNotional = CURRENT_PREF_NOTIONAL + strcNotionalIncrease;

  // Confidence decays with forecast days
  // 0 days = 100%, each day = -3%, floor at 40%
  const confidence = Math.max(40, Math.round(100 - forecastDays * 3));

  return {
    confirmed_btc: confirmedBtc,
    confirmed_date: confirmedDate,
    forecast_days: forecastDays,
    estimated_btc_since: Math.round(estimatedBtcSince),
    total_estimated_btc: confirmedBtc + Math.round(estimatedBtcSince),
    daily_total_pace: pace.total_daily,
    daily_strc_pace: pace.strc_daily,
    estimated_strc_atm_deployed: estimatedStrcAtmDeployed,
    estimated_pref_notional: estimatedPrefNotional,
    conversion_rate: pace.conversion_rate,
    confidence,
    confidence_label:
      confidence >= 80
        ? "High"
        : confidence >= 50
          ? "Moderate"
          : "Low",
  };
}

// ── Core: Daily Estimates (for chart components) ────────────────────

/**
 * Generate daily ATM + BTC estimates for a date range.
 *
 * For days within confirmed 8-K periods: allocates the period total
 * equally across trading days in the period.
 *
 * For days after the last confirmed period: uses weighted daily pace.
 *
 * @param startDate - Start of range (inclusive, YYYY-MM-DD)
 * @param endDate   - End of range (inclusive, YYYY-MM-DD)
 * @param btcPrice  - Current BTC price for converting proceeds to BTC
 */
export function getDailyEstimates(
  startDate: string,
  endDate: string,
  btcPrice: number,
): DailyEstimate[] {
  const metrics = getConfirmedPeriodMetrics();
  const pace = getWeightedDailyPace();
  const result: DailyEstimate[] = [];

  const d = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");

  while (d <= end) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      const dateStr = d.toISOString().slice(0, 10);

      // Check if this day falls in a confirmed 8-K period
      const period = metrics.find(
        (m) => dateStr >= m.period_start && dateStr <= m.period_end,
      );

      if (period) {
        result.push({
          date: dateStr,
          strc_proceeds: period.strc_daily_proceeds,
          total_proceeds: period.total_daily_proceeds,
          btc_estimate: period.btc_daily,
          source: "confirmed",
        });
      } else if (dateStr > LATEST_ATM_PERIOD_END) {
        // After last confirmed period: use pace projection
        const dailyBtc =
          btcPrice > 0
            ? (pace.total_daily * pace.conversion_rate) / btcPrice
            : 0;
        result.push({
          date: dateStr,
          strc_proceeds: pace.strc_daily,
          total_proceeds: pace.total_daily,
          btc_estimate: dailyBtc,
          source: "estimated",
        });
      }
      // Days in gaps between confirmed periods: no estimate
      // (issuance may or may not have occurred)
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return result;
}

// ── Cross-Validation: Pace Model Backtest ───────────────────────────

/**
 * Leave-one-out cross-validation of the pace-based forecast model.
 *
 * For each confirmed 8-K period:
 * 1. Compute the average daily BTC from all OTHER periods
 * 2. Predict this period's BTC as: avg_daily_btc × trading_days
 * 3. Compare against actual BTC purchased
 *
 * This measures how well the 8-K pace model predicts future outcomes,
 * honestly reflecting the extreme variability in issuance volume.
 */
export function backtestPaceModel(): PaceBacktestResult {
  const allMetrics = getConfirmedPeriodMetrics();
  if (allMetrics.length < 3) {
    return {
      periods: 0,
      mape: 0,
      bias: 0,
      confidence: 0,
      period_results: [],
    };
  }

  const results: PaceBacktestResult["period_results"] = [];

  for (let i = 0; i < allMetrics.length; i++) {
    const target = allMetrics[i];
    const others = allMetrics.filter((_, j) => j !== i);

    // Average daily BTC from other periods (simple, no recency weighting
    // because in cross-validation we treat all training data equally)
    const totalDays = others.reduce((s, m) => s + m.trading_days, 0);
    const totalBtc = others.reduce((s, m) => s + m.btc_purchased, 0);
    const avgDailyBtc = totalDays > 0 ? totalBtc / totalDays : 0;

    const predictedBtc = avgDailyBtc * target.trading_days;
    const errorPct =
      target.btc_purchased > 0
        ? ((predictedBtc - target.btc_purchased) / target.btc_purchased) * 100
        : 0;

    results.push({
      period_end: target.period_end,
      actual_btc: target.btc_purchased,
      predicted_btc: Math.round(predictedBtc),
      error_pct: parseFloat(errorPct.toFixed(1)),
    });
  }

  const n = results.length;
  const mape =
    results.reduce((s, r) => s + Math.abs(r.error_pct), 0) / n;
  const bias = results.reduce((s, r) => s + r.error_pct, 0) / n;

  // Confidence driven by MAPE. With high variability in issuance,
  // MAPE will be high and confidence will be honestly low.
  const confidence = Math.max(0, Math.round(100 - mape * 0.5));

  return {
    periods: n,
    mape: parseFloat(mape.toFixed(1)),
    bias: parseFloat(bias.toFixed(1)),
    confidence,
    period_results: results,
  };
}

// ── Recency-Weighted Participation Rate Calibration ─────────────────

export interface ParticipationCalibration {
  /** Recency-weighted participation rate */
  rate: number;
  /** Per-period breakdown */
  perPeriodRates: Array<{
    period_end: string;
    rate: number;
    weight: number;
    shares: number;
    volume: number;
  }>;
  /** Number of periods with volume data */
  periodsUsed: number;
  /** Source of the rate */
  source: "calibrated" | "management_guidance" | "pace_fallback";
}

/** Module-level cache for participation rate */
let _cachedParticipation: ParticipationCalibration | null = null;
let _participationCacheKey = "";

/**
 * Calibrate STRC participation rate with recency weighting.
 *
 * For each confirmed 8-K period:
 *   per_period_rate = shares_sold / sum(daily_strc_volume)
 *
 * Periods are weighted by PACE_DECAY^rank (most recent = rank 0).
 * Returns weighted average across all periods with volume data.
 *
 * Falls back to management guidance (25%) if insufficient data.
 */
export function calibrateParticipationRate(
  volumeHistory: Array<{ date: string; strc_volume: number; strc_price: number }>,
): ParticipationCalibration {
  // Cache key: length + first/last date + volume sum (detects value changes)
  const volSum = volumeHistory.reduce((s, v) => s + v.strc_volume, 0);
  const cacheKey = `${volumeHistory.length}:${volumeHistory[0]?.date}:${volumeHistory[volumeHistory.length - 1]?.date}:${volSum}`;
  if (_cachedParticipation && _participationCacheKey === cacheKey) {
    return _cachedParticipation;
  }

  if (volumeHistory.length === 0) {
    return { rate: 0.25, perPeriodRates: [], periodsUsed: 0, source: "management_guidance" };
  }

  const metrics = getConfirmedPeriodMetrics();
  const perPeriod: ParticipationCalibration["perPeriodRates"] = [];

  for (const m of metrics) {
    if (m.strc_shares === 0) continue;

    const periodVols = volumeHistory.filter(
      (v) => v.date >= m.period_start && v.date <= m.period_end,
    );
    const totalVolume = periodVols.reduce((s, v) => s + v.strc_volume, 0);

    if (totalVolume > 0) {
      perPeriod.push({
        period_end: m.period_end,
        rate: m.strc_shares / totalVolume,
        weight: 0, // computed below
        shares: m.strc_shares,
        volume: totalVolume,
      });
    }
  }

  // Need at least 2 periods for meaningful calibration
  if (perPeriod.length < 2) {
    return { rate: 0.25, perPeriodRates: perPeriod, periodsUsed: perPeriod.length, source: "management_guidance" };
  }

  // Sort oldest-first, then apply recency weights
  perPeriod.sort((a, b) => a.period_end.localeCompare(b.period_end));
  const n = perPeriod.length;
  let totalWeight = 0;
  let weightedRate = 0;

  for (let i = 0; i < n; i++) {
    const rank = n - 1 - i; // 0 for most recent
    const w = Math.pow(PACE_DECAY, rank);
    perPeriod[i].weight = w;
    weightedRate += perPeriod[i].rate * w;
    totalWeight += w;
  }

  const rate = totalWeight > 0 ? weightedRate / totalWeight : 0.25;

  const result: ParticipationCalibration = {
    rate,
    perPeriodRates: perPeriod,
    periodsUsed: perPeriod.length,
    source: "calibrated",
  };

  _cachedParticipation = result;
  _participationCacheKey = cacheKey;
  return result;
}

// ── Volume-Weighted 8-K Reconciliation ──────────────────────────────

export interface VolumeAllocatedDay {
  date: string;
  strc_shares: number;
  strc_proceeds: number;
  btc_estimate: number;
}

/**
 * Allocate a confirmed 8-K period's totals proportionally to daily volume.
 *
 * Instead of spreading evenly across trading days, each day gets a share
 * proportional to its trading volume:
 *   day_shares = period.strc_shares × (day_volume / total_period_volume)
 */
export function allocateByVolume(
  period: PeriodMetrics,
  dailyVolumes: Array<{ date: string; strc_volume: number }>,
): VolumeAllocatedDay[] {
  const periodVols = dailyVolumes.filter(
    (v) => v.date >= period.period_start && v.date <= period.period_end && v.strc_volume > 0,
  );

  if (periodVols.length === 0) {
    // Fallback: even spread across trading days
    const days = countTradingDays(period.period_start, period.period_end);
    const result: VolumeAllocatedDay[] = [];
    const d = new Date(period.period_start + "T12:00:00Z");
    const end = new Date(period.period_end + "T12:00:00Z");
    while (d <= end) {
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
        result.push({
          date: d.toISOString().slice(0, 10),
          strc_shares: period.strc_shares / days,
          strc_proceeds: period.strc_proceeds / days,
          btc_estimate: period.btc_purchased / days,
        });
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return result;
  }

  const totalVolume = periodVols.reduce((s, v) => s + v.strc_volume, 0);

  return periodVols.map((v) => {
    const fraction = v.strc_volume / totalVolume;
    return {
      date: v.date,
      strc_shares: period.strc_shares * fraction,
      strc_proceeds: period.strc_proceeds * fraction,
      btc_estimate: period.btc_purchased * fraction,
    };
  });
}

/**
 * Summary stats for display in methodology sections.
 */
export function getEngineSummary() {
  const metrics = getConfirmedPeriodMetrics();
  const pace = getWeightedDailyPace();
  const backtest = backtestPaceModel();

  const totalProceeds = metrics.reduce((s, m) => s + m.total_proceeds, 0);
  const totalBtc = metrics.reduce((s, m) => s + m.btc_purchased, 0);
  const totalDays = metrics.reduce((s, m) => s + m.trading_days, 0);

  return {
    periods: metrics.length,
    total_proceeds: totalProceeds,
    total_btc: totalBtc,
    total_trading_days: totalDays,
    simple_avg_daily_proceeds: totalDays > 0 ? totalProceeds / totalDays : 0,
    simple_avg_daily_btc: totalDays > 0 ? totalBtc / totalDays : 0,
    weighted_daily_pace: pace.total_daily,
    weighted_daily_btc: pace.btc_daily_historical,
    conversion_rate: pace.conversion_rate,
    strc_share: pace.strc_share,
    backtest_mape: backtest.mape,
    backtest_confidence: backtest.confidence,
    latest_confirmed_btc: LATEST_CONFIRMED_BTC_FROM_ATM,
    latest_confirmed_date: LATEST_ATM_PERIOD_END,
  };
}
