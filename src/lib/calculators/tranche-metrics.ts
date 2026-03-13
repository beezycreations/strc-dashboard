/**
 * Tranche Product Metrics Calculator
 * Source: Phase 1 Section 7, Phase 3 Section 2.4
 */

const SENIOR_TARGET_RATE = 7.5;

export const TRANCHE_CONFIGS = [
  { name: "A" as const, seniorPct: 0.50, juniorPct: 0.50 },
  { name: "B" as const, seniorPct: 0.67, juniorPct: 0.33 },
  { name: "C" as const, seniorPct: 0.75, juniorPct: 0.25 },
];

export interface TrancheResult {
  name: "A" | "B" | "C";
  senior_pct: number;
  junior_pct: number;
  junior_yield_pct: number;
  scr: number;
  est: number;
  rfb: number;
  floor_pct: number;
  scr_status: "pass" | "watch" | "cash_trap" | "eod";
  est_status: "pass" | "watch" | "cash_trap" | "eod";
  rfb_status: "pass" | "watch" | "cash_trap" | "eod";
}

export function computeTrancheMetrics(strcRatePct: number): TrancheResult[] {
  return TRANCHE_CONFIGS.map((c) => {
    const scr = strcRatePct / (SENIOR_TARGET_RATE * c.seniorPct);
    const est = strcRatePct - SENIOR_TARGET_RATE * c.seniorPct;
    const juniorYield = est / c.juniorPct;
    const rfb = est;
    const floor = SENIOR_TARGET_RATE * c.seniorPct;

    return {
      name: c.name,
      senior_pct: c.seniorPct,
      junior_pct: c.juniorPct,
      junior_yield_pct: juniorYield,
      scr,
      est,
      rfb,
      floor_pct: floor,
      scr_status: scr >= 1.25 ? "pass" : scr >= 1.1 ? "watch" : scr >= 1.0 ? "cash_trap" : "eod",
      est_status: est >= 2.0 ? "pass" : est >= 1.0 ? "watch" : est >= 0 ? "cash_trap" : "eod",
      rfb_status: rfb >= 3.0 ? "pass" : rfb >= 1.5 ? "watch" : rfb >= 0 ? "cash_trap" : "eod",
    };
  });
}

export function computePoolNav(
  strcPrice: number,
  sharesInPool: number,
  accruedIncome: number
): number {
  return strcPrice * sharesInPool + accruedIncome;
}

export function computeSeniorNavPerUnit(
  poolNav: number,
  seniorPct: number,
  seniorUnits: number,
  seniorTargetPar = 100
): number {
  return Math.min(seniorTargetPar, (poolNav * seniorPct) / seniorUnits);
}

export function computeJuniorNavPerUnit(
  poolNav: number,
  seniorTotalNav: number,
  juniorUnits: number
): number {
  return Math.max(0, poolNav - seniorTotalNav) / juniorUnits;
}
