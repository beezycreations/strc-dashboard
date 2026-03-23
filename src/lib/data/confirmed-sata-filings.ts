/**
 * Confirmed SATA filing history from SEC EDGAR.
 * Source: SEC EDGAR filings for Strive, Inc. (CIK 0001920406)
 * Last updated: 2026-03-11
 *
 * Each entry represents a confirmed SEC filing — either a SATA offering,
 * BTC purchase disclosure, or material corporate update.
 * Strive issues SATA via discrete follow-on offerings and a $500M ATM program.
 *
 * SEC EDGAR CIK for Strive, Inc.: 0001920406
 * Tickers: ASST (common), SATA (preferred)
 */

export interface ConfirmedSataFiling {
  /** Date the filing was made */
  filed: string;
  /** Type of event */
  type: "offering" | "8-K" | "initial";
  /** Shares sold (SATA preferred) — null for 8-K filings without issuance */
  shares_sold: number | null;
  /** Net proceeds in USD (0 for non-capital events) */
  net_proceeds: number;
  /** BTC purchased with proceeds — null if not disclosed */
  btc_purchased: number | null;
  /** Average BTC price during the purchase — null if not disclosed */
  avg_btc_price: number | null;
  /** SEC EDGAR accession number */
  accession_no: string;
  /** Additional notes */
  notes?: string;
}

export const CONFIRMED_SATA_FILINGS: ConfirmedSataFiling[] = [
  // SATA IPO — oversubscribed & upsized from 1.25M to 2M shares
  {
    filed: "2025-11-10",
    type: "initial",
    shares_sold: 2_000_000,
    net_proceeds: 155_000_000,
    btc_purchased: 1_567,
    avg_btc_price: 103_315,
    accession_no: "0001140361-25-041295",
    notes: "SATA IPO at $80/share — oversubscribed & upsized from 1.25M shares",
  },
  // $500M SATA ATM Program authorized
  {
    filed: "2025-12-09",
    type: "offering",
    shares_sold: null,
    net_proceeds: 0,
    btc_purchased: null,
    avg_btc_price: null,
    accession_no: "0001140361-25-045044",
    notes: "$500M SATA ATM program established",
  },
  // BTC purchase + Semler acquisition approved
  {
    filed: "2026-01-13",
    type: "8-K",
    shares_sold: null,
    net_proceeds: 11_264_000,
    btc_purchased: 123,
    avg_btc_price: 91_561,
    accession_no: "0001628280-26-001928",
    notes: "123 BTC at $91,561; Semler acquisition approved; total 7,749.8 BTC",
  },
  // Upsized follow-on offering priced — 1.32M cash + 930K note exchange
  {
    filed: "2026-01-22",
    type: "offering",
    shares_sold: 2_250_000,
    net_proceeds: 118_800_000,
    btc_purchased: null,
    avg_btc_price: null,
    accession_no: "0001140361-26-002005",
    notes: "1.32M shares at $90 + 930K exchanged for $90M Semler Notes",
  },
  // Follow-on close + BTC purchase + debt retirement
  {
    filed: "2026-01-28",
    type: "8-K",
    shares_sold: null,
    net_proceeds: 0,
    btc_purchased: 334,
    avg_btc_price: 89_851,
    accession_no: "0001140361-26-002606",
    notes: "Offering closed; 334 BTC at $89,851; $110M/$120M Semler debt retired",
  },
  // Monthly update — rate increase, balance sheet
  {
    filed: "2026-02-13",
    type: "8-K",
    shares_sold: null,
    net_proceeds: 0,
    btc_purchased: null,
    avg_btc_price: null,
    accession_no: "0001628280-26-007897",
    notes: "Rate→12.50%; $127.2M cash; 13,131.8 BTC; 4,265,518 SATA outstanding",
  },
  // Monthly update — rate increase, BTC + STRC purchase
  {
    filed: "2026-03-11",
    type: "8-K",
    shares_sold: null,
    net_proceeds: 0,
    btc_purchased: 179,
    avg_btc_price: null,
    accession_no: "0001628280-26-016664",
    notes: "Rate→12.75%; 179 BTC purchased; $50M STRC; 13,311 BTC total",
  },
];

/** Total SATA shares issued across all offerings */
export const TOTAL_SATA_SHARES = CONFIRMED_SATA_FILINGS.reduce(
  (s, e) => s + (e.shares_sold ?? 0), 0
);

/** Total net proceeds across all filings */
export const TOTAL_SATA_PROCEEDS = CONFIRMED_SATA_FILINGS.reduce(
  (s, e) => s + e.net_proceeds, 0
);

/** Total BTC purchased across all disclosed filings */
export const TOTAL_SATA_BTC_PURCHASED = CONFIRMED_SATA_FILINGS.reduce(
  (s, e) => s + (e.btc_purchased ?? 0), 0
);

/** Date of most recent confirmed filing */
export const LATEST_SATA_FILING_DATE = CONFIRMED_SATA_FILINGS[CONFIRMED_SATA_FILINGS.length - 1].filed;
