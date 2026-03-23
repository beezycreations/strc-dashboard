/**
 * Confirmed STRC ATM issuance history from SEC 8-K filings.
 * Source: SEC EDGAR / strc.live
 * Last updated: 2026-03-23 (Purchase #104)
 *
 * Each entry represents a confirmed 8-K filing with exact shares sold,
 * net proceeds, and the coverage period. This is the ground truth for
 * backtesting our volume-based ATM estimation methodology.
 */

export interface ConfirmedStrcAtm {
  /** Date the 8-K was filed */
  filed: string;
  /** Type of issuance */
  type: "ATM" | "IPO";
  /** Start of the coverage period (inclusive) */
  period_start: string;
  /** End of the coverage period (inclusive) */
  period_end: string;
  /** Total shares sold in the period */
  shares_sold: number;
  /** Net proceeds in USD */
  net_proceeds: number;
  /** Estimated BTC purchased with proceeds */
  btc_purchased: number;
  /** Average BTC price during the period */
  avg_btc_price: number;
  /** SEC EDGAR accession number (e.g. "0001193125-26-107263") */
  accession_no?: string;
}

export const CONFIRMED_STRC_ATM: ConfirmedStrcAtm[] = [
  // IPO
  {
    filed: "2025-07-29",
    type: "IPO",
    period_start: "2025-07-29",
    period_end: "2025-07-29",
    shares_sold: 28_011_111,
    net_proceeds: 2_520_000_000,
    btc_purchased: 21_379,
    avg_btc_price: 118_000,
    accession_no: "0001193125-25-167987",
  },
  // ATM issuances (chronological)
  {
    filed: "2025-11-10",
    type: "ATM",
    period_start: "2025-11-02",
    period_end: "2025-11-08",
    shares_sold: 262_311,
    net_proceeds: 26_200_000,
    btc_purchased: 251,
    avg_btc_price: 104_000,
    accession_no: "0001193125-25-273310",
  },
  {
    filed: "2025-11-17",
    type: "ATM",
    period_start: "2025-11-09",
    period_end: "2025-11-15",
    shares_sold: 1_313_641,
    net_proceeds: 131_200_000,
    btc_purchased: 1_303,
    avg_btc_price: 101_000,
    accession_no: "0001193125-25-283991",
  },
  {
    filed: "2026-01-12",
    type: "ATM",
    period_start: "2026-01-04",
    period_end: "2026-01-10",
    shares_sold: 1_192_262,
    net_proceeds: 119_100_000,
    btc_purchased: 1_298,
    avg_btc_price: 92_000,
    accession_no: "0001193125-26-009811",
  },
  {
    filed: "2026-01-20",
    type: "ATM",
    period_start: "2026-01-11",
    period_end: "2026-01-18",
    shares_sold: 2_945_371,
    net_proceeds: 294_300_000,
    btc_purchased: 3_089,
    avg_btc_price: 95_000,
    accession_no: "0001193125-26-016002",
  },
  {
    filed: "2026-01-26",
    type: "ATM",
    period_start: "2026-01-19",
    period_end: "2026-01-24",
    shares_sold: 70_201,
    net_proceeds: 7_000_000,
    btc_purchased: 78,
    avg_btc_price: 90_000,
    accession_no: "0001193125-26-021726",
  },
  {
    filed: "2026-02-17",
    type: "ATM",
    period_start: "2026-02-08",
    period_end: "2026-02-15",
    shares_sold: 785_354,
    net_proceeds: 78_400_000,
    btc_purchased: 1_158,
    avg_btc_price: 68_000,
    accession_no: "0001193125-26-053105",
  },
  {
    filed: "2026-03-02",
    type: "ATM",
    period_start: "2026-02-22",
    period_end: "2026-02-28",
    shares_sold: 71_590,
    net_proceeds: 7_100_000,
    btc_purchased: 105,
    avg_btc_price: 68_000,
    accession_no: "0001193125-26-084264",
  },
  {
    filed: "2026-03-09",
    type: "ATM",
    period_start: "2026-03-01",
    period_end: "2026-03-07",
    shares_sold: 3_776_205,
    net_proceeds: 377_100_000,
    btc_purchased: 5_315,
    avg_btc_price: 71_000,
    accession_no: "0001193125-26-097598",
  },
  {
    filed: "2026-03-16",
    type: "ATM",
    period_start: "2026-03-09",
    period_end: "2026-03-15",
    shares_sold: 11_818_467,
    net_proceeds: 1_180_400_000,
    btc_purchased: 16_794,
    avg_btc_price: 70_290,
    accession_no: "0001193125-26-107263",
  },
  {
    filed: "2026-03-23",
    type: "ATM",
    period_start: "2026-03-16",
    period_end: "2026-03-22",
    shares_sold: 0,
    net_proceeds: 0,
    btc_purchased: 1_031,
    avg_btc_price: 74_326,
    accession_no: "0001193125-26-118584",
  },
];

/** ATM-only events (excludes IPO) for backtesting */
export const CONFIRMED_STRC_ATM_EVENTS = CONFIRMED_STRC_ATM.filter(
  (e) => e.type === "ATM"
);

/** Total STRC shares issued (all types) */
export const TOTAL_STRC_SHARES = CONFIRMED_STRC_ATM.reduce(
  (s, e) => s + e.shares_sold, 0
);

/** Total STRC net proceeds (all types) */
export const TOTAL_STRC_PROCEEDS = CONFIRMED_STRC_ATM.reduce(
  (s, e) => s + e.net_proceeds, 0
);

/** Date of most recent confirmed filing */
export const LATEST_STRC_ATM_DATE = CONFIRMED_STRC_ATM[CONFIRMED_STRC_ATM.length - 1].filed;

/** End of most recent confirmed period */
export const LATEST_STRC_ATM_PERIOD_END = CONFIRMED_STRC_ATM[CONFIRMED_STRC_ATM.length - 1].period_end;
