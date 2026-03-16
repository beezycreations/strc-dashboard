/**
 * Flywheel Forecast Engine
 *
 * Estimates real-time BTC holdings and share issuance between 8-K releases.
 * STRC is the primary issuance instrument — preferred proceeds go 100% to BTC.
 * MSTR common issuance is secondary, driven by mNAV thresholds.
 *
 * Resolves the circular dependency day-by-day:
 *   mNAV → MSTR issuance decision → proceeds → BTC purchased →
 *   update BTC Reserve → recalculate mNAV → next day
 */

import {
  CONFIRMED_ATM_PERIODS,
  type ConfirmedAtmPeriod,
} from "@/src/lib/data/confirmed-atm-all";
import {
  CONVERT_DEBT_USD,
  CURRENT_PREF_NOTIONAL,
  CASH_BALANCE,
  ANNUAL_OBLIGATIONS,
  DAILY_OBLIGATIONS,
  ATM_AUTHORIZED,
  ATM_REMAINING,
} from "@/src/lib/data/capital-structure";

// ── Default participation rates ──────────────────────────────────────
// What fraction of daily volume is ATM issuance (new shares being sold).
//
// IMPORTANT: The preferred estimation path uses 8-K-derived daily pace
// directly (via issuance-engine.ts), NOT volume × participation rate.
// These rates are only used when the flywheel runs with per-day market
// data and real volume (e.g., future DB-backed daily forecasts).
//
// The STRC rate of 25% reflects MSTR management guidance on ATM
// participation as a fraction of daily trading volume. This should be
// updated if management commentary changes forward guidance.
// When volume data is mock/unavailable, the issuance engine's pace-based
// approach (derived directly from 8-K filings) is always preferred.
const DEFAULT_PARTICIPATION_RATES: Record<string, number> = {
  STRC: 0.25,  // ~25% of STRC volume — per MSTR management guidance
  MSTR: 0.02,  // 2% of MSTR volume — much lower for common equity
  STRK: 0.0,   // Zero recent issuance
  STRD: 0.0,   // Zero recent issuance
  STRF: 0.0,   // Zero recent issuance
};

// ── mNAV thresholds for MSTR common issuance ────────────────────────
// From Q3/Q4 2025 earnings: how aggressively to issue common stock
const MNAV_THRESHOLD_TACTICAL = 2.5; // < 2.5× → dividends only
const MNAV_THRESHOLD_OPPORTUNISTIC = 4.0; // 2.5-4× → moderate issuance
// > 4× → aggressive issuance

/**
 * Compute mNAV per Strategy methodology:
 *   mNAV = EV / BTC Reserve
 *   EV = MSTR Market Cap + Converts + Preferred Notional - Cash
 */
function computeMnav(params: {
  mstrMarketCap: number;
  btcHoldings: number;
  btcPrice: number;
  totalPrefNotional?: number;
}): number {
  const {
    mstrMarketCap,
    btcHoldings,
    btcPrice,
    totalPrefNotional = CURRENT_PREF_NOTIONAL,
  } = params;

  const ev =
    mstrMarketCap + CONVERT_DEBT_USD + totalPrefNotional - CASH_BALANCE;
  const btcReserve = btcHoldings * btcPrice;
  if (btcReserve <= 0 || mstrMarketCap <= 0) return 0;
  return ev / btcReserve;
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
  /** Estimated MSTR common proceeds for this day */
  mstrProceeds: number;
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
 * Determine MSTR participation rate based on current mNAV.
 * Saylor's framework: below 2.5× tactical (dividends only), 2.5-4× opportunistic, >4× aggressive.
 */
function mstrParticipationForMnav(mnav: number): number {
  if (mnav < MNAV_THRESHOLD_TACTICAL) {
    // Below 2.5×: issue only enough to cover dividends, no incremental BTC buying via common
    return 0;
  }
  if (mnav < MNAV_THRESHOLD_OPPORTUNISTIC) {
    // 2.5-4×: opportunistic — moderate participation
    // Linear interpolation from 1% at 2.5× to 3% at 4×
    const t =
      (mnav - MNAV_THRESHOLD_TACTICAL) /
      (MNAV_THRESHOLD_OPPORTUNISTIC - MNAV_THRESHOLD_TACTICAL);
    return 0.01 + t * 0.02;
  }
  // >4×: aggressive — higher participation, capped at 5%
  return Math.min(0.05, 0.03 + (mnav - 4.0) * 0.005);
}

/**
 * Run the flywheel forecast from the last confirmed 8-K through provided market data.
 *
 * @param marketData - Array of daily market data, sorted oldest-first,
 *   covering each trading day since the last 8-K period end.
 * @param participationRates - Optional overrides for participation rates.
 *   Defaults to DEFAULT_PARTICIPATION_RATES.
 */
export function runForecast(
  marketData: DayMarketData[],
  participationRates?: Partial<Record<string, number>>,
): FlywheelForecastResult {
  const baseline = getBaseline();
  const rates = { ...DEFAULT_PARTICIPATION_RATES, ...participationRates };

  let btcHoldings = baseline.btcHoldings;
  let strcAtmDeployed = baseline.strcAtmDeployed;
  let totalPrefNotional = baseline.totalPrefNotional;
  let currentMnav = 0;

  const days: DayForecast[] = [];

  for (const day of marketData) {
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

    // ── Step 2: Compute mNAV to determine MSTR issuance ──
    const mstrMarketCap = day.mstrSharesOutstanding * day.mstrPrice;
    currentMnav = computeMnav({
      mstrMarketCap,
      btcHoldings,
      btcPrice: day.btcPrice,
      totalPrefNotional,
    });

    // ── Step 3: MSTR common issuance based on mNAV ──
    const mstrParticipation = mstrParticipationForMnav(currentMnav);
    const mstrSharesSold = Math.round(day.mstrVolume * mstrParticipation);
    const mstrProceeds = mstrSharesSold * day.mstrPrice;

    // MSTR proceeds: fund dividends first, remainder to BTC
    const mstrDividendAlloc = Math.min(mstrProceeds, DAILY_OBLIGATIONS);
    const mstrBtcAlloc = Math.max(0, mstrProceeds - mstrDividendAlloc);
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
      mstrProceeds,
      mstrDividendAlloc,
      btcPurchaseProceeds,
      btcPurchased,
      cumulativeBtc: btcHoldings,
      mnav: parseFloat(currentMnav.toFixed(4)),
      strcAtmDeployed,
      totalPrefNotional,
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
  };
}

/**
 * Quick single-day forecast using current live market data.
 * This is for the snapshot route — runs the flywheel for just today
 * (or however many days since last 8-K if we have historical volume).
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
    };
  }

  // For now, single-day forecast with live data
  // TODO: When historical volume is in DB, backfill intermediate days
  const marketData: DayMarketData[] = [
    {
      date: today,
      btcPrice: params.btcPrice,
      strcPrice: params.strcPrice,
      strcVolume: params.strcVolume,
      mstrPrice: params.mstrPrice,
      mstrVolume: params.mstrVolume,
      mstrSharesOutstanding: params.mstrSharesOutstanding,
    },
  ];

  return runForecast(marketData, params.participationRates);
}

// ── Backtest / Calibration ───────────────────────────────────────────

/**
 * Calibrate STRC participation rate against confirmed 8-K data.
 * Grid-searches the rate that best matches confirmed proceeds.
 *
 * @param periods - Confirmed ATM periods with actual proceeds
 * @param historicalVolume - Map of date → daily STRC volume
 * @param historicalPrice - Map of date → daily STRC price
 * @returns Best-fit participation rate
 */
export function calibrateStrcParticipation(
  periods: ConfirmedAtmPeriod[],
  historicalVolume: Map<string, number>,
  historicalPrice: Map<string, number>,
): { rate: number; error: number; sampleCount: number } {
  let bestRate = DEFAULT_PARTICIPATION_RATES.STRC;
  let bestError = Infinity;
  let sampleCount = 0;

  // Grid search from 5% to 60% in 1% steps
  for (let rate = 0.05; rate <= 0.6; rate += 0.01) {
    let totalError = 0;
    let samples = 0;

    for (const period of periods) {
      const strc = period.instruments.find((i) => i.ticker === "STRC");
      if (!strc || strc.net_proceeds === 0) continue;

      // Sum estimated proceeds across the period
      let estimatedProceeds = 0;
      const start = new Date(period.period_start);
      const end = new Date(period.period_end);

      for (
        let d = new Date(start);
        d <= end;
        d.setDate(d.getDate() + 1)
      ) {
        const dateStr = d.toISOString().slice(0, 10);
        const vol = historicalVolume.get(dateStr);
        const price = historicalPrice.get(dateStr);
        if (vol != null && price != null) {
          estimatedProceeds += vol * rate * price;
        }
      }

      if (estimatedProceeds > 0) {
        // Relative error
        const err = Math.abs(estimatedProceeds - strc.net_proceeds) / strc.net_proceeds;
        totalError += err;
        samples++;
      }
    }

    if (samples > 0) {
      const avgError = totalError / samples;
      if (avgError < bestError) {
        bestError = avgError;
        bestRate = parseFloat(rate.toFixed(2));
        sampleCount = samples;
      }
    }
  }

  return { rate: bestRate, error: bestError, sampleCount };
}

// ── Exports for snapshot integration ─────────────────────────────────

// All capital structure constants are exported from src/lib/data/capital-structure.ts
