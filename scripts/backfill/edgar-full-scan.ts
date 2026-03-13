/**
 * Full EDGAR Scan — processes all 8-K filings since IPO
 * Populates: btc_holdings, atm_issuance, strc_rate_history, capital_structure_snapshots
 * Run ONCE on initial setup: npx tsx scripts/backfill/edgar-full-scan.ts
 * Source: Phase 3 Section 5.4
 */

import "dotenv/config";

const IPO_DATE = "2025-07-29";
const CIK = "0001050446";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required for full scan");
    process.exit(1);
  }

  console.log(`Full EDGAR scan — processing all 8-K filings since ${IPO_DATE}`);

  const res = await fetch(`https://data.sec.gov/submissions/CIK${CIK}.json`, {
    headers: { "User-Agent": "STRCDashboard/1.0 admin@strc.finance" },
  });
  if (!res.ok) throw new Error(`EDGAR fetch failed: ${res.status}`);
  const submissions = await res.json();
  const recent = submissions.filings.recent;

  const filings: Array<{ accNo: string; date: string; doc: string }> = [];
  for (let i = 0; i < recent.accessionNumber.length; i++) {
    if (recent.form[i] === "8-K" && recent.filingDate[i] >= IPO_DATE) {
      filings.push({
        accNo: recent.accessionNumber[i],
        date: recent.filingDate[i],
        doc: recent.primaryDocument[i],
      });
    }
  }

  console.log(`Processing ${filings.length} 8-K filings...`);

  const { parse8K } = await import("../../src/lib/parsers/edgar-8k-parser");
  let processed = 0;
  let errors = 0;

  for (const filing of filings) {
    try {
      const result = await parse8K(filing.accNo, filing.date, filing.doc);
      console.log(`  [${++processed}/${filings.length}] ${filing.accNo}: ${result.notes}`);
    } catch (err) {
      errors++;
      console.error(`  ERROR: ${filing.accNo}:`, err instanceof Error ? err.message : err);
    }
    await sleep(200);
  }

  console.log(`\nScan complete. Processed: ${processed}, Errors: ${errors}`);
  console.log("Run rate-history-reconstruction.ts next to verify rate completeness.");
}

run().catch(console.error).finally(() => process.exit());
