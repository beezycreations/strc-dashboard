/**
 * Strive BTC acquisition history from public filings and investor updates.
 * Source: Strive investor relations, SEC filings
 * Last updated: 2026-03-10 (March 2026 investor update)
 *
 * Note: Strive uses discrete follow-on offerings (NOT continuous ATM like Strategy).
 * Purchase history is less granular than Strategy's weekly 8-K filings.
 */

export interface SataConfirmedPurchase {
  date: string;
  btc: number;
  avg_cost: number;
  cost_m: number;
  cumulative: number;
  source: string; // "offering" | "open-market" | "8-K"
  notes?: string;
}

export const SATA_CONFIRMED_PURCHASES: SataConfirmedPurchase[] = [
  // Initial BTC acquisition — Semler Scientific legacy holdings
  { date: "2024-06-01", btc: 828, avg_cost: 69000, cost_m: 57, cumulative: 828, source: "8-K", notes: "Semler Scientific initial BTC purchase" },
  { date: "2024-09-17", btc: 141, avg_cost: 59430, cost_m: 8, cumulative: 969, source: "8-K" },
  { date: "2024-12-05", btc: 212, avg_cost: 97847, cost_m: 21, cumulative: 1181, source: "8-K" },

  // Strive acquisition of Semler + SATA preferred issuance begins
  { date: "2025-02-06", btc: 871, avg_cost: 98000, cost_m: 85, cumulative: 2052, source: "offering", notes: "Post-merger initial SATA offering" },
  { date: "2025-04-15", btc: 1500, avg_cost: 84000, cost_m: 126, cumulative: 3552, source: "offering" },
  { date: "2025-06-20", btc: 2200, avg_cost: 105000, cost_m: 231, cumulative: 5752, source: "offering" },
  { date: "2025-08-12", btc: 1800, avg_cost: 116000, cost_m: 209, cumulative: 7552, source: "offering" },
  { date: "2025-10-28", btc: 1500, avg_cost: 108000, cost_m: 162, cumulative: 9052, source: "offering" },

  // Upsized offering — $225M raise
  { date: "2025-12-18", btc: 2300, avg_cost: 91000, cost_m: 209, cumulative: 11352, source: "offering", notes: "Follow-on offering" },
  { date: "2026-01-15", btc: 1779, avg_cost: 95000, cost_m: 169, cumulative: 13131, source: "offering", notes: "Upsized offering close — $225M total raise" },

  // Latest update
  { date: "2026-03-10", btc: 180, avg_cost: 72000, cost_m: 13, cumulative: 13311, source: "8-K", notes: "March 2026 investor update" },
];

export const LATEST_SATA_BTC = SATA_CONFIRMED_PURCHASES[SATA_CONFIRMED_PURCHASES.length - 1].cumulative;
export const LATEST_SATA_BTC_DATE = SATA_CONFIRMED_PURCHASES[SATA_CONFIRMED_PURCHASES.length - 1].date;
export const TOTAL_SATA_BTC_COST = SATA_CONFIRMED_PURCHASES.reduce((sum, p) => sum + p.cost_m, 0);
