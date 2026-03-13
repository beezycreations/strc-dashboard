/**
 * Hedge Calculator — Options-based position sizing
 * Source: Phase 2 Sections 6.5.3–6.5.6
 */

export type HedgeStrategy = "atm_put" | "put_spread" | "collar";
export type HedgeAsset = "mstr" | "btc";

export interface HedgeCalcState {
  positionSize: number;
  asset: HedgeAsset;
  strategy: HedgeStrategy;
  hedgeRatioPct: number;
  selectedPutMid: number;
  selectedPutDelta: number;
  selectedPutStrike: number;
  selectedDte: number;
  shortPutMid: number;
  callMid: number;
  // Reference prices
  mstrPrice: number;
  btcSpot: number;
  strcEffectiveYield: number;
  sofr1m: number;
}

export interface HedgeCalcOutputs {
  hedgeNotional: number;
  contracts: number;
  premiumGross: number;
  premiumNet: number;
  annCostPct: number;
  netHedgedYield: number;
  spreadVsSofrBps: number;
  monthlyIncomeNet: number;
  breakevenStrcRate: number;
}

const ROLL_FRICTION = 1.15;

export function computeHedgeOutputs(state: HedgeCalcState): HedgeCalcOutputs {
  const hedgeNotional = state.positionSize * (state.hedgeRatioPct / 100);
  const absDelta = Math.abs(state.selectedPutDelta) || 0.5;

  // Contracts
  let contracts: number;
  if (state.asset === "mstr") {
    contracts = Math.ceil(hedgeNotional / (100 * state.mstrPrice * absDelta));
  } else {
    contracts = Math.ceil(hedgeNotional / (state.btcSpot * absDelta));
  }

  // Premium gross
  let premiumGross: number;
  if (state.asset === "mstr") {
    premiumGross = contracts * state.selectedPutMid * 100;
  } else {
    premiumGross = contracts * state.selectedPutMid * state.btcSpot;
  }

  // Net premium by strategy
  let premiumNet = premiumGross;
  if (state.strategy === "put_spread" && state.shortPutMid > 0) {
    if (state.asset === "mstr") {
      premiumNet = premiumGross - contracts * state.shortPutMid * 100;
    } else {
      premiumNet = premiumGross - contracts * state.shortPutMid * state.btcSpot;
    }
  }
  if (state.strategy === "collar" && state.callMid > 0) {
    if (state.asset === "mstr") {
      premiumNet = premiumGross - contracts * state.callMid * 100;
    } else {
      premiumNet = premiumGross - contracts * state.callMid * state.btcSpot;
    }
  }

  premiumNet = Math.max(0, premiumNet);

  // Annualized cost
  const dte = Math.max(1, state.selectedDte);
  const annCostPct = (premiumNet / state.positionSize) * (365 / dte) * 100 * ROLL_FRICTION;

  // Outputs
  const netHedgedYield = state.strcEffectiveYield - annCostPct;
  const spreadVsSofrBps = (netHedgedYield - state.sofr1m) * 100;
  const monthlyIncomeNet = state.positionSize * (netHedgedYield / 100) / 12;
  const breakevenStrcRate = annCostPct;

  return {
    hedgeNotional,
    contracts,
    premiumGross,
    premiumNet,
    annCostPct,
    netHedgedYield,
    spreadVsSofrBps,
    monthlyIncomeNet,
    breakevenStrcRate,
  };
}
