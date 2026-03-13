import { NextResponse } from "next/server";
import { fetchFmpHistory } from "@/src/lib/utils/fetchers";
import { CONFIRMED_PURCHASES } from "@/src/lib/data/confirmed-purchases";
import { getAdso } from "@/src/lib/data/mstr-adso";

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
  market_cap_b: number;
  btc_nav_b: number;
}

/**
 * Build mNAV history from FMP price data.
 * mNAV = MSTR Market Cap / BTC NAV
 *      = (MSTR price × ADSO × 1000) / (cumulative BTC × BTC price)
 */
async function buildLiveMnav(): Promise<MnavDataPoint[] | null> {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return null;

  const today = new Date().toISOString().slice(0, 10);

  // Fetch MSTR and BTC historical prices in parallel
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

  // Process each MSTR trading day
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
    const marketCap = mstrPrice * adsoThousands * 1000;
    const btcNav = cumBtc * btcPrice;
    const mnav = btcNav > 0 ? marketCap / btcNav : 0;

    result.push({
      date,
      mnav: parseFloat(mnav.toFixed(3)),
      mstr_price: mstrPrice,
      btc_price: btcPrice,
      cum_btc: cumBtc,
      market_cap_b: parseFloat((marketCap / 1e9).toFixed(2)),
      btc_nav_b: parseFloat((btcNav / 1e9).toFixed(2)),
    });
  }

  // Sort chronologically (FMP often returns newest first)
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result.length > 0 ? result : null;
}

/**
 * Generate synthetic mNAV data when FMP is unavailable.
 * Uses purchase avg costs as BTC price proxy and known mNAV patterns.
 */
function buildMockMnav(): MnavDataPoint[] {
  const result: MnavDataPoint[] = [];

  for (const p of CONFIRMED_PURCHASES) {
    const btcPrice = p.avg_cost;
    const adsoThousands = getAdso(p.date);
    const btcNav = p.cumulative * btcPrice;

    // Approximate MSTR price from known mNAV patterns
    // Early days: ~1.0-1.2x, 2021 bull: ~2-3x, 2022 bear: ~0.5-0.8x,
    // 2023 recovery: ~1.0-1.5x, 2024-25 bull: ~1.5-3.0x
    let mnavEstimate: number;
    const year = parseInt(p.date.slice(0, 4));
    const month = parseInt(p.date.slice(5, 7));

    if (year === 2020) mnavEstimate = 1.1 + Math.random() * 0.3;
    else if (year === 2021 && month <= 4) mnavEstimate = 1.5 + Math.random() * 1.0;
    else if (year === 2021) mnavEstimate = 1.2 + Math.random() * 0.5;
    else if (year === 2022 && month <= 6) mnavEstimate = 0.7 + Math.random() * 0.3;
    else if (year === 2022) mnavEstimate = 0.5 + Math.random() * 0.2;
    else if (year === 2023 && month <= 6) mnavEstimate = 0.8 + Math.random() * 0.3;
    else if (year === 2023) mnavEstimate = 1.2 + Math.random() * 0.5;
    else if (year === 2024 && month <= 3) mnavEstimate = 1.5 + Math.random() * 0.5;
    else if (year === 2024 && month <= 9) mnavEstimate = 1.3 + Math.random() * 0.4;
    else if (year === 2024) mnavEstimate = 2.0 + Math.random() * 1.0;
    else mnavEstimate = 1.8 + Math.random() * 0.8;

    const marketCap = btcNav * mnavEstimate;
    const mstrPrice = marketCap / (adsoThousands * 1000);

    result.push({
      date: p.date,
      mnav: parseFloat(mnavEstimate.toFixed(3)),
      mstr_price: parseFloat(mstrPrice.toFixed(2)),
      btc_price: btcPrice,
      cum_btc: p.cumulative,
      market_cap_b: parseFloat((marketCap / 1e9).toFixed(2)),
      btc_nav_b: parseFloat((btcNav / 1e9).toFixed(2)),
    });
  }

  return result;
}

export async function GET() {
  try {
    // Try live data from FMP
    const live = await buildLiveMnav();
    if (live) {
      return NextResponse.json({ data: live, source: "fmp" });
    }

    // Fallback to synthetic data
    const mock = buildMockMnav();
    return NextResponse.json({ data: mock, source: "mock" });
  } catch (err) {
    console.error("[mstr-mnav] Error:", err);
    const mock = buildMockMnav();
    return NextResponse.json({ data: mock, source: "mock" });
  }
}
