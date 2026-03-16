import { NextResponse } from "next/server";
import { fetchFmpHistory } from "@/src/lib/utils/fetchers";
import { CONFIRMED_PURCHASES } from "@/src/lib/data/confirmed-purchases";
import { getAdso } from "@/src/lib/data/mstr-adso";
import { getEvComponents, type EvComponents } from "@/src/lib/data/capital-structure";

export const revalidate = 0;

const FIRST_PURCHASE_DATE = "2020-08-10";

/**
 * Get cumulative BTC held as of a given date (step function from confirmed purchases).
 */
function getCumulativeBtc(dateStr: string): number {
  let cum = 0;
  for (const p of CONFIRMED_PURCHASES) {
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

  const [mstrPrices, btcPrices] = await Promise.all([
    fetchFmpHistory("MSTR", FIRST_PURCHASE_DATE, today),
    fetchFmpHistory("BTCUSD", FIRST_PURCHASE_DATE, today),
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

    const cumBtc = getCumulativeBtc(date);
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

/**
 * Generate deterministic mNAV data when FMP is unavailable.
 * Uses era-based mNAV estimates (no randomness) for data integrity.
 */
function buildMockMnav(): MnavDataPoint[] {
  const result: MnavDataPoint[] = [];

  function mnavForDate(dateStr: string): number {
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(5, 7));
    if (year === 2020) return 1.1;
    if (year === 2021 && month <= 4) return 2.2;
    if (year === 2021) return 1.5;
    if (year === 2022 && month <= 6) return 0.8;
    if (year === 2022) return 0.6;
    if (year === 2023 && month <= 6) return 1.05;
    if (year === 2023) return 1.3;
    if (year === 2024 && month <= 3) return 1.6;
    if (year === 2024 && month <= 9) return 1.4;
    if (year === 2024) return 3.0;
    if (year === 2025 && month <= 6) return 2.2;
    if (year === 2025) return 1.8;
    return 1.6;
  }

  for (const p of CONFIRMED_PURCHASES) {
    const btcPrice = p.avg_cost;
    const adsoThousands = getAdso(p.date);
    const ev = getEvComponents(p.date);
    const btcReserve = p.cumulative * btcPrice;

    const mnavEstimate = mnavForDate(p.date);
    const evTotal = btcReserve * mnavEstimate;
    const marketCap = evTotal - ev.convertDebt - ev.prefNotional + ev.cash;
    const mstrPrice = marketCap > 0 ? marketCap / (adsoThousands * 1000) : 0;

    result.push({
      date: p.date,
      mnav: parseFloat(mnavEstimate.toFixed(3)),
      mstr_price: parseFloat(mstrPrice.toFixed(2)),
      btc_price: btcPrice,
      cum_btc: p.cumulative,
      ev_b: parseFloat((evTotal / 1e9).toFixed(2)),
      btc_reserve_b: parseFloat((btcReserve / 1e9).toFixed(2)),
    });
  }

  return result;
}

export async function GET() {
  try {
    const live = await buildLiveMnav();
    if (live) {
      return NextResponse.json({ data: live, source: "fmp" });
    }
    const mock = buildMockMnav();
    return NextResponse.json({ data: mock, source: "mock" });
  } catch (err) {
    console.error("[mstr-mnav] Error:", err);
    const mock = buildMockMnav();
    return NextResponse.json({ data: mock, source: "mock" });
  }
}
