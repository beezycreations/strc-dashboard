import { NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";
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
  const entries = CONFIRMED_PURCHASES.map((p) => ({ date: p.date, cumulative: p.cumulative }));

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
 * Read cached mNAV from daily_metrics table.
 * Returns all rows that have mnav + mstr_price + btc_price populated.
 */
async function readCachedMnav(): Promise<MnavDataPoint[] | null> {
  try {
    if (!process.env.DATABASE_URL) return null;
    const { db } = await import("@/src/db/client");
    const { dailyMetrics } = await import("@/src/db/schema");

    const rows = await db
      .select({
        date: dailyMetrics.date,
        mnav: dailyMetrics.mnav,
        mstrPrice: dailyMetrics.mstrPrice,
        btcPrice: dailyMetrics.btcPrice,
        cumBtc: dailyMetrics.cumBtc,
        evBillions: dailyMetrics.evBillions,
        btcReserveBillions: dailyMetrics.btcReserveBillions,
      })
      .from(dailyMetrics)
      .where(gte(dailyMetrics.date, FIRST_PURCHASE_DATE))
      .orderBy(dailyMetrics.date);

    // Filter to rows that have mNAV chart data populated
    const valid = rows.filter(
      (r) => r.mnav != null && r.mstrPrice != null && r.btcPrice != null && r.cumBtc != null,
    );

    if (valid.length === 0) return null;

    return valid.map((r) => ({
      date: r.date,
      mnav: parseFloat(parseFloat(r.mnav!).toFixed(3)),
      mstr_price: parseFloat(r.mstrPrice!),
      btc_price: parseFloat(r.btcPrice!),
      cum_btc: parseFloat(r.cumBtc!),
      ev_b: r.evBillions ? parseFloat(parseFloat(r.evBillions).toFixed(2)) : 0,
      btc_reserve_b: r.btcReserveBillions ? parseFloat(parseFloat(r.btcReserveBillions).toFixed(2)) : 0,
    }));
  } catch {
    return null;
  }
}

/**
 * Compute mNAV for today only (live market data).
 */
async function computeTodayMnav(btcLookup: Array<{ date: string; cumulative: number }>): Promise<MnavDataPoint | null> {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return null;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch just the last few days to get current prices
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const [mstrPrices, btcPrices] = await Promise.all([
    fetchFmpHistory("MSTR", cutoffStr, todayStr),
    fetchFmpHistory("BTCUSD", cutoffStr, todayStr),
  ]);

  if (!mstrPrices?.length || !btcPrices?.length) return null;

  // Get the most recent data point
  const mstrDay = mstrPrices[mstrPrices.length - 1];
  const btcDay = btcPrices[btcPrices.length - 1];

  const mstrPrice = Number(mstrDay.close);
  const btcPrice = Number(btcDay.close);
  if (!mstrPrice || !btcPrice) return null;

  const date = mstrDay.date;
  const cumBtc = getCumulativeBtc(date, btcLookup);
  if (cumBtc <= 0) return null;

  const adsoThousands = getAdso(date);
  const ev = getEvComponents(date);
  const { mnav, evTotal, btcReserve } = computeHistoricalMnav(mstrPrice, adsoThousands, cumBtc, btcPrice, ev);

  return {
    date,
    mnav: parseFloat(mnav.toFixed(3)),
    mstr_price: mstrPrice,
    btc_price: btcPrice,
    cum_btc: cumBtc,
    ev_b: parseFloat((evTotal / 1e9).toFixed(2)),
    btc_reserve_b: parseFloat((btcReserve / 1e9).toFixed(2)),
  };
}

/**
 * Full FMP-based computation (fallback when DB cache is empty).
 */
async function buildLiveMnav(): Promise<MnavDataPoint[] | null> {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return null;

  const todayStr = new Date().toISOString().slice(0, 10);

  const [mstrPrices, btcPrices, btcLookup] = await Promise.all([
    fetchFmpHistory("MSTR", FIRST_PURCHASE_DATE, todayStr),
    fetchFmpHistory("BTCUSD", FIRST_PURCHASE_DATE, todayStr),
    buildCumulativeBtcLookup(),
  ]);

  if (!mstrPrices?.length || !btcPrices?.length) return null;

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
    // 1. Try cached mNAV from DB (fast, no FMP API calls for historical data)
    const cached = await readCachedMnav();

    if (cached && cached.length > 50) {
      // Have substantial cached history — only compute today's live value
      const btcLookup = await buildCumulativeBtcLookup();
      const todayPoint = await computeTodayMnav(btcLookup);

      // Merge: replace or append today's data point
      const lastCached = cached[cached.length - 1];
      if (todayPoint && todayPoint.date >= lastCached.date) {
        // Replace if same date, append if newer
        if (todayPoint.date === lastCached.date) {
          cached[cached.length - 1] = todayPoint;
        } else {
          cached.push(todayPoint);
        }
      }

      return NextResponse.json({ data: cached, source: "cached+live" });
    }

    // 2. Fallback: full FMP computation (DB cache empty or too small)
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
