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
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${ticker}&from=${IPO_DATE}&to=${today()}&apikey=${FMP_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  FMP error for ${ticker}: ${res.status}`);
      continue;
    }
    const data = await res.json();
    // Stable API returns flat array; legacy used .historical wrapper
    const hist = Array.isArray(data) ? data : (data?.historical ?? []);
    const rows = [...hist].reverse();
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

  // BTC from Coinbase Exchange API (free, no auth)
  console.log("Fetching BTC from Coinbase...");
  const COINBASE = "https://api.exchange.coinbase.com";
  const btcCandles: Array<{ date: string; close: number }> = [];
  const btcEnd = new Date();
  const btcStart = new Date(IPO_DATE);
  let chunkEnd = new Date(btcEnd);

  while (chunkEnd > btcStart) {
    const chunkStart = new Date(Math.max(chunkEnd.getTime() - 300 * 86400000, btcStart.getTime()));
    const url = `${COINBASE}/products/BTC-USD/candles?granularity=86400&start=${chunkStart.toISOString()}&end=${chunkEnd.toISOString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  Coinbase error: ${res.status}`);
      break;
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const [ts, , , , close] of data) {
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        if (date >= IPO_DATE && close > 0) {
          btcCandles.push({ date, close });
        }
      }
    }
    chunkEnd = new Date(chunkStart.getTime() - 86400000);
    await sleep(300);
  }

  // Deduplicate by date
  const btcByDate = new Map<string, number>();
  for (const c of btcCandles) btcByDate.set(c.date, c.close);
  const btcRows = Array.from(btcByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.log(`  ✓ ${btcRows.length} days fetched for BTC`);

  if (DB_URL) {
    const { db } = await import("../../src/db/client");
    const { priceHistory } = await import("../../src/db/schema");
    for (const [date, price] of btcRows) {
      try {
        await db
          .insert(priceHistory)
          .values({
            ticker: "BTC",
            ts: new Date(date + "T00:00:00Z"),
            price: price.toString(),
            source: "coinbase",
            isEod: true,
          })
          .onConflictDoNothing();
      } catch {
        // skip
      }
    }
    console.log(`  ✓ Written to DB`);
  }

  console.log("Price backfill complete.");
}

run().catch(console.error).finally(() => process.exit());
