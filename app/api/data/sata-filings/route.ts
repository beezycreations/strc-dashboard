import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import {
  CONFIRMED_SATA_FILINGS,
  TOTAL_SATA_SHARES,
  TOTAL_SATA_PROCEEDS,
  TOTAL_SATA_BTC_PURCHASED,
} from "@/src/lib/data/confirmed-sata-filings";

export const dynamic = "force-dynamic";

/** SEC EDGAR filing URL from accession number — Strive, Inc. CIK: 0001920406 */
function secFilingUrl(accessionNo: string): string {
  const normalized = accessionNo.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/1920406/${normalized}/`;
}

/** Confirmed SEC filing data (real data hardcoded from EDGAR / investor updates) */
function buildStaticResponse() {
  const filings = [...CONFIRMED_SATA_FILINGS].reverse().map((f) => ({
    ...f,
    sec_url: f.accession_no ? secFilingUrl(f.accession_no) : null,
  }));

  return {
    source: "static" as const,
    filings,
    totals: {
      shares: TOTAL_SATA_SHARES,
      proceeds: TOTAL_SATA_PROCEEDS,
      btc: TOTAL_SATA_BTC_PURCHASED,
    },
  };
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(buildStaticResponse());
  }

  try {
    const { db } = await import("@/src/db/client");
    const { sataFilings } = await import("@/src/db/schema");

    const rows = await db
      .select()
      .from(sataFilings)
      .orderBy(desc(sataFilings.filingDate));

    if (rows.length === 0 || rows.length < CONFIRMED_SATA_FILINGS.length) {
      // DB table empty or incomplete — use confirmed filing data
      return NextResponse.json(buildStaticResponse());
    }

    const filings = rows.map((r) => ({
      filed: r.filingDate,
      type: r.type,
      shares_sold: r.sharesSold,
      net_proceeds: r.netProceeds ? parseFloat(r.netProceeds) : 0,
      btc_purchased: r.btcPurchased ?? null,
      avg_btc_price: r.avgBtcPrice ? parseFloat(r.avgBtcPrice) : null,
      notes: r.notes,
      sec_url: secFilingUrl(r.accessionNo),
    }));

    const totalShares = filings.reduce((s, f) => s + (f.shares_sold ?? 0), 0);
    const totalProceeds = filings.reduce((s, f) => s + f.net_proceeds, 0);
    const totalBtc = filings.reduce((s, f) => s + (f.btc_purchased ?? 0), 0);

    return NextResponse.json({
      source: "db",
      filings,
      totals: { shares: totalShares, proceeds: totalProceeds, btc: totalBtc },
    });
  } catch {
    // DB error — fall back to confirmed filing data
    return NextResponse.json(buildStaticResponse());
  }
}
