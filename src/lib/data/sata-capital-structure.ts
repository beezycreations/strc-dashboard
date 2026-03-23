/**
 * SATA Capital Structure — Single Source of Truth
 *
 * Strive's SATA (Variable Rate Series A Perpetual Preferred Stock)
 * Parent: Strive, Inc. (Nasdaq: ASST) — formerly Semler Scientific
 *
 * All routes computing amplification ratio, EV/mNAV, or coverage must import from here.
 * Updated from March 2026 investor update.
 *
 * DO NOT duplicate these constants elsewhere. If you need a value, import it.
 */

// ── SATA Preferred ──────────────────────────────────────────────────
export const SATA_PAR = 100; // $100 par value
export const SATA_RATE_PCT = 12.75; // Current variable rate
export const SATA_NOTIONAL = 427_000_000; // $427M outstanding
export const SATA_SHARES_OUTSTANDING = SATA_NOTIONAL / SATA_PAR; // 4,270,000 shares
export const SATA_ANNUAL_DIVIDEND = SATA_NOTIONAL * (SATA_RATE_PCT / 100); // ~$54.4M/yr
export const SATA_MONTHLY_DIVIDEND = SATA_ANNUAL_DIVIDEND / 12; // ~$4.5M/mo
export const SATA_ISSUANCE_FLOOR = 100; // Won't issue below $100

// ── ASST Common Stock (Parent) ──────────────────────────────────────
export const ASST_SHARES_OUTSTANDING = 66_800_000; // ~66.8M shares
export const ASST_MARKET_CAP = 599_000_000; // ~$599M (March 2026)

// ── Semler Convertible Notes ────────────────────────────────────────
export const SEMLER_CONVERT_NOTES = 10_000_000; // $10M remaining (retiring by April 2026)

// ── BTC Holdings ────────────────────────────────────────────────────
export const SATA_BTC_HOLDINGS = 13_311; // As of 3/10/26
export const SATA_BTC_HOLDINGS_DATE = "2026-03-10";

// ── Dividend Reserves ───────────────────────────────────────────────
// Cash reserve covers 12 months of SATA dividends
export const SATA_CASH_RESERVE_MONTHS = 12;
export const SATA_CASH_RESERVE = SATA_MONTHLY_DIVIDEND * SATA_CASH_RESERVE_MONTHS;

// STRC treasury position provides additional 6 months coverage
export const STRC_TREASURY_POSITION = 50_000_000; // $50M STRC position
export const STRC_RESERVE_MONTHS = 6;
export const TOTAL_RESERVE_MONTHS = SATA_CASH_RESERVE_MONTHS + STRC_RESERVE_MONTHS; // 18 months

// ── Tax-Equivalent Yield ────────────────────────────────────────────
// ROC treatment — dividends classified as return of capital
export const TAX_EQUIV_YIELD = 20.24; // At 37% marginal rate
export const TAX_BRACKETS = [
  { bracket: "22%", taxEquivYield: 16.35 },
  { bracket: "24%", taxEquivYield: 16.78 },
  { bracket: "32%", taxEquivYield: 18.75 },
  { bracket: "35%", taxEquivYield: 19.62 },
  { bracket: "37%", taxEquivYield: 20.24 },
] as const;

// ── Amplification Ratio ─────────────────────────────────────────────
// (Debt + Preferred) / BTC Market Value
// Strive uses "amplification ratio" terminology

/**
 * Compute amplification ratio: (total liabilities) / BTC NAV
 * Lower = more conservative. Strive reports 46.8% as of March 2026.
 */
export function computeAmplificationRatio(params: {
  btcHoldings: number;
  btcPrice: number;
  sataNotional?: number;
  semlerNotes?: number;
}): number {
  const { btcHoldings, btcPrice, sataNotional = SATA_NOTIONAL, semlerNotes = SEMLER_CONVERT_NOTES } = params;
  const btcNav = btcHoldings * btcPrice;
  if (btcNav <= 0) return 0;
  const totalLiabilities = sataNotional + semlerNotes;
  return parseFloat(((totalLiabilities / btcNav) * 100).toFixed(2));
}

// ── EV/mNAV ─────────────────────────────────────────────────────────
// Enterprise Value / BTC NAV (Strive equivalent of Strategy's mNAV)

/**
 * Compute EV/mNAV for Strive/ASST:
 *   EV = ASST Market Cap + SATA Notional + Semler Notes
 *   mNAV = BTC Holdings × BTC Price
 */
export function computeSataEvMnav(params: {
  asstMarketCap: number;
  btcHoldings: number;
  btcPrice: number;
  sataNotional?: number;
  semlerNotes?: number;
}): number {
  const {
    asstMarketCap,
    btcHoldings,
    btcPrice,
    sataNotional = SATA_NOTIONAL,
    semlerNotes = SEMLER_CONVERT_NOTES,
  } = params;
  const btcNav = btcHoldings * btcPrice;
  if (btcNav <= 0 || asstMarketCap <= 0) return 0;
  const ev = asstMarketCap + sataNotional + semlerNotes;
  return parseFloat((ev / btcNav).toFixed(4));
}

/**
 * Compute SATA effective yield: (rate / price) × 100
 */
export function computeSataEffectiveYield(sataPrice: number, ratePct: number = SATA_RATE_PCT): number | null {
  if (sataPrice <= 0) return null;
  return parseFloat(((ratePct / sataPrice) * 100).toFixed(2));
}

/**
 * Compute tax-equivalent yield given a marginal tax rate
 * SATA dividends receive ROC treatment
 */
export function computeTaxEquivYield(effectiveYield: number, marginalRate: number): number {
  return parseFloat((effectiveYield / (1 - marginalRate / 100)).toFixed(2));
}

/**
 * Compute dividend reserve in months:
 * Cash reserve months + STRC reserve months (valued at live STRC price)
 */
export function computeReserveMonths(params: {
  strcPrice?: number;
  strcShares?: number;
}): { cashMonths: number; strcMonths: number; totalMonths: number; strcValue: number } {
  const { strcPrice, strcShares } = params;
  const cashMonths = SATA_CASH_RESERVE_MONTHS;

  // STRC reserve: live valuation of $50M position
  let strcValue = STRC_TREASURY_POSITION;
  if (strcPrice && strcShares) {
    strcValue = strcPrice * strcShares;
  }
  const strcMonths = SATA_MONTHLY_DIVIDEND > 0
    ? parseFloat((strcValue / SATA_MONTHLY_DIVIDEND).toFixed(1))
    : STRC_RESERVE_MONTHS;

  return {
    cashMonths,
    strcMonths,
    totalMonths: parseFloat((cashMonths + strcMonths).toFixed(1)),
    strcValue,
  };
}
