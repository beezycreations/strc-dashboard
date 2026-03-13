/**
 * Price Backfill Script
 * Pulls all EOD price history from IPO date to today.
 * Run: npx tsx scripts/backfill/price-backfill.ts
 * Source: Phase 3 Section 5.1
 */

import "dotenv/config";

const FMP_KEY = process.env.FMP_API_KEY;
const DB_URL = process.env.DATABASE_URL;
const IPO_DATE = "2025-07-29";
const TICKERS_FMP = ["STRC", "STRF", "STRK", "STRD", "MSTR"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  if (!FMP_KEY) {
    console.error("Missing FMP_API_KEY");
    process.exit(1);
  }
  if (!DB_URL) {
    console.error("Missing DATABASE_URL — running in dry-run mode");
  }

  console.log(`Starting price backfill from ${IPO_DATE} to ${today()}`);

  // FMP equity tickers
  for (const ticker of TICKERS_FMP) {
    console.log(`Fetching ${ticker}...`);
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?from=${IPO_DATE}&to=${today()}&apikey=${FMP_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  FMP error for ${ticker}: ${res.status}`);
      continue;
    }
    const data = await res.json();
    const rows = [...(data.historical ?? [])].reverse();
    console.log(`  ✓ ${rows.length} days fetched for ${ticker}`);

    if (DB_URL) {
      // Import DB client dynamically to avoid issues without DB
      const { db } = await import("../../src/db/client");
      const { priceHistory } = await import("../../src/db/schema");
      for (const row of rows) {
        try {
          await db
            .insert(priceHistory)
            .values({
              ticker,
              ts: new Date(row.date + "T16:00:00-05:00"),
              price: row.close.toString(),
              volume: row.volume?.toString() ?? null,
              source: "fmp",
              isEod: true,
            })
            .onConflictDoNothing();
        } catch {
          // skip duplicate
        }
      }
      console.log(`  ✓ Written to DB`);
    }

    await sleep(300);
  }

  // BTC from CoinGecko
  console.log("Fetching BTC...");
  const btcUrl = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily`;
  const btcRes = await fetch(btcUrl);
  if (btcRes.ok) {
    const { prices } = await btcRes.json();
    const btcRows = (prices as [number, number][]).filter(
      ([ts]) => new Date(ts).toISOString().slice(0, 10) >= IPO_DATE
    );
    console.log(`  ✓ ${btcRows.length} days fetched for BTC`);

    if (DB_URL) {
      const { db } = await import("../../src/db/client");
      const { priceHistory } = await import("../../src/db/schema");
      for (const [tsMs, price] of btcRows) {
        try {
          await db
            .insert(priceHistory)
            .values({
              ticker: "BTC",
              ts: new Date(tsMs),
              price: price.toString(),
              source: "coingecko",
              isEod: true,
            })
            .onConflictDoNothing();
        } catch {
          // skip
        }
      }
      console.log(`  ✓ Written to DB`);
    }
  }

  console.log("Price backfill complete.");
}

run().catch(console.error).finally(() => process.exit());
