import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { CONFIRMED_STRC_ATM, TOTAL_STRC_SHARES, TOTAL_STRC_PROCEEDS } from "@/src/lib/data/confirmed-strc-atm";

export const dynamic = "force-dynamic";

/** SEC EDGAR filing URL from accession number */
function secFilingUrl(accessionNo: string): string {
  const normalized = accessionNo.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/1050446/${normalized}/`;
}

/** Confirmed SEC filing data (not mock — real 8-K data hardcoded from EDGAR) */
function buildStaticResponse() {
  const filings = [...CONFIRMED_STRC_ATM].reverse().map((f) => ({
    ...f,
    sec_url: f.accession_no ? secFilingUrl(f.accession_no) : null,
  }));

  return {
    source: "static" as const,
    filings,
    totals: {
      shares: TOTAL_STRC_SHARES,
      proceeds: TOTAL_STRC_PROCEEDS,
      btc: CONFIRMED_STRC_ATM.reduce((s, e) => s + e.btc_purchased, 0),
    },
  };
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(buildStaticResponse());
  }

  try {
    const { db } = await import("@/src/db/client");
    const { strcFilings } = await import("@/src/db/schema");

    const rows = await db
      .select()
      .from(strcFilings)
      .orderBy(desc(strcFilings.filingDate));

    if (rows.length === 0) {
      // DB table empty — fall back to confirmed SEC filing data
      return NextResponse.json(buildStaticResponse());
    }

    const filings = rows.map((r) => ({
      filed: r.filingDate,
      type: r.type,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      shares_sold: r.sharesSold,
      net_proceeds: r.netProceeds ? parseFloat(r.netProceeds) : 0,
      btc_purchased: r.btcPurchased ?? null,
      avg_btc_price: r.avgBtcPrice ? parseFloat(r.avgBtcPrice) : null,
      sec_url: secFilingUrl(r.accessionNo),
    }));

    const totalShares = filings.reduce((s, f) => s + f.shares_sold, 0);
    const totalProceeds = filings.reduce((s, f) => s + f.net_proceeds, 0);
    const totalBtc = filings.reduce((s, f) => s + (f.btc_purchased ?? 0), 0);

    return NextResponse.json({
      source: "db",
      filings,
      totals: { shares: totalShares, proceeds: totalProceeds, btc: totalBtc },
    });
  } catch {
    // DB error — fall back to confirmed SEC filing data
    return NextResponse.json(buildStaticResponse());
  }
}
