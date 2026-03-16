/**
 * Confirmed ATM issuance across ALL instruments from SEC 8-K filings.
 * Source: SEC EDGAR — Strategy Inc Form 8-K
 * Last updated: 2026-03-16 (8-K filed March 16, 2026)
 *
 * Each entry represents one weekly 8-K filing period.
 * This is the ground truth for backtesting volume-based ATM estimation
 * and for snapping forecasts to actuals.
 */

export interface ConfirmedAtmPeriod {
  /** Date the 8-K was filed */
  filed: string;
  /** Start of coverage period (inclusive) */
  period_start: string;
  /** End of coverage period (inclusive) */
  period_end: string;
  /** Per-instrument issuance data */
  instruments: {
    /** Ticker symbol */
    ticker: "STRC" | "STRK" | "STRD" | "STRF" | "MSTR";
    /** Shares sold in the period */
    shares_sold: number;
    /** Net proceeds in USD (after commissions) */
    net_proceeds: number;
    /** Notional value in USD (for preferred = face value) */
    notional?: number;
  }[];
  /** BTC purchased with combined proceeds */
  btc_purchased: number;
  /** Average BTC purchase price */
  avg_btc_price: number;
  /** Aggregate BTC purchase cost */
  btc_cost: number;
  /** Cumulative BTC holdings as of period end */
  cumulative_btc: number;
}

/**
 * ATM remaining capacity by instrument (as of latest 8-K)
 * Updated from the "Available for Issuance and Sale" column
 */
export const ATM_REMAINING = {
  STRF: 1_619_300_000,
  STRC: 1_975_800_000,
  STRK: 20_331_600_000,
  STRD: 4_014_800_000,
  MSTR: 6_316_800_000,
} as const;

export const ATM_AUTHORIZED = {
  STRF: 2_100_000_000,
  STRC: 4_200_000_000,
  STRK: 21_000_000_000,
  STRD: 4_200_000_000,
  MSTR: 21_000_000_000,
} as const;

/**
 * Weekly confirmed ATM periods from 8-K filings.
 * Only includes periods where at least one instrument had issuance.
 *
 * Note: Earlier 8-Ks only reported STRC + BTC data.
 * Full multi-instrument breakdowns started appearing in later filings.
 * MSTR common issuance is reported separately in the same 8-K.
 */
export const CONFIRMED_ATM_PERIODS: ConfirmedAtmPeriod[] = [
  // ── 2026-03-16 (today's 8-K) ──
  {
    filed: "2026-03-16",
    period_start: "2026-03-09",
    period_end: "2026-03-15",
    instruments: [
      { ticker: "STRF", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRC", shares_sold: 11_818_467, net_proceeds: 1_180_400_000, notional: 1_181_800_000 },
      { ticker: "STRK", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRD", shares_sold: 0, net_proceeds: 0 },
      { ticker: "MSTR", shares_sold: 2_833_668, net_proceeds: 396_000_000 },
    ],
    btc_purchased: 22_337,
    avg_btc_price: 70_194,
    btc_cost: 1_570_000_000,
    cumulative_btc: 761_068,
  },
  // ── 2026-03-09 ──
  {
    filed: "2026-03-09",
    period_start: "2026-03-01",
    period_end: "2026-03-07",
    instruments: [
      { ticker: "STRC", shares_sold: 3_776_205, net_proceeds: 377_100_000 },
      // MSTR/STRK/STRD/STRF data not captured for this period yet
    ],
    btc_purchased: 5_315,
    avg_btc_price: 71_000,
    btc_cost: 377_000_000,
    cumulative_btc: 738_731,
  },
  // ── 2026-03-02 ──
  {
    filed: "2026-03-02",
    period_start: "2026-02-22",
    period_end: "2026-02-28",
    instruments: [
      { ticker: "STRC", shares_sold: 71_590, net_proceeds: 7_100_000 },
    ],
    btc_purchased: 105,
    avg_btc_price: 68_000,
    btc_cost: 7_100_000,
    cumulative_btc: 733_416,
  },
  // ── 2026-02-17 ──
  {
    filed: "2026-02-17",
    period_start: "2026-02-08",
    period_end: "2026-02-15",
    instruments: [
      { ticker: "STRC", shares_sold: 785_354, net_proceeds: 78_400_000 },
    ],
    btc_purchased: 1_158,
    avg_btc_price: 68_000,
    btc_cost: 78_700_000,
    cumulative_btc: 733_311,
  },
  // ── 2026-01-26 ──
  {
    filed: "2026-01-26",
    period_start: "2026-01-19",
    period_end: "2026-01-24",
    instruments: [
      { ticker: "STRC", shares_sold: 70_201, net_proceeds: 7_000_000 },
    ],
    btc_purchased: 78,
    avg_btc_price: 90_000,
    btc_cost: 7_000_000,
    cumulative_btc: 732_153,
  },
  // ── 2026-01-20 ──
  {
    filed: "2026-01-20",
    period_start: "2026-01-11",
    period_end: "2026-01-18",
    instruments: [
      { ticker: "STRC", shares_sold: 2_945_371, net_proceeds: 294_300_000 },
    ],
    btc_purchased: 3_089,
    avg_btc_price: 95_000,
    btc_cost: 293_400_000,
    cumulative_btc: 732_075,
  },
  // ── 2026-01-12 ──
  {
    filed: "2026-01-12",
    period_start: "2026-01-04",
    period_end: "2026-01-10",
    instruments: [
      { ticker: "STRC", shares_sold: 1_192_262, net_proceeds: 119_100_000 },
    ],
    btc_purchased: 1_298,
    avg_btc_price: 92_000,
    btc_cost: 119_400_000,
    cumulative_btc: 728_986,
  },
];

/** Date of the last confirmed 8-K period end */
export const LATEST_ATM_PERIOD_END =
  CONFIRMED_ATM_PERIODS[0].period_end;

/** Most recent confirmed cumulative BTC holdings */
export const LATEST_CONFIRMED_BTC_FROM_ATM =
  CONFIRMED_ATM_PERIODS[0].cumulative_btc;

/** Total STRC proceeds across all confirmed periods */
export function totalStrcProceeds(): number {
  return CONFIRMED_ATM_PERIODS.reduce((sum, p) => {
    const strc = p.instruments.find((i) => i.ticker === "STRC");
    return sum + (strc?.net_proceeds ?? 0);
  }, 0);
}

/** Total MSTR common proceeds across all confirmed periods */
export function totalMstrProceeds(): number {
  return CONFIRMED_ATM_PERIODS.reduce((sum, p) => {
    const mstr = p.instruments.find((i) => i.ticker === "MSTR");
    return sum + (mstr?.net_proceeds ?? 0);
  }, 0);
}
