import { NextResponse } from "next/server";

export const revalidate = 0;

/**
 * Search terms and their required title keywords.
 * The search query hits the API, then we verify the result title
 * actually contains at least one of the `titleMust` keywords to
 * avoid false positives (e.g. "STRC" matching Counter-Strike).
 */
const SEARCH_TERMS: Array<{ query: string; titleMust: string[]; label: string }> = [
  { query: "MicroStrategy", titleMust: ["microstrategy", "mstr"], label: "MSTR" },
  { query: "MSTR Bitcoin", titleMust: ["mstr", "microstrategy"], label: "MSTR" },
  { query: "Strategy Bitcoin purchase", titleMust: ["microstrategy", "mstr"], label: "MSTR" },
  { query: "Michael Saylor", titleMust: ["saylor", "microstrategy", "mstr"], label: "MSTR" },
  { query: "Strive Asset Management", titleMust: ["strive", "semler"], label: "Strive" },
  { query: "Bitcoin price 2026", titleMust: ["bitcoin price", "btc price", "bitcoin above", "bitcoin below", "bitcoin reach", "bitcoin end"], label: "BTC" },
  { query: "Bitcoin strategic reserve", titleMust: ["bitcoin", "strategic reserve"], label: "BTC" },
];

/** Additional Kalshi series tickers to always include (Bitcoin-related) */
const KALSHI_SERIES = ["KXBTC", "KXBTCD"];

// ─── Types ──────────────────────────────────────────────────────────

export interface PredictMarket {
  id: string;
  platform: "polymarket" | "kalshi";
  title: string;
  /** "Yes" probability 0–1 */
  probability: number;
  /** Total volume in USD */
  volume: number;
  /** 24h volume in USD (if available) */
  volume_24h: number | null;
  /** Market end/close date ISO string */
  end_date: string | null;
  /** URL to the market page */
  url: string;
  /** Whether the market is still active */
  active: boolean;
  /** Which search term matched */
  matched_term: string;
}

// ─── Polymarket (Gamma API) ─────────────────────────────────────────

async function fetchPolymarket(): Promise<PredictMarket[]> {
  const results: PredictMarket[] = [];
  const seenIds = new Set<string>();

  for (const term of SEARCH_TERMS) {
    try {
      const url = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(term.query)}&type=events&limit=10`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const events = data.events || data || [];
      if (!Array.isArray(events)) continue;

      for (const evt of events) {
        const markets = evt.markets || [evt];
        for (const m of markets) {
          const id = m.id || m.conditionId;
          if (!id || seenIds.has(id)) continue;

          const title = m.question || evt.title || "";
          const titleLower = title.toLowerCase();

          // Verify the result actually matches our domain
          const matches = term.titleMust.some((kw) => titleLower.includes(kw));
          if (!matches) continue;

          seenIds.add(id);

          let yesPrice = 0.5;
          try {
            const prices = JSON.parse(m.outcomePrices || "[]");
            if (prices.length > 0) yesPrice = parseFloat(prices[0]) || 0.5;
          } catch { /* default */ }

          const eventSlug = evt.slug || m.slug || id;

          results.push({
            id: `poly-${id}`,
            platform: "polymarket",
            title: title || "Unknown",
            probability: yesPrice,
            volume: parseFloat(m.volume || "0"),
            volume_24h: m.volume24hr != null ? parseFloat(String(m.volume24hr)) : null,
            end_date: m.endDate || evt.endDate || null,
            url: `https://polymarket.com/event/${eventSlug}`,
            active: m.active === true && m.closed !== true,
            matched_term: term.label,
          });
        }
      }
    } catch {
      // Individual term failure — continue with others
    }
  }

  return results;
}

// ─── Kalshi ─────────────────────────────────────────────────────────

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  open_interest_fp?: string;
  close_time?: string;
  status?: string;
  result?: string;
}

async function fetchKalshi(): Promise<PredictMarket[]> {
  const results: PredictMarket[] = [];
  const seenTickers = new Set<string>();

  // Fetch from known crypto series
  for (const series of KALSHI_SERIES) {
    try {
      const url = `https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${series}&status=open&limit=50`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const markets: KalshiMarket[] = data.markets || [];

      for (const m of markets) {
        if (seenTickers.has(m.ticker)) continue;
        seenTickers.add(m.ticker);

        // Kalshi prices are dollar strings ("0.1400" = 14% probability)
        const lastPrice = parseFloat(m.last_price_dollars || "0");
        const yesBid = parseFloat(m.yes_bid_dollars || "0");
        const yesAsk = parseFloat(m.yes_ask_dollars || "1");
        const prob = lastPrice > 0 ? lastPrice : (yesBid + yesAsk) / 2;

        const vol = parseFloat(m.volume_fp || "0");
        const vol24h = parseFloat(m.volume_24h_fp || "0");

        results.push({
          id: `kalshi-${m.ticker}`,
          platform: "kalshi",
          title: m.title || m.ticker,
          probability: prob,
          volume: vol,
          volume_24h: vol24h > 0 ? vol24h : null,
          end_date: m.close_time ?? null,
          url: `https://kalshi.com/markets/${m.event_ticker}`,
          active: m.status === "active" || m.status === "open",
          matched_term: series,
        });
      }
    } catch {
      // Series failure — continue
    }
  }

  // Also search events by keyword — Kalshi doesn't have text search,
  // so we fetch recent events and filter by title
  const KALSHI_KEYWORDS = ["mstr", "microstrategy", "strategy", "bitcoin", "btc", "strive", "sata"];
  try {
    const url = `https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=100`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const events = data.events || [];

      for (const evt of events) {
        const titleLower = (evt.title || "").toLowerCase();
        const matchedKw = KALSHI_KEYWORDS.find((kw) => titleLower.includes(kw));
        if (!matchedKw) continue;

        const markets: KalshiMarket[] = evt.markets || [];
        for (const m of markets) {
          if (seenTickers.has(m.ticker)) continue;
          seenTickers.add(m.ticker);

          const lastPrice = parseFloat(m.last_price_dollars || "0");
          const yesBid = parseFloat(m.yes_bid_dollars || "0");
          const yesAsk = parseFloat(m.yes_ask_dollars || "1");
          const prob = lastPrice > 0 ? lastPrice : (yesBid + yesAsk) / 2;
          const vol = parseFloat(m.volume_fp || "0");
          const vol24h = parseFloat(m.volume_24h_fp || "0");

          results.push({
            id: `kalshi-${m.ticker}`,
            platform: "kalshi",
            title: m.title || evt.title || m.ticker,
            probability: prob,
            volume: vol,
            volume_24h: vol24h > 0 ? vol24h : null,
            end_date: m.close_time ?? null,
            url: `https://kalshi.com/markets/${m.event_ticker}`,
            active: m.status === "active" || m.status === "open",
            matched_term: matchedKw.toUpperCase(),
          });
        }
      }
    }
  } catch {
    // Continue
  }

  return results;
}

// ─── Route Handler ──────────────────────────────────────────────────

export async function GET() {
  try {
    const [polymarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarket().catch(() => [] as PredictMarket[]),
      fetchKalshi().catch(() => [] as PredictMarket[]),
    ]);

    // Combine and sort by volume descending
    const all = [...polymarkets, ...kalshiMarkets]
      .filter((m) => m.active)
      .sort((a, b) => (b.volume_24h ?? b.volume) - (a.volume_24h ?? a.volume));

    return NextResponse.json({
      markets: all,
      counts: {
        polymarket: polymarkets.filter((m) => m.active).length,
        kalshi: kalshiMarkets.filter((m) => m.active).length,
        total: all.length,
      },
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[predict] Error:", err);
    return NextResponse.json({
      markets: [],
      counts: { polymarket: 0, kalshi: 0, total: 0 },
      last_updated: new Date().toISOString(),
      error: "Failed to fetch prediction markets",
    });
  }
}
