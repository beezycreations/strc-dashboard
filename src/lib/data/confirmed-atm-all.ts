/**
 * Confirmed ATM issuance across ALL instruments from SEC 8-K filings.
 * Source: SEC EDGAR — Strategy Inc Form 8-K
 * Last updated: 2026-03-23 (8-K filed March 23, 2026)
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
  MSTR: 6_240_200_000,
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
  // ── 2026-03-23 ──
  {
    filed: "2026-03-23",
    period_start: "2026-03-16",
    period_end: "2026-03-22",
    instruments: [
      { ticker: "STRF", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRK", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRD", shares_sold: 0, net_proceeds: 0 },
      { ticker: "MSTR", shares_sold: 509_111, net_proceeds: 76_500_000 },
    ],
    btc_purchased: 1_031,
    avg_btc_price: 74_326,
    btc_cost: 76_600_000,
    cumulative_btc: 762_099,
  },
  // ── 2026-03-16 ──
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
    period_start: "2026-03-02",
    period_end: "2026-03-08",
    instruments: [
      { ticker: "STRC", shares_sold: 3_776_205, net_proceeds: 377_100_000 },
      { ticker: "MSTR", shares_sold: 6_327_541, net_proceeds: 899_500_000 },
    ],
    btc_purchased: 5_315,
    avg_btc_price: 71_000,
    btc_cost: 377_000_000,
    cumulative_btc: 738_731,
  },
  // ── 2026-03-02 ──
  {
    filed: "2026-03-02",
    period_start: "2026-02-23",
    period_end: "2026-03-01",
    instruments: [
      { ticker: "STRC", shares_sold: 71_590, net_proceeds: 7_100_000 },
      { ticker: "MSTR", shares_sold: 1_730_563, net_proceeds: 229_900_000 },
    ],
    btc_purchased: 105,
    avg_btc_price: 68_000,
    btc_cost: 7_100_000,
    cumulative_btc: 733_416,
  },
  // ── 2026-02-17 ──
  {
    filed: "2026-02-17",
    period_start: "2026-02-09",
    period_end: "2026-02-16",
    instruments: [
      { ticker: "STRC", shares_sold: 785_354, net_proceeds: 78_400_000 },
      { ticker: "MSTR", shares_sold: 660_000, net_proceeds: 90_500_000 },
    ],
    btc_purchased: 1_158,
    avg_btc_price: 68_000,
    btc_cost: 78_700_000,
    cumulative_btc: 733_311,
  },
  // ── 2026-01-26 ──
  {
    filed: "2026-01-26",
    period_start: "2026-01-20",
    period_end: "2026-01-25",
    instruments: [
      { ticker: "STRC", shares_sold: 70_201, net_proceeds: 7_000_000 },
      { ticker: "MSTR", shares_sold: 1_569_770, net_proceeds: 257_000_000 },
    ],
    btc_purchased: 78,
    avg_btc_price: 90_000,
    btc_cost: 7_000_000,
    cumulative_btc: 732_153,
  },
  // ── 2026-01-20 ──
  {
    filed: "2026-01-20",
    period_start: "2026-01-12",
    period_end: "2026-01-19",
    instruments: [
      { ticker: "STRC", shares_sold: 2_945_371, net_proceeds: 294_300_000 },
      { ticker: "MSTR", shares_sold: 10_399_650, net_proceeds: 1_827_300_000 },
    ],
    btc_purchased: 3_089,
    avg_btc_price: 95_000,
    btc_cost: 293_400_000,
    cumulative_btc: 732_075,
  },
  // ── 2026-01-12 ──
  {
    filed: "2026-01-12",
    period_start: "2026-01-05",
    period_end: "2026-01-11",
    instruments: [
      { ticker: "STRC", shares_sold: 1_192_262, net_proceeds: 119_100_000 },
      { ticker: "MSTR", shares_sold: 6_827_695, net_proceeds: 1_128_500_000 },
    ],
    btc_purchased: 1_298,
    avg_btc_price: 92_000,
    btc_cost: 119_400_000,
    cumulative_btc: 728_986,
  },
  // ── 2026-01-05 (sub-period B: Jan 1–4) ──
  {
    filed: "2026-01-05",
    period_start: "2026-01-01",
    period_end: "2026-01-04",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "MSTR", shares_sold: 735_000, net_proceeds: 116_300_000 },
    ],
    btc_purchased: 1_283,
    avg_btc_price: 90_391,
    btc_cost: 115_900_000,
    cumulative_btc: 673_783,
  },
  // ── 2026-01-05 (sub-period A: Dec 29–31) ──
  {
    filed: "2026-01-05",
    period_start: "2025-12-29",
    period_end: "2025-12-31",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "MSTR", shares_sold: 1_255_911, net_proceeds: 195_900_000 },
    ],
    btc_purchased: 3,
    avg_btc_price: 88_210,
    btc_cost: 265_000,
    cumulative_btc: 672_500,
  },
  // ── 2025-12-29 ──
  {
    filed: "2025-12-29",
    period_start: "2025-12-22",
    period_end: "2025-12-28",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "MSTR", shares_sold: 663_450, net_proceeds: 108_800_000 },
    ],
    btc_purchased: 1_229,
    avg_btc_price: 88_568,
    btc_cost: 108_800_000,
    cumulative_btc: 672_497,
  },
  // ── 2025-12-22 ──
  {
    filed: "2025-12-22",
    period_start: "2025-12-15",
    period_end: "2025-12-21",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "MSTR", shares_sold: 4_535_000, net_proceeds: 747_800_000 },
    ],
    btc_purchased: 0,
    avg_btc_price: 0,
    btc_cost: 0,
    cumulative_btc: 671_268,
  },
  // ── 2025-12-15 ──
  {
    filed: "2025-12-15",
    period_start: "2025-12-08",
    period_end: "2025-12-14",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRF", shares_sold: 163_306, net_proceeds: 18_000_000 },
      { ticker: "STRK", shares_sold: 7_036, net_proceeds: 600_000 },
      { ticker: "STRD", shares_sold: 1_029_202, net_proceeds: 82_200_000 },
      { ticker: "MSTR", shares_sold: 4_789_664, net_proceeds: 888_200_000 },
    ],
    btc_purchased: 10_645,
    avg_btc_price: 92_098,
    btc_cost: 980_300_000,
    cumulative_btc: 671_268,
  },
  // ── 2025-12-08 ──
  {
    filed: "2025-12-08",
    period_start: "2025-12-01",
    period_end: "2025-12-07",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRD", shares_sold: 442_536, net_proceeds: 34_900_000 },
      { ticker: "MSTR", shares_sold: 5_127_684, net_proceeds: 928_100_000 },
    ],
    btc_purchased: 10_624,
    avg_btc_price: 90_615,
    btc_cost: 962_900_000,
    cumulative_btc: 660_624,
  },
  // ── 2025-12-01 (two-week period) ──
  {
    filed: "2025-12-01",
    period_start: "2025-11-17",
    period_end: "2025-11-30",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "MSTR", shares_sold: 8_214_000, net_proceeds: 1_478_100_000 },
    ],
    btc_purchased: 130,
    avg_btc_price: 89_960,
    btc_cost: 11_700_000,
    cumulative_btc: 650_000,
  },
  // ── 2025-11-17 ──
  {
    filed: "2025-11-17",
    period_start: "2025-11-10",
    period_end: "2025-11-16",
    instruments: [
      { ticker: "STRC", shares_sold: 1_313_641, net_proceeds: 131_200_000, notional: 131_400_000 },
      { ticker: "STRF", shares_sold: 39_957, net_proceeds: 4_400_000 },
      { ticker: "STRK", shares_sold: 5_513, net_proceeds: 500_000 },
      { ticker: "MSTR", shares_sold: 0, net_proceeds: 0 },
    ],
    btc_purchased: 8_178,
    avg_btc_price: 102_171,
    btc_cost: 835_600_000,
    cumulative_btc: 649_870,
  },
  // ── 2025-11-10 ──
  {
    filed: "2025-11-10",
    period_start: "2025-11-03",
    period_end: "2025-11-09",
    instruments: [
      { ticker: "STRC", shares_sold: 262_311, net_proceeds: 26_200_000, notional: 26_200_000 },
      { ticker: "STRF", shares_sold: 165_614, net_proceeds: 18_300_000 },
      { ticker: "STRK", shares_sold: 50_881, net_proceeds: 4_500_000 },
      { ticker: "STRD", shares_sold: 12_800, net_proceeds: 1_000_000 },
      { ticker: "MSTR", shares_sold: 0, net_proceeds: 0 },
    ],
    btc_purchased: 487,
    avg_btc_price: 102_557,
    btc_cost: 49_900_000,
    cumulative_btc: 641_692,
  },
  // ── 2025-11-03 ──
  {
    filed: "2025-11-03",
    period_start: "2025-10-27",
    period_end: "2025-11-02",
    instruments: [
      { ticker: "STRC", shares_sold: 0, net_proceeds: 0 },
      { ticker: "STRF", shares_sold: 76_017, net_proceeds: 8_400_000 },
      { ticker: "STRK", shares_sold: 49_374, net_proceeds: 4_400_000 },
      { ticker: "STRD", shares_sold: 29_065, net_proceeds: 2_300_000 },
      { ticker: "MSTR", shares_sold: 183_501, net_proceeds: 54_400_000 },
    ],
    btc_purchased: 397,
    avg_btc_price: 114_771,
    btc_cost: 45_600_000,
    cumulative_btc: 641_205,
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
