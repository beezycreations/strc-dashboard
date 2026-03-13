import { NextRequest, NextResponse } from "next/server";
import {
  fetchTradierExpirations, fetchTradierChain, fetchTradierQuote,
  fetchFmpOptions, fetchFmpQuote, fetchDeribitBtcOptions, fetchBtcPrice,
} from "@/src/lib/utils/fetchers";
import { filterTradierChain, filterMstrChain, filterDeribitChain, type OptionRow } from "@/src/lib/options/filter";

export const revalidate = 0;

function generateMockMstrChain(expiry: string): OptionRow[] {
  const basePrice = 395;
  const dte = expiry === "30d" ? 28 : expiry === "60d" ? 56 : 84;
  const strikes = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((offset) => basePrice + offset);
  const atmStrike = basePrice;

  return strikes.map((strike) => {
    const moneyness = (strike - basePrice) / basePrice;
    const baseIv = 72 + Math.abs(moneyness) * 200; // skew
    const mid = Math.max(0.5, (basePrice * 0.15 * Math.sqrt(dte / 365)) * Math.max(0.1, 1 - moneyness));
    return {
      strike,
      bid: +(mid * 0.95).toFixed(2),
      ask: +(mid * 1.05).toFixed(2),
      mid: +mid.toFixed(2),
      iv: +baseIv.toFixed(1),
      delta: +(moneyness < 0 ? -0.5 + moneyness * 2 : -0.5 + moneyness).toFixed(3),
      theta: +((-mid / dte) * 0.7).toFixed(3),
      oi: Math.floor(500 + Math.random() * 5000),
      volume: Math.floor(50 + Math.random() * 800),
      dte,
      is_atm: strike === atmStrike,
    };
  });
}

function generateMockBtcChain(expiry: string): OptionRow[] {
  const basePrice = 70000;
  const dte = expiry === "30d" ? 28 : expiry === "60d" ? 56 : 84;
  const offsets = [-8000, -6000, -4000, -2000, -1000, 0, 1000, 2000, 4000, 6000, 8000];
  const strikes = offsets.map((o) => basePrice + o);
  const atmStrike = basePrice;

  return strikes.map((strike) => {
    const moneyness = (strike - basePrice) / basePrice;
    const baseIv = 55 + Math.abs(moneyness) * 150;
    const midBtc = Math.max(0.001, 0.08 * Math.sqrt(dte / 365) * Math.max(0.05, 1 - moneyness));
    const midUsd = midBtc * basePrice;
    return {
      strike,
      bid: +(midUsd * 0.97).toFixed(2),
      ask: +(midUsd * 1.03).toFixed(2),
      mid: +midUsd.toFixed(2),
      mid_btc: +midBtc.toFixed(6),
      iv: +baseIv.toFixed(1),
      delta: +(moneyness < 0 ? -0.5 + moneyness * 3 : -0.5 + moneyness * 1.5).toFixed(3),
      theta: +((-midUsd / dte) * 0.6).toFixed(2),
      oi: Math.floor(200 + Math.random() * 3000),
      volume: Math.floor(20 + Math.random() * 500),
      instrument_name: `BTC-${dte}D-${strike}-P`,
      dte,
      is_atm: strike === atmStrike,
    };
  });
}

/** Try Tradier for MSTR options (real-time, free with funded account) */
async function tryTradierMstr(expiry: "30d" | "60d" | "90d") {
  try {
    const windowDays = { "30d": 30, "60d": 60, "90d": 90 }[expiry];
    const [expirations, quote] = await Promise.all([
      fetchTradierExpirations("MSTR"),
      fetchTradierQuote("MSTR"),
    ]);
    if (!expirations.length || !quote) return null;

    const spotPrice = quote.last ?? quote.prevclose ?? 0;
    if (spotPrice <= 0) return null;

    // Find nearest expiration within window
    const now = new Date();
    const target = expirations
      .map((exp) => ({ exp, dte: Math.floor((new Date(exp).getTime() - now.getTime()) / 86400000) }))
      .filter((x) => x.dte > 0 && x.dte <= windowDays + 7)
      .sort((a, b) => a.dte - b.dte)[0];
    if (!target) return null;

    const contracts = await fetchTradierChain("MSTR", target.exp);
    if (!contracts.length) return null;

    const chain = filterTradierChain(contracts, spotPrice, expiry);
    if (!chain.length) return null;

    return {
      asset: "mstr",
      chain,
      dte: chain[0]?.dte ?? 0,
      source: "tradier",
      delayed_minutes: 0,
      spot_price: spotPrice,
      last_updated: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Fall back to FMP for MSTR options (15-min delayed) */
async function tryFmpMstr(expiry: "30d" | "60d" | "90d") {
  try {
    const [contracts, quote] = await Promise.all([
      fetchFmpOptions("MSTR"),
      fetchFmpQuote("MSTR"),
    ]);
    if (!contracts?.length || !quote) return null;

    const mstrPrice = quote.price ?? quote.previousClose ?? 0;
    if (mstrPrice <= 0) return null;

    const chain = filterMstrChain(contracts, mstrPrice, expiry);
    if (!chain.length) return null;

    return {
      asset: "mstr",
      chain,
      dte: chain[0]?.dte ?? 0,
      source: "fmp",
      delayed_minutes: 15,
      spot_price: mstrPrice,
      last_updated: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const asset = (searchParams.get("asset") ?? "mstr") as "mstr" | "btc";
  const expiry = (searchParams.get("expiry") ?? "30d") as "30d" | "60d" | "90d";

  try {
    if (asset === "mstr") {
      // Try Tradier first (real-time), fall back to FMP (15-min delayed), then mock
      const tradierResult = await tryTradierMstr(expiry);
      if (tradierResult) return NextResponse.json(tradierResult);

      const fmpResult = await tryFmpMstr(expiry);
      if (fmpResult) return NextResponse.json(fmpResult);

      return NextResponse.json({
        asset: "mstr",
        chain: generateMockMstrChain(expiry),
        dte: expiry === "30d" ? 28 : expiry === "60d" ? 56 : 84,
        source: "mock",
        delayed_minutes: 0,
        spot_price: 395,
        last_updated: new Date().toISOString(),
      });
    } else {
      // BTC options from Deribit
      const [instruments, btcData] = await Promise.all([
        fetchDeribitBtcOptions(),
        fetchBtcPrice(),
      ]);

      if (!instruments || instruments.length === 0) {
        return NextResponse.json({
          asset: "btc",
          chain: generateMockBtcChain(expiry),
          dte: expiry === "30d" ? 28 : expiry === "60d" ? 56 : 84,
          source: "mock",
          delayed_minutes: 0,
          spot_price: 70000,
          last_updated: new Date().toISOString(),
        });
      }

      const btcSpot = btcData.usd || 70000;
      const chain = filterDeribitChain(instruments, btcSpot, expiry);

      return NextResponse.json({
        asset: "btc",
        chain,
        dte: chain[0]?.dte ?? 0,
        source: "deribit",
        delayed_minutes: 0,
        spot_price: btcSpot,
        last_updated: new Date().toISOString(),
      });
    }
  } catch {
    const chain = asset === "mstr" ? generateMockMstrChain(expiry) : generateMockBtcChain(expiry);
    return NextResponse.json({
      asset,
      chain,
      dte: expiry === "30d" ? 28 : expiry === "60d" ? 56 : 84,
      source: "mock",
      delayed_minutes: 0,
      spot_price: asset === "mstr" ? 395 : 70000,
      last_updated: new Date().toISOString(),
    });
  }
}
