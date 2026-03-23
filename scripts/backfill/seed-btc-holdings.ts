/**
 * Seed btc_holdings table from CONFIRMED_PURCHASES static data.
 * Run: npx tsx scripts/backfill/seed-btc-holdings.ts
 */

import "dotenv/config";
import { CONFIRMED_PURCHASES } from "../../src/lib/data/confirmed-purchases";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const { db } = await import("../../src/db/client");
  const { btcHoldings } = await import("../../src/db/schema");

  console.log(`Seeding btc_holdings from ${CONFIRMED_PURCHASES.length} confirmed purchases...`);

  let inserted = 0;
  for (const p of CONFIRMED_PURCHASES) {
    try {
      await db
        .insert(btcHoldings)
        .values({
          reportDate: p.date,
          btcCount: p.cumulative,
          avgCostUsd: String(p.avg_cost),
          totalCostUsd: String(p.cost_m * 1_000_000),
          isEstimated: false,
          confidence: "1.0",
          source: "8-K confirmed",
        })
        .onConflictDoNothing();
      inserted++;
    } catch {
      // skip duplicates
    }
  }

  console.log(`Done: ${inserted} rows inserted into btc_holdings.`);
}

run().catch(console.error).finally(() => process.exit());
