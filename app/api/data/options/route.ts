import { NextRequest, NextResponse } from "next/server";
import {
  fetchTradierExpirations, fetchTradierChain, fetchTradierQuote,
  fetchFmpOptions, fetchFmpQuote, fetchDeribitBtcOptions, fetchBtcPrice,
} from "@/src/lib/utils/fetchers";
import { filterTradierChain, filterMstrChain, filterDeribitChain } from "@/src/lib/options/filter";

export const revalidate = 0;

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
      // Try Tradier first (real-time), fall back to FMP (15-min delayed)
      const tradierResult = await tryTradierMstr(expiry);
      if (tradierResult) return NextResponse.json(tradierResult);

      const fmpResult = await tryFmpMstr(expiry);
      if (fmpResult) return NextResponse.json(fmpResult);

      return NextResponse.json({
        asset: "mstr",
        chain: [],
        dte: 0,
        source: "unavailable",
        delayed_minutes: 0,
        spot_price: null,
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
          chain: [],
          dte: 0,
          source: "unavailable",
          delayed_minutes: 0,
          spot_price: null,
          last_updated: new Date().toISOString(),
        });
      }

      const btcSpot = btcData.usd || 0;

      if (btcSpot <= 0) {
        return NextResponse.json({
          asset,
          chain: [],
          dte: 0,
          source: "unavailable",
          delayed_minutes: 0,
          spot_price: null,
          last_updated: new Date().toISOString(),
        });
      }

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
    return NextResponse.json({
      asset,
      chain: [],
      dte: 0,
      source: "unavailable",
      delayed_minutes: 0,
      spot_price: null,
      last_updated: new Date().toISOString(),
    });
  }
}
