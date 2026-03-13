/**
 * Seed STRC Rate History
 * Inserts confirmed STRC dividend rate history into strc_rate_history table.
 * Source: MSTR dashboard / Strategy 8-K filings
 *
 * Run: npx tsx scripts/backfill/seed-strc-rates.ts
 */

import "dotenv/config";

const DB_URL = process.env.DATABASE_URL;

// Confirmed STRC rate history from MSTR dashboard / 8-K filings
// effectiveDate = first day of the dividend period
// announcedDate = date the rate was announced via 8-K
const CONFIRMED_RATES = [
  { effectiveDate: "2025-08-01", ratePct: "9.0000", announcedDate: "2025-07-29", notes: "IPO rate — accrued from Jul 29 through Aug 31, 2025" },
  { effectiveDate: "2025-09-01", ratePct: "10.0000", announcedDate: "2025-08-14", notes: null },
  { effectiveDate: "2025-10-01", ratePct: "10.2500", announcedDate: "2025-09-13", notes: null },
  { effectiveDate: "2025-11-01", ratePct: "10.5000", announcedDate: "2025-10-15", notes: null },
  { effectiveDate: "2025-12-01", ratePct: "10.7500", announcedDate: "2025-11-15", notes: null },
  { effectiveDate: "2026-01-01", ratePct: "11.0000", announcedDate: "2025-12-13", notes: null },
  { effectiveDate: "2026-02-01", ratePct: "11.2500", announcedDate: "2026-01-15", notes: null },
  { effectiveDate: "2026-03-01", ratePct: "11.5000", announcedDate: "2026-02-14", notes: null },
];

async function run() {
  if (!DB_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const { db } = await import("../../src/db/client");
  const { strcRateHistory } = await import("../../src/db/schema");

  console.log("Seeding STRC rate history...");

  let inserted = 0;
  for (const rate of CONFIRMED_RATES) {
    try {
      await db
        .insert(strcRateHistory)
        .values({
          effectiveDate: rate.effectiveDate,
          ratePct: rate.ratePct,
          announcedDate: rate.announcedDate,
          isConfirmed: true,
          source: "MSTR dashboard / 8-K filings",
          notes: rate.notes,
        })
        .onConflictDoNothing();
      inserted++;
      console.log(`  ✓ ${rate.effectiveDate}: ${rate.ratePct}%`);
    } catch (e) {
      console.error(`  ✗ ${rate.effectiveDate}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nSeeded ${inserted} rate entries.`);
}

run().catch(console.error).finally(() => process.exit());
