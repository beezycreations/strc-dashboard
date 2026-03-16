/**
 * Capital Structure — Single Source of Truth
 *
 * All routes that compute mNAV, coverage ratios, or EV must import from here.
 * Updated from Q4 2025 earnings (Feb 1, 2026) + latest 8-K filings.
 *
 * DO NOT duplicate these constants elsewhere. If you need a value, import it.
 */

import { ATM_AUTHORIZED, ATM_REMAINING } from "./confirmed-atm-all";
import { TOTAL_STRC_SHARES } from "./confirmed-strc-atm";

// ── Convertible Notes ────────────────────────────────────────────────
// Aggregate principal of all outstanding convertible notes
export const CONVERT_DEBT_USD = 8_214_000_000; // Q4 2025 earnings: $8,214M at 0.42%

// ── Preferred Stock (par × shares issued as of Q4 2025 earnings) ─────
// These are the BASE notionals from the last earnings report.
// Current outstanding = base + incremental ATM issuance since then.
export const PREF_BASE = {
  STRF: 1_284_000_000, // Q4: $1,284M at 10%
  STRC: 3_379_000_000, // Q4: $3,379M at 11.25%
  STRK: 1_402_000_000, // Q4: $1,402M at 8%
  STRD: 1_402_000_000, // Q4: $1,402M at 10% (non-cumulative)
  STRE: 921_000_000,   // Q4: $921M at 10% (EUR-denominated)
} as const;

export const PREF_BASE_TOTAL = Object.values(PREF_BASE).reduce((a, b) => a + b, 0);

// ── Cash & Equivalents ───────────────────────────────────────────────
// USD Reserve from Q4 2025 earnings — covers ~2.5 years of obligations
export const CASH_BALANCE = 2_250_000_000;

// ── Annual Obligations ───────────────────────────────────────────────
// Total annual dividend/interest payments across all instruments
export const ANNUAL_OBLIGATIONS = 888_000_000; // ~$74M/month
export const MONTHLY_OBLIGATIONS = ANNUAL_OBLIGATIONS / 12;
export const DAILY_OBLIGATIONS = ANNUAL_OBLIGATIONS / 252; // trading days

// Per-instrument annual obligations
export const INSTRUMENT_OBLIGATIONS = {
  CONVERTS: 35_000_000,  // $8,214M at 0.42%
  STRF: 128_000_000,     // $1,284M at 10%
  STRC: 380_000_000,     // $3,379M at 11.25% (grows with issuance)
  STRE: 92_000_000,      // $921M at 10%
  STRK: 112_000_000,     // $1,402M at 8%
  STRD: 140_000_000,     // $1,402M at 10% (non-cumulative)
} as const;

// ── MSTR Common Stock ────────────────────────────────────────────────
export const MSTR_SHARES_AT_FILING = 374_506_000; // From 2026-03-09 8-K ADSO
export const MSTR_ATM_DEPLOYED_AT_FILING = ATM_AUTHORIZED.MSTR - ATM_REMAINING.MSTR;

// ── ATM Programs ─────────────────────────────────────────────────────
// Re-exported for convenience — canonical values in confirmed-atm-all.ts
export { ATM_AUTHORIZED, ATM_REMAINING };

/** Deployed = Authorized - Remaining (ATM program proceeds only) */
export const ATM_DEPLOYED = {
  STRF: ATM_AUTHORIZED.STRF - ATM_REMAINING.STRF,
  STRC: ATM_AUTHORIZED.STRC - ATM_REMAINING.STRC,
  STRK: ATM_AUTHORIZED.STRK - ATM_REMAINING.STRK,
  STRD: ATM_AUTHORIZED.STRD - ATM_REMAINING.STRD,
  MSTR: ATM_AUTHORIZED.MSTR - ATM_REMAINING.MSTR,
} as const;

/**
 * Total STRC notional = all shares outstanding × $100 par.
 * Includes BOTH the initial offering (28M shares) and ATM issuance.
 * Sourced from confirmed-strc-atm.ts which tracks every 8-K filing.
 */
export const STRC_TOTAL_NOTIONAL = TOTAL_STRC_SHARES * 100;

// ── Derived: Current Preferred Notional ──────────────────────────────
// For mNAV, preferred notional = total face value outstanding.
// Since Q4 earnings, additional shares were issued via ATM programs.
// We estimate current notional as: Q4 base + incremental ATM since Q4.

// These are the Q4 base values embedded in the ATM_DEPLOYED figures.
// Pre-ATM issuance for each instrument (initial offering before ATM program):
const PRE_ATM_NOTIONAL = {
  STRF: PREF_BASE.STRF, // all STRF existed before ATM
  STRC: PREF_BASE.STRC - ATM_DEPLOYED.STRC, // remainder is pre-ATM
  STRK: PREF_BASE.STRK - ATM_DEPLOYED.STRK,
  STRD: PREF_BASE.STRD - ATM_DEPLOYED.STRD,
} as const;

/**
 * Current preferred notional as of the latest 8-K.
 * = Base outstanding from Q4 + any ATM issuance beyond what was in Q4 base.
 *
 * For instruments where ATM_DEPLOYED > Q4 base, the difference is new issuance.
 * For instruments where ATM_DEPLOYED < Q4 base, no adjustment needed.
 */
export function currentPrefNotional(): number {
  // STRC: use actual shares outstanding × $100 par (from confirmed 8-K data).
  // This captures both IPO shares and ATM issuance. The Q4 base + ATM approach
  // was wrong because ATM_DEPLOYED only counts ATM proceeds (misses IPO shares).
  let total = PREF_BASE.STRE; // STRE has no ATM program tracked here
  total += STRC_TOTAL_NOTIONAL; // STRC: all shares outstanding from 8-K data

  // Other instruments: use max(Q4 base, ATM deployed).
  // These have not had significant post-Q4 ATM issuance.
  for (const ticker of ["STRF", "STRK", "STRD"] as const) {
    const base = PREF_BASE[ticker];
    const deployed = ATM_DEPLOYED[ticker];
    total += Math.max(base, deployed);
  }

  return total;
}

/** Total preferred notional from latest 8-K data */
export const CURRENT_PREF_NOTIONAL = currentPrefNotional();

// ── mNAV Computation ─────────────────────────────────────────────────

/**
 * Compute mNAV per Strategy's methodology:
 *   mNAV = Enterprise Value / BTC Reserve
 *   EV = MSTR Market Cap + Converts + Preferred Notional - Cash
 */
export function computeMnav(params: {
  mstrMarketCap: number;
  btcHoldings: number;
  btcPrice: number;
  prefNotionalOverride?: number;
}): number {
  const {
    mstrMarketCap,
    btcHoldings,
    btcPrice,
    prefNotionalOverride,
  } = params;

  const prefNotional = prefNotionalOverride ?? CURRENT_PREF_NOTIONAL;
  const ev = mstrMarketCap + CONVERT_DEBT_USD + prefNotional - CASH_BALANCE;
  const btcReserve = btcHoldings * btcPrice;
  if (btcReserve <= 0 || mstrMarketCap <= 0) return 0;
  return parseFloat((ev / btcReserve).toFixed(4));
}

export function mnavRegimeFromValue(mnav: number): string {
  if (mnav > 2.0) return "premium";
  if (mnav > 1.2) return "tactical";
  return "discount";
}

// ── Historical EV Timeline (for mNAV chart) ──────────────────────────
// Step function of capital structure changes over time.
// Each entry takes effect on its date. Used by mstr-mnav route.

export interface EvComponents {
  convertDebt: number;
  prefNotional: number;
  cash: number;
}

const EV_TIMELINE: Array<{ date: string } & EvComponents> = [
  { date: "2020-08-10", convertDebt: 0,            prefNotional: 0, cash: 50_000_000 },
  { date: "2020-12-11", convertDebt: 650_000_000,  prefNotional: 0, cash: 60_000_000 },
  { date: "2021-02-19", convertDebt: 1_700_000_000, prefNotional: 0, cash: 60_000_000 },
  { date: "2021-06-14", convertDebt: 2_200_000_000, prefNotional: 0, cash: 70_000_000 },
  { date: "2024-03-08", convertDebt: 3_000_000_000, prefNotional: 0, cash: 80_000_000 },
  { date: "2024-09-20", convertDebt: 4_250_000_000, prefNotional: 0, cash: 100_000_000 },
  { date: "2024-11-21", convertDebt: 7_250_000_000, prefNotional: 0, cash: 200_000_000 },
  // Jan 2025: STRF launched ($711M initial → grew to ~$1.28B by Q4)
  { date: "2025-01-24", convertDebt: 7_250_000_000, prefNotional: 711_000_000, cash: 500_000_000 },
  // Feb 2025: STRC launched, converts reach ~$8.2B
  { date: "2025-02-20", convertDebt: 8_214_000_000, prefNotional: 711_000_000 + 1_000_000_000, cash: 600_000_000 },
  // May 2025: STRK launched, STRC growing
  { date: "2025-05-01", convertDebt: 8_214_000_000, prefNotional: 1_284_000_000 + 2_500_000_000 + 700_000_000, cash: 800_000_000 },
  // Jul 2025: STRD launched, full capital stack
  { date: "2025-07-25", convertDebt: 8_214_000_000, prefNotional: 1_284_000_000 + 3_000_000_000 + 1_000_000_000 + 1_000_000_000 + 921_000_000, cash: 1_500_000_000 },
  // Q4 2025 earnings (Feb 1 2026): confirmed capital structure
  { date: "2026-02-01", convertDebt: CONVERT_DEBT_USD, prefNotional: PREF_BASE_TOTAL, cash: CASH_BALANCE },
  // Mar 2026: updated from 8-K ATM data — STRC issuance ramp
  { date: "2026-03-16", convertDebt: CONVERT_DEBT_USD, prefNotional: CURRENT_PREF_NOTIONAL, cash: CASH_BALANCE },
];

/**
 * Get EV components for a historical date (step function lookup).
 */
export function getEvComponents(dateStr: string): EvComponents {
  let result = EV_TIMELINE[0];
  for (const entry of EV_TIMELINE) {
    if (entry.date <= dateStr) result = entry;
    else break;
  }
  return { convertDebt: result.convertDebt, prefNotional: result.prefNotional, cash: result.cash };
}
