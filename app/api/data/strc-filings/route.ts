import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/src/db/client";
import { strcFilings } from "@/src/db/schema";
import { CONFIRMED_STRC_ATM, TOTAL_STRC_SHARES, TOTAL_STRC_PROCEEDS } from "@/src/lib/data/confirmed-strc-atm";

export const dynamic = "force-dynamic";

/** SEC EDGAR filing URL from accession number */
function secFilingUrl(accessionNo: string): string {
  const normalized = accessionNo.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/1050446/${normalized}/`;
}

export async function GET() {
  // Try DB first
  if (process.env.DATABASE_URL) {
    try {
      const rows = await db
        .select()
        .from(strcFilings)
        .orderBy(desc(strcFilings.filingDate));

      if (rows.length > 0) {
        const filings = rows.map((r) => ({
          filed: r.filingDate,
          type: r.type,
          period_start: r.periodStart,
          period_end: r.periodEnd,
          shares_sold: r.sharesSold,
          net_proceeds: r.netProceeds ? parseFloat(r.netProceeds) : 0,
          btc_purchased: r.btcPurchased ?? 0,
          avg_btc_price: r.avgBtcPrice ? parseFloat(r.avgBtcPrice) : 0,
          sec_url: secFilingUrl(r.accessionNo),
        }));

        const totalShares = filings.reduce((s, f) => s + f.shares_sold, 0);
        const totalProceeds = filings.reduce((s, f) => s + f.net_proceeds, 0);
        const totalBtc = filings.reduce((s, f) => s + f.btc_purchased, 0);

        return NextResponse.json({
          source: "db",
          filings,
          totals: {
            shares: totalShares,
            proceeds: totalProceeds,
            btc: totalBtc,
          },
        });
      }
    } catch {
      // Fall through to hardcoded
    }
  }

  // Fallback: hardcoded data (no accession numbers available)
  const filings = [...CONFIRMED_STRC_ATM].reverse().map((f) => ({
    ...f,
    sec_url: null as string | null,
  }));

  return NextResponse.json({
    source: "static",
    filings,
    totals: {
      shares: TOTAL_STRC_SHARES,
      proceeds: TOTAL_STRC_PROCEEDS,
      btc: CONFIRMED_STRC_ATM.reduce((s, e) => s + e.btc_purchased, 0),
    },
  });
}
