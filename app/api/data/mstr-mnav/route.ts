import { NextResponse } from "next/server";
import { fetchFmpHistory } from "@/src/lib/utils/fetchers";
import { CONFIRMED_PURCHASES } from "@/src/lib/data/confirmed-purchases";
import { getAdso } from "@/src/lib/data/mstr-adso";

export const revalidate = 0;

const FIRST_PURCHASE_DATE = "2020-08-10";

// ── Historical EV components ──────────────────────────────────────────
// mNAV = Enterprise Value / BTC Reserve
// EV = Market Cap + Convertible Debt + Preferred Notional - Cash
//
// These components changed over time as MSTR issued convertible notes
// and preferred stock. We model them as a step function by date.

interface EvComponents {
  convertDebt: number;    // Aggregate principal of convertible notes
  prefNotional: number;   // Aggregate notional of perpetual preferred stock
  cash: number;           // Cash & equivalents
}

// Historical EV component timeline (approximate, from SEC filings)
// Each entry takes effect on its date and applies until the next entry.
const EV_TIMELINE: Array<{ date: string } & EvComponents> = [
  // 2020: First BTC purchase, $500M convert outstanding
  { date: "2020-08-10", convertDebt: 0,              prefNotional: 0, cash: 50_000_000 },
  // Dec 2020: $650M convertible notes
  { date: "2020-12-11", convertDebt: 650_000_000,    prefNotional: 0, cash: 60_000_000 },
  // Feb 2021: $1.05B additional converts
  { date: "2021-02-19", convertDebt: 1_700_000_000,  prefNotional: 0, cash: 60_000_000 },
  // Jun 2021: $500M senior secured notes + converts
  { date: "2021-06-14", convertDebt: 2_200_000_000,  prefNotional: 0, cash: 70_000_000 },
  // Mar 2024: $800M additional converts
  { date: "2024-03-08", convertDebt: 3_000_000_000,  prefNotional: 0, cash: 80_000_000 },
  // Sep 2024: More converts
  { date: "2024-09-20", convertDebt: 4_250_000_000,  prefNotional: 0, cash: 100_000_000 },
  // Nov 2024: Massive convert issuance ($3B+ in Q4 2024)
  { date: "2024-11-21", convertDebt: 7_250_000_000,  prefNotional: 0, cash: 200_000_000 },
  // Jan 2025: STRF launched ($711M)
  { date: "2025-01-24", convertDebt: 7_250_000_000,  prefNotional: 711_000_000, cash: 500_000_000 },
  // Feb 2025: STRC launched, converts reach ~$8.2B
  { date: "2025-02-20", convertDebt: 8_200_000_000,  prefNotional: 711_000_000 + 1_000_000_000, cash: 600_000_000 },
  // May 2025: STRC ATM ramps, STRK launched
  { date: "2025-05-01", convertDebt: 8_200_000_000,  prefNotional: 711_000_000 + 2_500_000_000 + 700_000_000, cash: 800_000_000 },
  // Jul 2025: STRD launched, STRC at ~$3.4B
  { date: "2025-07-25", convertDebt: 8_200_000_000,  prefNotional: 711_000_000 + 3_400_000_000 + 700_000_000 + 1_000_000_000, cash: 1_000_000_000 },
];

function getEvComponents(dateStr: string): EvComponents {
  let result = EV_TIMELINE[0];
  for (const entry of EV_TIMELINE) {
    if (entry.date <= dateStr) result = entry;
    else break;
  }
  return { convertDebt: result.convertDebt, prefNotional: result.prefNotional, cash: result.cash };
}

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
function computeMnav(
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
    const { mnav, evTotal, btcReserve } = computeMnav(mstrPrice, adsoThousands, cumBtc, btcPrice, ev);

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
 * Generate synthetic mNAV data when FMP is unavailable.
 */
function buildMockMnav(): MnavDataPoint[] {
  const result: MnavDataPoint[] = [];

  for (const p of CONFIRMED_PURCHASES) {
    const btcPrice = p.avg_cost;
    const adsoThousands = getAdso(p.date);
    const ev = getEvComponents(p.date);
    const btcReserve = p.cumulative * btcPrice;

    // Approximate MSTR price to produce realistic mNAV
    // Early: ~1.0-1.5x, 2021 bull: ~2-3x, 2022 bear: ~0.5-0.8x,
    // 2023 recovery: ~1.0-1.5x, 2024-25 bull: ~1.5-3.0x
    const year = parseInt(p.date.slice(0, 4));
    const month = parseInt(p.date.slice(5, 7));
    let mnavEstimate: number;

    if (year === 2020) mnavEstimate = 1.0 + Math.random() * 0.2;
    else if (year === 2021 && month <= 4) mnavEstimate = 1.8 + Math.random() * 0.8;
    else if (year === 2021) mnavEstimate = 1.3 + Math.random() * 0.5;
    else if (year === 2022 && month <= 6) mnavEstimate = 0.7 + Math.random() * 0.2;
    else if (year === 2022) mnavEstimate = 0.5 + Math.random() * 0.15;
    else if (year === 2023 && month <= 6) mnavEstimate = 0.9 + Math.random() * 0.3;
    else if (year === 2023) mnavEstimate = 1.1 + Math.random() * 0.4;
    else if (year === 2024 && month <= 3) mnavEstimate = 1.4 + Math.random() * 0.5;
    else if (year === 2024 && month <= 9) mnavEstimate = 1.2 + Math.random() * 0.4;
    else if (year === 2024) mnavEstimate = 2.5 + Math.random() * 1.0;
    else mnavEstimate = 1.5 + Math.random() * 0.8;

    const evTotal = btcReserve * mnavEstimate;
    // Back-solve MSTR price: marketCap = evTotal - debt - pref + cash
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
