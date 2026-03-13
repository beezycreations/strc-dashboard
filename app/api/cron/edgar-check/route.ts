import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/src/db/client";
import {
  edgarFilings,
  btcHoldings,
  atmIssuance,
  strcRateHistory,
  capitalStructureSnapshots,
} from "@/src/db/schema";
import { fetchEdgarSubmissions, sleep } from "@/src/lib/utils/fetchers";
import { parse8K } from "@/src/lib/parsers/edgar-8k-parser";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Strategy Corp CIK (MicroStrategy / Strategy)
const CIK = "0001050446";
const MAX_PER_RUN = 3;

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
    // Fetch filing index from EDGAR
    const submissions = await fetchEdgarSubmissions(CIK);
    const recent = submissions?.filings?.recent;

    if (!recent) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        note: "No recent filings found in EDGAR response",
      });
    }

    // Build list of 8-K filings from the index
    const eightKs: Array<{
      accessionNo: string;
      filingDate: string;
      primaryDoc: string;
    }> = [];

    for (let i = 0; i < (recent.accessionNumber?.length ?? 0); i++) {
      const formType = recent.form?.[i];
      if (formType === "8-K" || formType === "8-K/A") {
        eightKs.push({
          accessionNo: recent.accessionNumber[i],
          filingDate: recent.filingDate[i],
          primaryDoc: recent.primaryDocument[i],
        });
      }
    }

    if (eightKs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, note: "No 8-Ks in index" });
    }

    // Get already-processed accession numbers from DB
    const allAccessions = eightKs.map((f) => f.accessionNo);
    const existingRows = await db
      .select({ accessionNo: edgarFilings.accessionNo })
      .from(edgarFilings)
      .where(inArray(edgarFilings.accessionNo, allAccessions));

    const processedSet = new Set(existingRows.map((r) => r.accessionNo));

    // Filter to unprocessed, take up to MAX_PER_RUN
    const toProcess = eightKs
      .filter((f) => !processedSet.has(f.accessionNo))
      .slice(0, MAX_PER_RUN);

    if (toProcess.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, note: "All 8-Ks already processed" });
    }

    const results: Array<{ accessionNo: string; notes: string }> = [];
    const errors: string[] = [];

    for (const filing of toProcess) {
      try {
        // 200ms delay between EDGAR requests
        await sleep(200);

        const parsed = await parse8K(
          filing.accessionNo,
          filing.filingDate,
          filing.primaryDoc,
        );

        // Write filing record
        await db
          .insert(edgarFilings)
          .values({
            accessionNo: filing.accessionNo,
            filingDate: filing.filingDate,
            formType: "8-K",
            processed: true,
            processingNotes: parsed.notes,
          })
          .onConflictDoNothing();

        // Write parsed data to relevant tables
        if (parsed.btcHoldings) {
          try {
            await db
              .insert(btcHoldings)
              .values({
                reportDate: filing.filingDate,
                btcCount: parsed.btcHoldings.count,
                avgCostUsd: parsed.btcHoldings.avgCost
                  ? String(parsed.btcHoldings.avgCost)
                  : null,
                totalCostUsd: parsed.btcHoldings.totalCost
                  ? String(parsed.btcHoldings.totalCost)
                  : null,
                source: `EDGAR 8-K ${filing.accessionNo}`,
              })
              .onConflictDoNothing();
          } catch (e) {
            errors.push(
              `btcHoldings insert: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        if (parsed.atmProceeds) {
          for (const atm of parsed.atmProceeds) {
            try {
              await db
                .insert(atmIssuance)
                .values({
                  reportDate: filing.filingDate,
                  ticker: atm.ticker,
                  sharesIssued: atm.shares,
                  proceedsUsd: String(atm.proceeds),
                  avgPrice: String(atm.avgPrice),
                  source: `EDGAR 8-K ${filing.accessionNo}`,
                })
                .onConflictDoNothing();
            } catch (e) {
              errors.push(
                `atmIssuance insert ${atm.ticker}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
        }

        if (parsed.strcRate) {
          try {
            await db
              .insert(strcRateHistory)
              .values({
                effectiveDate: parsed.strcRate.effectiveDate,
                ratePct: String(parsed.strcRate.ratePct),
                announcedDate: filing.filingDate,
                isConfirmed: true,
                source: `EDGAR 8-K ${filing.accessionNo}`,
              })
              .onConflictDoNothing();
          } catch (e) {
            errors.push(
              `strcRate insert: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        if (parsed.usdReserve || parsed.sharesOutstanding) {
          try {
            const values: Record<string, unknown> = {
              snapshotDate: filing.filingDate,
              source: `EDGAR 8-K ${filing.accessionNo}`,
            };
            if (parsed.usdReserve) {
              values.usdReserveUsd = String(parsed.usdReserve.amount);
            }
            if (parsed.sharesOutstanding) {
              values.mstrSharesOutstanding = BigInt(parsed.sharesOutstanding.mstr);
            }
            await db
              .insert(capitalStructureSnapshots)
              .values(values as typeof capitalStructureSnapshots.$inferInsert)
              .onConflictDoNothing();
          } catch (e) {
            errors.push(
              `capitalStructure insert: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        results.push({ accessionNo: filing.accessionNo, notes: parsed.notes });
      } catch (e) {
        // Record the filing as seen but not successfully processed
        try {
          await db
            .insert(edgarFilings)
            .values({
              accessionNo: filing.accessionNo,
              filingDate: filing.filingDate,
              formType: "8-K",
              processed: false,
              processingNotes: `Error: ${e instanceof Error ? e.message : String(e)}`,
            })
            .onConflictDoNothing();
        } catch {
          // ignore secondary insert failure
        }

        errors.push(
          `${filing.accessionNo}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
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
