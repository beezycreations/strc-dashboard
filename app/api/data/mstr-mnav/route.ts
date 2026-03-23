import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { fetchFmpHistory } from "@/src/lib/utils/fetchers";
import { CONFIRMED_PURCHASES, LATEST_CONFIRMED_DATE } from "@/src/lib/data/confirmed-purchases";
import { getAdso } from "@/src/lib/data/mstr-adso";
import { getEvComponents, type EvComponents } from "@/src/lib/data/capital-structure";

export const revalidate = 0;

const FIRST_PURCHASE_DATE = "2020-08-10";

/**
 * Merge static confirmed purchases with any newer DB entries.
 * Returns a step-function lookup: date → cumulative BTC.
 */
async function buildCumulativeBtcLookup(): Promise<Array<{ date: string; cumulative: number }>> {
  // Start with static data
  const entries = CONFIRMED_PURCHASES.map((p) => ({ date: p.date, cumulative: p.cumulative }));

  // Try to extend with DB entries newer than static data
  try {
    if (!process.env.DATABASE_URL) return entries;
    const { db } = await import("@/src/db/client");
    const { btcHoldings } = await import("@/src/db/schema");

    const dbRows = await db
      .select({ reportDate: btcHoldings.reportDate, btcCount: btcHoldings.btcCount })
      .from(btcHoldings)
      .orderBy(desc(btcHoldings.reportDate))
      .limit(20);

    for (const row of dbRows) {
      if (row.reportDate > LATEST_CONFIRMED_DATE) {
        entries.push({ date: row.reportDate, cumulative: row.btcCount });
      }
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    // Fall through with static data only
  }

  return entries;
}

/**
 * Get cumulative BTC held as of a given date (step function).
 */
function getCumulativeBtc(dateStr: string, lookup: Array<{ date: string; cumulative: number }>): number {
  let cum = 0;
  for (const p of lookup) {
    if (p.date <= dateStr) cum = p.cumulative;
    else break;
  }
  return cum;
}

interface MnavDataPoint {
  date: string;
  mnav: number;
  mstr_price: number;
  btc_price: number;
  cum_btc: number;
  ev_b: number;
  btc_reserve_b: number;
}

/**
 * Compute mNAV per Strategy's methodology:
 *   mNAV = Enterprise Value / BTC Reserve
 *   EV = Market Cap + Convertible Debt + Preferred Notional - Cash
 *   BTC Reserve = BTC Holdings × BTC Price
 */
function computeHistoricalMnav(
  mstrPrice: number,
  adsoThousands: number,
  cumBtc: number,
  btcPrice: number,
  ev: EvComponents,
): { mnav: number; evTotal: number; btcReserve: number } {
  const marketCap = mstrPrice * adsoThousands * 1000;
  const evTotal = marketCap + ev.convertDebt + ev.prefNotional - ev.cash;
  const btcReserve = cumBtc * btcPrice;
  const mnav = btcReserve > 0 ? evTotal / btcReserve : 0;
  return { mnav, evTotal, btcReserve };
}

/**
 * Build mNAV history from FMP price data.
 */
async function buildLiveMnav(): Promise<MnavDataPoint[] | null> {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return null;

  const today = new Date().toISOString().slice(0, 10);

  const [mstrPrices, btcPrices, btcLookup] = await Promise.all([
    fetchFmpHistory("MSTR", FIRST_PURCHASE_DATE, today),
    fetchFmpHistory("BTCUSD", FIRST_PURCHASE_DATE, today),
    buildCumulativeBtcLookup(),
  ]);

  if (!mstrPrices?.length || !btcPrices?.length) return null;

  // Build BTC price lookup by date
  const btcByDate = new Map<string, number>();
  for (const p of btcPrices) {
    if (p.date && p.close) btcByDate.set(p.date, Number(p.close));
  }

  const result: MnavDataPoint[] = [];
  for (const day of mstrPrices) {
    const date = day.date;
    if (!date || date < FIRST_PURCHASE_DATE) continue;

    const mstrPrice = Number(day.close);
    if (!mstrPrice || mstrPrice <= 0) continue;

    const btcPrice = btcByDate.get(date);
    if (!btcPrice || btcPrice <= 0) continue;

    const cumBtc = getCumulativeBtc(date, btcLookup);
    if (cumBtc <= 0) continue;

    const adsoThousands = getAdso(date);
    const ev = getEvComponents(date);
    const { mnav, evTotal, btcReserve } = computeHistoricalMnav(mstrPrice, adsoThousands, cumBtc, btcPrice, ev);

    result.push({
      date,
      mnav: parseFloat(mnav.toFixed(3)),
      mstr_price: mstrPrice,
      btc_price: btcPrice,
      cum_btc: cumBtc,
      ev_b: parseFloat((evTotal / 1e9).toFixed(2)),
      btc_reserve_b: parseFloat((btcReserve / 1e9).toFixed(2)),
    });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result.length > 0 ? result : null;
}

export async function GET() {
  try {
    const live = await buildLiveMnav();
    if (live) {
      return NextResponse.json({ data: live, source: "fmp" });
    }
    return NextResponse.json({ data: [], source: "unavailable" });
  } catch (err) {
    console.error("[mstr-mnav] Error:", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}
