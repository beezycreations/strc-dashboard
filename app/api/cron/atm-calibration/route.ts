import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/src/db/client";
import {
  atmIssuance,
  priceHistory,
  atmCalibrationParams,
} from "@/src/db/schema";
import { today } from "@/src/lib/utils/fetchers";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TICKERS = ["STRC", "STRF", "STRK", "STRD", "MSTR"] as const;

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 200 },
    );
  }

  try {
    const dateStr = today();
    const results: Array<{
      ticker: string;
      sampleCount: number;
      participationRateLow: number | null;
      participationRateHigh: number | null;
      participationRateCurrent: number | null;
    }> = [];
    const errors: string[] = [];

    for (const ticker of TICKERS) {
      try {
        // Get all ATM issuance events for this ticker
        const events = await db
          .select()
          .from(atmIssuance)
          .where(eq(atmIssuance.ticker, ticker))
          .orderBy(desc(atmIssuance.reportDate));

        if (events.length === 0) continue;

        // For each event, compute participation rate:
        // participation_rate = shares_issued / daily_volume
        // We approximate daily_volume from the price_history around that date
        const participationRates: number[] = [];

        for (const event of events) {
          if (!event.sharesIssued || !event.proceedsUsd) continue;

          // Look up the volume for this ticker on the report date
          const [priceRow] = await db
            .select({ volume: priceHistory.volume })
            .from(priceHistory)
            .where(
              sql`${priceHistory.ticker} = ${ticker}
                AND ${priceHistory.isEod} = true
                AND DATE(${priceHistory.ts}) = ${event.reportDate}`,
            )
            .limit(1);

          const volume = priceRow?.volume ? Number(priceRow.volume) : null;

          if (volume && volume > 0) {
            const rate = event.sharesIssued / volume;
            if (rate > 0 && rate <= 1) {
              participationRates.push(rate);
            }
          }
        }

        if (participationRates.length === 0) {
          // Still record that we tried, with null rates
          results.push({
            ticker,
            sampleCount: 0,
            participationRateLow: null,
            participationRateHigh: null,
            participationRateCurrent: null,
          });
          continue;
        }

        // Compute stats
        const sorted = participationRates.sort((a, b) => a - b);
        const low = sorted[0];
        const high = sorted[sorted.length - 1];
        const median =
          sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        // Upsert into atm_calibration_params
        await db
          .insert(atmCalibrationParams)
          .values({
            ticker,
            participationRateLow: String(low),
            participationRateHigh: String(high),
            participationRateCurrent: String(median),
            sampleCount: participationRates.length,
            lastCalibratedDate: dateStr,
            notes: `Calibrated from ${participationRates.length} ATM events`,
          })
          .onConflictDoUpdate({
            target: atmCalibrationParams.ticker,
            set: {
              participationRateLow: String(low),
              participationRateHigh: String(high),
              participationRateCurrent: String(median),
              sampleCount: participationRates.length,
              lastCalibratedDate: dateStr,
              notes: `Calibrated from ${participationRates.length} ATM events`,
            },
          });

        results.push({
          ticker,
          sampleCount: participationRates.length,
          participationRateLow: low,
          participationRateHigh: high,
          participationRateCurrent: median,
        });
      } catch (e) {
        errors.push(
          `${ticker}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      calibrated: results.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
