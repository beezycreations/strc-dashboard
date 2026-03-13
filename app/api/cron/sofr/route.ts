import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/db/client";
import { sofrHistory } from "@/src/db/schema";
import { fetchSofrLatest } from "@/src/lib/utils/fetchers";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

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
    // Fetch recent SOFR observations from FRED
    const observations = await fetchSofrLatest(10);

    if (!observations || observations.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        warning: "No observations returned from FRED",
      });
    }

    let inserted = 0;
    const warnings: string[] = [];

    for (const obs of observations) {
      const dateStr = obs.date as string;
      const value = parseFloat(obs.value as string);

      if (isNaN(value)) continue;

      try {
        await db
          .insert(sofrHistory)
          .values({
            date: dateStr,
            sofr1mPct: String(value),
            source: "fred",
          })
          .onConflictDoNothing();
        inserted++;
      } catch (e) {
        // ON CONFLICT DO NOTHING handled by onConflictDoNothing above,
        // but catch any other DB errors
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate") && !msg.includes("conflict")) {
          warnings.push(`Insert ${dateStr} failed: ${msg}`);
        }
      }
    }

    // Staleness check: warn if latest value > 2 business days old
    const latestDateStr = observations[0]?.date as string | undefined;
    if (latestDateStr) {
      const latestDate = new Date(latestDateStr);
      const now = new Date();
      const diffMs = now.getTime() - latestDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // 2 business days ~ roughly 4 calendar days to be safe
      if (diffDays > 4) {
        warnings.push(
          `Latest SOFR observation is from ${latestDateStr} (${Math.round(diffDays)} days ago). May be stale.`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      latestDate: latestDateStr,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
