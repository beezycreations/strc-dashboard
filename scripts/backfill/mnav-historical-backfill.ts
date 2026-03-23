/**
 * mNAV Historical Backfill Script
 *
 * Fetches MSTR + BTC price history from FMP and computes mNAV for every trading day
 * from Strategy's first BTC purchase (2020-08-10) through the present.
 * Writes mNAV chart data (mstr_price, btc_price, cum_btc, ev_billions, btc_reserve_billions)
 * to daily_metrics table so the mNAV chart can load from cache.
 *
 * Run: npx tsx scripts/backfill/mnav-historical-backfill.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { CONFIRMED_PURCHASES } from "../../src/lib/data/confirmed-purchases";
import { getAdso } from "../../src/lib/data/mstr-adso";
import { getEvComponents, mnavRegimeFromValue } from "../../src/lib/data/capital-structure";

const FIRST_PURCHASE_DATE = "2020-08-10";
const FMP_KEY = process.env.FMP_API_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!FMP_KEY) throw new Error("FMP_API_KEY required");
if (!DB_URL) throw new Error("DATABASE_URL required");

const sql = neon(DB_URL);

function getCumulativeBtc(dateStr: string): number {
  let cum = 0;
  for (const p of CONFIRMED_PURCHASES) {
    if (p.date <= dateStr) cum = p.cumulative;
    else break;
  }
  return cum;
}

async function fetchFmpPrices(symbol: string): Promise<Array<{ date: string; close: number }>> {
  const today = new Date().toISOString().slice(0, 10);
  // Use the stable (non-legacy) endpoint
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=${FIRST_PURCHASE_DATE}&to=${today}&apikey=${FMP_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP fetch failed for ${symbol}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // Stable API returns flat array (no .historical wrapper)
  const arr = Array.isArray(data) ? data : (data.historical ?? []);
  return arr
    .map((d: { date: string; close: number }) => ({ date: d.date, close: d.close }))
    .filter((d: { date: string; close: number }) => d.date && d.close > 0)
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
}

async function main() {
  console.log("Fetching MSTR and BTC price history from FMP...");
  const [mstrPrices, btcPrices] = await Promise.all([
    fetchFmpPrices("MSTR"),
    fetchFmpPrices("BTCUSD"),
  ]);
  console.log(`  MSTR: ${mstrPrices.length} days, BTC: ${btcPrices.length} days`);

  const btcByDate = new Map<string, number>();
  for (const p of btcPrices) {
    btcByDate.set(p.date, p.close);
  }

  let upsertCount = 0;
  let skipCount = 0;

  for (const day of mstrPrices) {
    const date = day.date;
    if (date < FIRST_PURCHASE_DATE) continue;

    const mstrPrice = day.close;
    if (!mstrPrice || mstrPrice <= 0) continue;

    const btcPrice = btcByDate.get(date);
    if (!btcPrice || btcPrice <= 0) continue;

    const cumBtc = getCumulativeBtc(date);
    if (cumBtc <= 0) { skipCount++; continue; }

    const adsoThousands = getAdso(date);
    const ev = getEvComponents(date);
    const marketCap = mstrPrice * adsoThousands * 1000;
    const evTotal = marketCap + ev.convertDebt + ev.prefNotional - ev.cash;
    const btcReserve = cumBtc * btcPrice;
    const mnav = btcReserve > 0 ? evTotal / btcReserve : 0;

    const evBillions = evTotal / 1e9;
    const btcReserveBillions = btcReserve / 1e9;
    const mnavRegime = mnavRegimeFromValue(mnav);

    try {
      await sql`
        INSERT INTO daily_metrics (date, mnav, mnav_regime, mstr_price, btc_price, cum_btc, ev_billions, btc_reserve_billions)
        VALUES (${date}, ${mnav.toFixed(4)}, ${mnavRegime}, ${mstrPrice.toFixed(4)}, ${btcPrice.toFixed(2)}, ${Math.round(cumBtc)}, ${evBillions.toFixed(4)}, ${btcReserveBillions.toFixed(4)})
        ON CONFLICT (date) DO UPDATE SET
          mnav = COALESCE(EXCLUDED.mnav, daily_metrics.mnav),
          mnav_regime = COALESCE(EXCLUDED.mnav_regime, daily_metrics.mnav_regime),
          mstr_price = COALESCE(EXCLUDED.mstr_price, daily_metrics.mstr_price),
          btc_price = COALESCE(EXCLUDED.btc_price, daily_metrics.btc_price),
          cum_btc = COALESCE(EXCLUDED.cum_btc, daily_metrics.cum_btc),
          ev_billions = COALESCE(EXCLUDED.ev_billions, daily_metrics.ev_billions),
          btc_reserve_billions = COALESCE(EXCLUDED.btc_reserve_billions, daily_metrics.btc_reserve_billions)
      `;
      upsertCount++;
    } catch (err) {
      console.error(`  Error on ${date}:`, err instanceof Error ? err.message : err);
    }

    if (upsertCount % 200 === 0) {
      console.log(`  Processed ${upsertCount} days (${date})`);
    }
  }

  console.log(`\nBackfill complete: ${upsertCount} rows upserted, ${skipCount} skipped (no BTC holdings)`);

  // Verify
  const result = await sql`
    SELECT count(*) as cnt, min(date) as earliest, max(date) as latest
    FROM daily_metrics WHERE mnav IS NOT NULL AND mstr_price IS NOT NULL
  `;
  console.log("DB state:", result[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
