import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import {
  computeTrancheMetrics,
  computePoolNav,
  computeSeniorNavPerUnit,
  computeJuniorNavPerUnit,
  type TrancheResult,
} from "@/src/lib/calculators/tranche-metrics";

export const revalidate = 0;

const MOCK_RATE = 11.25;
const MOCK_STRC_PRICE = 100.45;
const MOCK_POOL_SHARES = 10_000_000;
const MOCK_ACCRUED = 250_000;

interface TrancheResponse {
  strc_rate_pct: number;
  strc_price: number;
  pool_nav: number;
  configs: (TrancheResult & {
    pool_nav: number;
    senior_nav_per_unit: number;
    junior_nav_per_unit: number;
  })[];
  last_updated: string;
}

function buildResponse(ratePct: number, strcPrice: number, poolShares: number, accrued: number): TrancheResponse {
  const poolNav = computePoolNav(strcPrice, poolShares, accrued);
  const tranches = computeTrancheMetrics(ratePct);

  const configs = tranches.map((t) => {
    const seniorUnits = poolShares * t.senior_pct;
    const juniorUnits = poolShares * t.junior_pct;
    const seniorTotalNav = computeSeniorNavPerUnit(poolNav, t.senior_pct, seniorUnits) * seniorUnits;

    return {
      ...t,
      pool_nav: poolNav,
      senior_nav_per_unit: computeSeniorNavPerUnit(poolNav, t.senior_pct, seniorUnits),
      junior_nav_per_unit: computeJuniorNavPerUnit(poolNav, seniorTotalNav, juniorUnits),
    };
  });

  return {
    strc_rate_pct: ratePct,
    strc_price: strcPrice,
    pool_nav: poolNav,
    configs,
    last_updated: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const { db } = await import("@/src/db/client");
    const { strcRateHistory, priceHistory } = await import("@/src/db/schema");

    // Get latest rate
    const [latestRate] = await db
      .select()
      .from(strcRateHistory)
      .orderBy(desc(strcRateHistory.effectiveDate))
      .limit(1);

    // Get latest STRC price
    const [latestPrice] = await db
      .select()
      .from(priceHistory)
      .orderBy(desc(priceHistory.ts))
      .limit(1);

    if (!latestRate) {
      return NextResponse.json(buildResponse(MOCK_RATE, MOCK_STRC_PRICE, MOCK_POOL_SHARES, MOCK_ACCRUED));
    }

    const ratePct = parseFloat(latestRate.ratePct);
    const strcPrice = latestPrice ? parseFloat(latestPrice.price) : MOCK_STRC_PRICE;

    return NextResponse.json(buildResponse(ratePct, strcPrice, MOCK_POOL_SHARES, MOCK_ACCRUED));
  } catch {
    return NextResponse.json(buildResponse(MOCK_RATE, MOCK_STRC_PRICE, MOCK_POOL_SHARES, MOCK_ACCRUED));
  }
}
