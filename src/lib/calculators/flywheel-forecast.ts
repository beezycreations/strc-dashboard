/**
 * Flywheel Forecast Engine
 *
 * Estimates real-time BTC holdings and share issuance between 8-K releases.
 * STRC is the primary issuance instrument — preferred proceeds go 100% to BTC.
 * MSTR common issuance targets 1.25× the cumulative dividend liability from STRC
 * (dividend coverage + 25% surplus for BTC), subject to the mNAV governor.
 *
 * Resolves the circular dependency day-by-day:
 *   mNAV → MSTR issuance decision → proceeds → BTC purchased →
 *   update BTC Reserve → recalculate mNAV → next day
 */

import {
  CONFIRMED_ATM_PERIODS,
} from "@/src/lib/data/confirmed-atm-all";
import {
  CURRENT_PREF_NOTIONAL,
  ANNUAL_OBLIGATIONS,
  ATM_AUTHORIZED,
  ATM_REMAINING,
  computeMnav as computeMnavShared,
} from "@/src/lib/data/capital-structure";
import {
  calibrateParticipationRate,
  type ParticipationCalibration,
} from "@/src/lib/calculators/issuance-engine";

// ── Default participation rates ──────────────────────────────────────
// What fraction of daily STRC volume is ATM issuance (new shares being sold).
// The STRC rate of 25% reflects MSTR management guidance.
// MSTR issuance is NOT volume-based — it's demand-driven by dividend liability.
const DEFAULT_PARTICIPATION_RATES: Record<string, number> = {
  STRC: 0.25,  // ~25% of STRC volume — per MSTR management guidance
};

// ── MSTR common issuance model ────────────────────────────────────────
// MSTR issues enough common equity to:
//   1. Cover the growing dividend liability from STRC issuance (cumulative)
//   2. Plus 25% extra for additional BTC purchases
// Subject to mNAV governor: if mNAV too low, issuance is reduced/halted.
const MSTR_BTC_SURPLUS_RATE = 0.25; // 25% extra above dividend coverage → BTC
const MSTR_MNAV_THRESHOLD = 1.0;   // MSTR issues shares anytime mNAV > 1.0× (above NAV)

/** Wrapper around shared computeMnav that accepts the flywheel's calling convention */
function computeMnav(params: {
  mstrMarketCap: number;
  btcHoldings: number;
  btcPrice: number;
  totalPrefNotional?: number;
}): number {
  return computeMnavShared({
    mstrMarketCap: params.mstrMarketCap,
    btcHoldings: params.btcHoldings,
    btcPrice: params.btcPrice,
    prefNotionalOverride: params.totalPrefNotional,
  });
}

// ── Interfaces ───────────────────────────────────────────────────────

export interface FlywheelBaseline {
  /** Last confirmed BTC holdings from 8-K */
  btcHoldings: number;
  /** Date the confirmed period ended (forecast starts day after) */
  periodEnd: string;
  /** STRC ATM deployed (notional) at baseline */
  strcAtmDeployed: number;
  /** MSTR ATM deployed at baseline */
  mstrAtmDeployed: number;
  /** Preferred notional at baseline (adjusts with new STRC issuance) */
  totalPrefNotional: number;
}

export interface DayMarketData {
  date: string;
  btcPrice: number;
  strcPrice: number;
  strcVolume: number;
  mstrPrice: number;
  mstrVolume: number;
  mstrSharesOutstanding: number;
}

export interface DayForecast {
  date: string;
  /** Estimated STRC ATM proceeds for this day */
  strcProceeds: number;
  /** Estimated STRC shares issued this day */
  strcSharesIssued: number;
  /** Estimated MSTR common proceeds for this day */
  mstrProceeds: number;
  /** Estimated MSTR shares issued this day */
  mstrSharesIssued: number;
  /** MSTR proceeds allocated to dividends */
  mstrDividendAlloc: number;
  /** Total proceeds allocated to BTC purchases */
  btcPurchaseProceeds: number;
  /** Estimated BTC purchased this day */
  btcPurchased: number;
  /** Cumulative BTC holdings at end of day */
  cumulativeBtc: number;
  /** mNAV at end of day (after purchases) */
  mnav: number;
  /** Running STRC ATM deployed */
  strcAtmDeployed: number;
  /** Running preferred notional */
  totalPrefNotional: number;
  /** Running annual dividend liability */
  annualDividendLiability: number;
  /** Data source: confirmed (8-K reconciled) or estimated (volume × rate) */
  source: "confirmed" | "estimated";
}

export interface FlywheelForecastResult {
  baseline: FlywheelBaseline;
  days: DayForecast[];
  /** Current estimated BTC holdings (baseline + forecast) */
  estimatedBtcHoldings: number;
  /** Current estimated STRC ATM deployed */
  estimatedStrcAtmDeployed: number;
  /** Current estimated total preferred notional */
  estimatedTotalPrefNotional: number;
  /** Current mNAV estimate */
  estimatedMnav: number;
  /** Confidence: lower if more days since last 8-K */
  confidence: number;
  /** Participation rate used for STRC estimation */
  participationRate: number;
  /** Source of the participation rate */
  participationSource: "calibrated" | "management_guidance" | "pace_fallback";
}

// ── Core forecast engine ─────────────────────────────────────────────

/**
 * Get baseline from most recent confirmed 8-K period.
 */
export function getBaseline(): FlywheelBaseline {
  const latest = CONFIRMED_ATM_PERIODS[0];
  const strcDeployed = ATM_AUTHORIZED.STRC - ATM_REMAINING.STRC;
  const mstrDeployed = ATM_AUTHORIZED.MSTR - ATM_REMAINING.MSTR;

  return {
    btcHoldings: latest.cumulative_btc,
    periodEnd: latest.period_end,
    strcAtmDeployed: strcDeployed,
    mstrAtmDeployed: mstrDeployed,
    totalPrefNotional: CURRENT_PREF_NOTIONAL,
  };
}

/**
 * mNAV governor for MSTR common equity issuance.
 * MSTR issues shares anytime mNAV > 1.0× (trading above NAV).
 * Below 1.0×: halt — issuing equity below NAV is dilutive.
 */
function mnavGovernor(mnav: number): number {
  return mnav > MSTR_MNAV_THRESHOLD ? 1.0 : 0.0;
}

/**
 * Run the flywheel forecast from the last confirmed 8-K through provided market data.
 *
 * @param marketData - Array of daily market data, sorted oldest-first,
 *   covering each trading day since the last 8-K period end.
 * @param participationRates - Optional overrides for participation rates.
 *   Defaults to DEFAULT_PARTICIPATION_RATES.
 * @param options.confirmedDays - Set of dates that are confirmed (from 8-K reconciliation).
 *   Days in this set will be tagged source: "confirmed".
 * @param options.participationCalibration - Pre-computed calibration result for metadata.
 */
export function runForecast(
  marketData: DayMarketData[],
  participationRates?: Partial<Record<string, number>>,
  options?: {
    confirmedDays?: Set<string>;
    participationCalibration?: ParticipationCalibration;
  },
): FlywheelForecastResult {
  const baseline = getBaseline();
  const rates = { ...DEFAULT_PARTICIPATION_RATES, ...participationRates };
  const confirmedDays = options?.confirmedDays ?? new Set<string>();
  const calibration = options?.participationCalibration;

  let btcHoldings = baseline.btcHoldings;
  let strcAtmDeployed = baseline.strcAtmDeployed;
  let totalPrefNotional = baseline.totalPrefNotional;
  let currentMnav = 0;
  // Track only INCREMENTAL dividend liability from NEW STRC issuance during forecast.
  // Base obligations ($888M) are funded by existing cash reserves — not MSTR's problem here.
  // This grows cumulatively as STRC shares are issued each day.
  let cumulativeIncrementalDividend = 0;
  // Track cumulative MSTR proceeds raised so far to handle catch-up
  let cumulativeMstrRaised = 0;
  // Keep annualDividendLiability for reporting (base + incremental)
  let annualDividendLiability = ANNUAL_OBLIGATIONS;

  const days: DayForecast[] = [];

  for (const day of marketData) {
    const isConfirmed = confirmedDays.has(day.date);

    // ── Step 1: Estimate STRC ATM proceeds ──
    // STRC is the primary driver — participation rate × volume × price
    const strcParticipation = rates.STRC ?? DEFAULT_PARTICIPATION_RATES.STRC;
    const strcSharesSold = Math.round(day.strcVolume * strcParticipation);
    const strcProceeds = strcSharesSold * day.strcPrice;

    // All preferred proceeds → 100% BTC purchases
    let btcPurchaseProceeds = strcProceeds;

    // Update STRC notional (shares × $100 par)
    const strcNotionalIncrease = strcSharesSold * 100;
    strcAtmDeployed += strcNotionalIncrease;
    totalPrefNotional += strcNotionalIncrease;

    // ── Step 2: MSTR common issuance — covers INCREMENTAL dividend liability ──
    //
    // Each day's new STRC issuance creates an annual dividend obligation:
    //   annual_dividend = new_notional × 11.25%
    //
    // MSTR raises 1.25× that amount (dividend + 25% surplus for BTC).
    // ALL MSTR issuance is subject to the mNAV governor — dividend coverage
    // is cumulative but MSTR can delay when mNAV is unfavorable.
    // Tracked cumulatively so MSTR catches up when conditions improve.
    const todaysDividendIncrement = strcNotionalIncrease * 0.1125;
    cumulativeIncrementalDividend += todaysDividendIncrement;
    annualDividendLiability += todaysDividendIncrement;

    // Compute mNAV for governor
    const mstrMarketCap = day.mstrSharesOutstanding * day.mstrPrice;
    currentMnav = computeMnav({
      mstrMarketCap,
      btcHoldings,
      btcPrice: day.btcPrice,
      totalPrefNotional,
    });

    // mNAV governor: MSTR issues anytime mNAV > 1.0×.
    // MSTR raises 1.25× the cumulative dividend liability:
    //   - 1.0× covers dividends
    //   - 0.25× surplus goes ENTIRELY to BTC purchases
    // The 25% surplus IS the BTC component — that's the whole point of the flywheel.
    const governor = mnavGovernor(currentMnav);
    const cumulativeMstrTarget =
      cumulativeIncrementalDividend * (1 + MSTR_BTC_SURPLUS_RATE) * governor;
    const mstrProceedsNeeded = Math.max(0, cumulativeMstrTarget - cumulativeMstrRaised);
    const mstrSharesSold = day.mstrPrice > 0
      ? Math.round(mstrProceedsNeeded / day.mstrPrice)
      : 0;
    const mstrProceeds = mstrSharesSold * day.mstrPrice;
    cumulativeMstrRaised += mstrProceeds;

    // Allocate: dividend coverage is 1.0× of incremental liability,
    // the 25% surplus goes entirely to BTC purchases.
    const mstrDividendAlloc = Math.min(mstrProceeds, todaysDividendIncrement);
    const mstrBtcAlloc = todaysDividendIncrement * MSTR_BTC_SURPLUS_RATE * governor;
    btcPurchaseProceeds += mstrBtcAlloc;

    // ── Step 4: BTC purchases ──
    const btcPurchased =
      day.btcPrice > 0 ? btcPurchaseProceeds / day.btcPrice : 0;
    btcHoldings += btcPurchased;

    // ── Step 5: Recalculate mNAV after purchases ──
    currentMnav = computeMnav({
      mstrMarketCap,
      btcHoldings,
      btcPrice: day.btcPrice,
      totalPrefNotional,
    });

    days.push({
      date: day.date,
      strcProceeds,
      strcSharesIssued: strcSharesSold,
      mstrProceeds,
      mstrSharesIssued: mstrSharesSold,
      mstrDividendAlloc,
      btcPurchaseProceeds,
      btcPurchased,
      cumulativeBtc: btcHoldings,
      mnav: parseFloat(currentMnav.toFixed(4)),
      strcAtmDeployed,
      totalPrefNotional,
      annualDividendLiability,
      source: isConfirmed ? "confirmed" : "estimated",
    });
  }

  // Confidence decays with more forecast days (fewer actuals to anchor on)
  const forecastDays = days.length;
  const confidence = Math.max(0.5, 1 - forecastDays * 0.02); // -2% per day, floor at 50%

  return {
    baseline,
    days,
    estimatedBtcHoldings: btcHoldings,
    estimatedStrcAtmDeployed: strcAtmDeployed,
    estimatedTotalPrefNotional: totalPrefNotional,
    estimatedMnav: currentMnav
      ? parseFloat(currentMnav.toFixed(4))
      : 0,
    confidence,
    participationRate: rates.STRC ?? DEFAULT_PARTICIPATION_RATES.STRC,
    participationSource: calibration?.source ?? "management_guidance",
  };
}

/**
 * Forecast using live and/or historical market data.
 *
 * When historicalDays is provided, the flywheel runs from the day after the
 * last 8-K through each historical day, then appends today's live data.
 * This fills the gap between the last confirmed 8-K and now.
 *
 * @param params.historicalDays - Optional array of historical daily market data
 *   from DB (covers days between last 8-K and today). If omitted, single-day forecast.
 */
export function forecastFromLiveData(params: {
  btcPrice: number;
  strcPrice: number;
  strcVolume: number;
  mstrPrice: number;
  mstrVolume: number;
  mstrSharesOutstanding: number;
  /** Override participation rates from DB calibration */
  participationRates?: Partial<Record<string, number>>;
  /** Historical daily data to backfill (sorted oldest-first) */
  historicalDays?: DayMarketData[];
  /** Participation calibration metadata */
  participationCalibration?: ParticipationCalibration;
  /** Dates that are from confirmed 8-K reconciliation */
  confirmedDays?: Set<string>;
}): FlywheelForecastResult {
  const today = new Date().toISOString().slice(0, 10);
  const baseline = getBaseline();

  // Only forecast if we're past the last confirmed period
  if (today <= baseline.periodEnd) {
    return {
      baseline,
      days: [],
      estimatedBtcHoldings: baseline.btcHoldings,
      estimatedStrcAtmDeployed: baseline.strcAtmDeployed,
      estimatedTotalPrefNotional: baseline.totalPrefNotional,
      estimatedMnav: computeMnav({
        mstrMarketCap: params.mstrSharesOutstanding * params.mstrPrice,
        btcHoldings: baseline.btcHoldings,
        btcPrice: params.btcPrice,
        totalPrefNotional: baseline.totalPrefNotional,
      }),
      confidence: 1.0,
      participationRate: params.participationRates?.STRC ?? DEFAULT_PARTICIPATION_RATES.STRC,
      participationSource: params.participationCalibration?.source ?? "management_guidance",
    };
  }

  // Build market data: historical days + today's live data
  const marketData: DayMarketData[] = [
    ...(params.historicalDays ?? []),
  ];

  // Add today if not already in historical data
  const lastHistDate = marketData[marketData.length - 1]?.date;
  if (!lastHistDate || lastHistDate < today) {
    marketData.push({
      date: today,
      btcPrice: params.btcPrice,
      strcPrice: params.strcPrice,
      strcVolume: params.strcVolume,
      mstrPrice: params.mstrPrice,
      mstrVolume: params.mstrVolume,
      mstrSharesOutstanding: params.mstrSharesOutstanding,
    });
  }

  return runForecast(marketData, params.participationRates, {
    confirmedDays: params.confirmedDays,
    participationCalibration: params.participationCalibration,
  });
}

// ── Re-exports ──────────────────────────────────────────────────────

// Participation rate calibration is consolidated in issuance-engine.ts
export { calibrateParticipationRate } from "@/src/lib/calculators/issuance-engine";
export type { ParticipationCalibration } from "@/src/lib/calculators/issuance-engine";
