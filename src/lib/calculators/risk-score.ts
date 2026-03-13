/**
 * Composite Risk Score Calculator
 * Source: Phase 2 Section 6.5.7
 */

export interface RiskScoreInputs {
  btc_coverage_ratio: number;
  net_yield_pct: number;
  sofr_pct: number;
  strike_otm_pct: number;
  iv_percentile: number;
  days_to_announcement: number;
}

export interface RiskScoreComponents {
  btc: number;
  yield: number;
  strike: number;
  iv: number;
  days: number;
}

export const RISK_WEIGHTS = {
  btc: 0.30,
  yield: 0.25,
  strike: 0.20,
  iv: 0.15,
  days: 0.10,
} as const;

export function calcComponentScores(inputs: RiskScoreInputs): RiskScoreComponents {
  return {
    btc: Math.min(10, Math.max(0, ((inputs.btc_coverage_ratio - 1) / 3) * 10)),
    yield: Math.min(10, Math.max(0, ((inputs.net_yield_pct - inputs.sofr_pct) / 7) * 10)),
    strike: Math.max(0, 10 - inputs.strike_otm_pct / 2),
    iv: Math.max(0, (100 - inputs.iv_percentile) / 10),
    days: Math.min(10, inputs.days_to_announcement / 3),
  };
}

export function calcComposite(scores: RiskScoreComponents): number {
  return (
    scores.btc * RISK_WEIGHTS.btc +
    scores.yield * RISK_WEIGHTS.yield +
    scores.strike * RISK_WEIGHTS.strike +
    scores.iv * RISK_WEIGHTS.iv +
    scores.days * RISK_WEIGHTS.days
  );
}

export function riskSignal(composite: number): "safe" | "watch" | "alert" {
  if (composite >= 7.0) return "safe";
  if (composite >= 4.0) return "watch";
  return "alert";
}
