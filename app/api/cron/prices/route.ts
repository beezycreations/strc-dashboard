import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { fetchBtcPrice, fetchFmpQuote, today } from "@/src/lib/utils/fetchers";
import { isMarketOpen, isMarketClose } from "@/src/lib/utils/market-hours";
import { priceHistory } from "@/src/db/schema";
import { db } from "@/src/db/client";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Auth check
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // DB guard
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 200 },
    );
  }

  try {
    const now = new Date();
    const results: Array<{ ticker: string; price: number; source: string }> = [];
    const errors: string[] = [];

    // Always fetch BTC
    try {
      const btc = await fetchBtcPrice();
      if (btc && btc.usd > 0) {
        results.push({ ticker: "BTC", price: btc.usd, source: "coingecko" });
      }
    } catch (e) {
      errors.push(`BTC fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // If market is open, fetch equity quotes
    const marketOpen = isMarketOpen();
    if (marketOpen) {
      const tickers = ["STRC", "STRF", "STRK", "STRD", "MSTR"] as const;
      for (const ticker of tickers) {
        try {
          const quote = await fetchFmpQuote(ticker);
          if (quote && quote.price > 0) {
            results.push({
              ticker,
              price: quote.price,
              source: "fmp",
            });
          }
        } catch (e) {
          errors.push(
            `${ticker} fetch failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    // Upsert into price_history
    let upserted = 0;
    for (const row of results) {
      try {
        await db
          .insert(priceHistory)
          .values({
            ticker: row.ticker,
            ts: now,
            price: String(row.price),
            source: row.source,
            isEod: false,
          })
          .onConflictDoUpdate({
            target: [priceHistory.ticker, priceHistory.ts, priceHistory.source],
            set: {
              price: String(row.price),
            },
          });
        upserted++;
      } catch (e) {
        errors.push(
          `Upsert ${row.ticker} failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // At market close, mark EOD for equity tickers
    if (isMarketClose()) {
      try {
        const eodTickers = ["STRC", "STRF", "STRK", "STRD", "MSTR"];
        for (const ticker of eodTickers) {
          // Find latest row for this ticker today and mark as EOD
          await db
            .insert(priceHistory)
            .values({
              ticker,
              ts: now,
              price: String(
                results.find((r) => r.ticker === ticker)?.price ?? 0,
              ),
              source: "fmp",
              isEod: true,
            })
            .onConflictDoUpdate({
              target: [priceHistory.ticker, priceHistory.ts, priceHistory.source],
              set: { isEod: true },
            });
        }
      } catch (e) {
        errors.push(
          `EOD marking failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      upserted,
      marketOpen,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
