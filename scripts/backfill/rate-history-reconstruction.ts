/**
 * Rate History Reconstruction Script
 * Scans EDGAR 8-Ks for STRC rate announcements.
 * Run: npx tsx scripts/backfill/rate-history-reconstruction.ts
 * Source: Phase 3 Section 5.2
 */

import "dotenv/config";

const IPO_DATE = "2025-07-29";
const CIK = "0001050446";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("Scanning EDGAR 8-Ks for STRC rate announcements...");

  // Fetch filing index
  const url = `https://data.sec.gov/submissions/CIK${CIK}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "STRCDashboard/1.0 admin@strc.finance" },
  });
  if (!res.ok) throw new Error(`EDGAR fetch failed: ${res.status}`);
  const submissions = await res.json();

  const recent = submissions.filings.recent;
  const filings8K: Array<{
    accessionNo: string;
    filingDate: string;
    primaryDoc: string;
  }> = [];

  for (let i = 0; i < recent.accessionNumber.length; i++) {
    if (
      recent.form[i] === "8-K" &&
      recent.filingDate[i] >= IPO_DATE
    ) {
      filings8K.push({
        accessionNo: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDoc: recent.primaryDocument[i],
      });
    }
  }

  console.log(`Found ${filings8K.length} 8-K filings since ${IPO_DATE}`);

  const confirmed: Array<{
    effectiveDate: string;
    ratePct: number;
    source: string;
  }> = [];

  for (const filing of filings8K) {
    try {
      const normalized = filing.accessionNo.replace(/-/g, "");
      const docUrl = `https://www.sec.gov/Archives/edgar/data/1050446/${normalized}/${filing.primaryDoc}`;
      const docRes = await fetch(docUrl, {
        headers: { "User-Agent": "STRCDashboard/1.0 admin@strc.finance" },
      });
      if (!docRes.ok) continue;
      const html = await docRes.text();
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

      // Try to extract STRC rate
      const patterns = [
        /STRC[^.]{0,150}(\d+\.\d+)%\s*per\s*annum/i,
        /(\d+\.\d+)%\s*per\s*annum[^.]{0,150}STRC/i,
        /monthly\s+(?:regular\s+)?dividend\s+rate[^.]{0,100}(\d+\.\d+)%/i,
        /dividend\s+rate[^.]{0,50}(?:has\s+been\s+)?(?:set|determined)[^.]{0,50}(\d+\.\d+)%/i,
      ];

      for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
          const ratePct = parseFloat(match[1]);
          if (ratePct >= 4.0 && ratePct <= 25.0) {
            const filingDt = new Date(filing.filingDate);
            const effectiveMonth = new Date(filingDt.getFullYear(), filingDt.getMonth() + 1, 1);
            const effectiveDate = effectiveMonth.toISOString().slice(0, 10);
            console.log(`  ✓ Found rate ${ratePct}% in ${filing.accessionNo}`);
            confirmed.push({ effectiveDate, ratePct, source: filing.accessionNo });
            break;
          }
        }
      }
    } catch (err) {
      console.error(`  Error processing ${filing.accessionNo}:`, err);
    }
    await sleep(200);
  }

  // Report
  console.log("\n═══ RECONCILIATION REPORT ═══");
  console.log("Confirmed from EDGAR:");
  confirmed.forEach((r) => console.log(`  ${r.effectiveDate}: ${r.ratePct}%  (${r.source})`));

  const EXPECTED = [
    { date: "2025-07-29", rate: 9.0 },
    { date: "2025-11-01", rate: 10.5 },
    { date: "2026-01-01", rate: 11.25 },
    { date: "2026-02-01", rate: 11.25 },
  ];

  console.log("\nValidation against known values:");
  for (const expected of EXPECTED) {
    const found = confirmed.find((r) => r.effectiveDate === expected.date);
    const match = found && found.ratePct === expected.rate;
    console.log(
      `  ${expected.date} ${expected.rate}%: ${match ? "✓ MATCH" : found ? `⚠ MISMATCH (${found.ratePct}%)` : "✗ NOT FOUND"}`
    );
  }

  // Write to DB if available
  if (process.env.DATABASE_URL) {
    console.log("\nWriting to DB...");
    const { db } = await import("../../src/db/client");
    const { strcRateHistory } = await import("../../src/db/schema");

    // IPO rate
    await db
      .insert(strcRateHistory)
      .values({
        effectiveDate: "2025-07-29",
        ratePct: "9.00",
        announcedDate: "2025-07-28",
        isConfirmed: true,
        source: "Certificate of Designations — IPO",
      })
      .onConflictDoNothing();

    for (const r of confirmed) {
      await db
        .insert(strcRateHistory)
        .values({
          effectiveDate: r.effectiveDate,
          ratePct: r.ratePct.toString(),
          isConfirmed: true,
          source: r.source,
        })
        .onConflictDoNothing();
    }
    console.log(`Done. ${confirmed.length + 1} entries written.`);
  }
}

run().catch(console.error).finally(() => process.exit());
