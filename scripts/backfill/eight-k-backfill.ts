/**
 * 8-K Data Backfill Script
 *
 * Seeds Neon database with confirmed 8-K filing data:
 * 1. mstr_btc_purchases — Strategy's BTC acquisition history
 * 2. atm_issuance — Per-instrument issuance data (MSTR, STRC, STRF, STRK, STRD)
 *
 * Run: npx tsx scripts/backfill/eight-k-backfill.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { CONFIRMED_PURCHASES } from "../../src/lib/data/confirmed-purchases";
import { CONFIRMED_ATM_PERIODS } from "../../src/lib/data/confirmed-atm-all";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL required");

const sql = neon(DB_URL);

async function backfillBtcPurchases() {
  console.log("Backfilling mstr_btc_purchases...");
  let upserted = 0;

  for (let i = 0; i < CONFIRMED_PURCHASES.length; i++) {
    const p = CONFIRMED_PURCHASES[i];
    const purchaseNumber = i + 1;

    try {
      await sql`
        INSERT INTO mstr_btc_purchases (
          purchase_number, report_date, btc_acquired, avg_btc_cost,
          acquisition_cost_usd, cumulative_btc, source
        ) VALUES (
          ${purchaseNumber}, ${p.date}, ${p.btc}, ${p.avg_cost.toFixed(2)},
          ${(p.cost_m * 1_000_000).toFixed(2)}, ${p.cumulative}, '8-K'
        )
        ON CONFLICT (purchase_number) DO UPDATE SET
          report_date = EXCLUDED.report_date,
          btc_acquired = EXCLUDED.btc_acquired,
          avg_btc_cost = EXCLUDED.avg_btc_cost,
          acquisition_cost_usd = EXCLUDED.acquisition_cost_usd,
          cumulative_btc = EXCLUDED.cumulative_btc
      `;
      upserted++;
    } catch (err) {
      console.error(`  Error on purchase #${purchaseNumber} (${p.date}):`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`  ${upserted} BTC purchases upserted`);
}

async function backfillAtmIssuance() {
  console.log("Backfilling atm_issuance...");
  let upserted = 0;
  let skipped = 0;

  for (const period of CONFIRMED_ATM_PERIODS) {
    // Use period_end as the report date
    const reportDate = period.period_end;

    for (const inst of period.instruments) {
      // Skip zero-issuance entries
      if (inst.shares_sold === 0 && inst.net_proceeds === 0) {
        skipped++;
        continue;
      }

      const avgPrice = inst.shares_sold > 0
        ? (inst.net_proceeds / inst.shares_sold).toFixed(6)
        : "0";

      try {
        await sql`
          INSERT INTO atm_issuance (
            report_date, ticker, shares_issued, proceeds_usd,
            avg_price, is_estimated, confidence, source
          ) VALUES (
            ${reportDate}, ${inst.ticker}, ${inst.shares_sold},
            ${inst.net_proceeds.toFixed(2)}, ${avgPrice},
            false, '1.000', ${`8-K filed ${period.filed}`}
          )
          ON CONFLICT (ticker, report_date) DO UPDATE SET
            shares_issued = EXCLUDED.shares_issued,
            proceeds_usd = EXCLUDED.proceeds_usd,
            avg_price = EXCLUDED.avg_price,
            is_estimated = false,
            confidence = '1.000',
            source = EXCLUDED.source
        `;
        upserted++;
      } catch (err) {
        console.error(`  Error on ${inst.ticker} ${reportDate}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`  ${upserted} issuance rows upserted, ${skipped} zero-issuance skipped`);
}

async function backfillBtcHoldings() {
  console.log("Backfilling btc_holdings from 8-K periods...");
  let upserted = 0;

  for (const period of CONFIRMED_ATM_PERIODS) {
    if (period.btc_purchased <= 0) continue;

    const reportDate = period.period_end;
    const totalCost = period.btc_cost;

    try {
      await sql`
        INSERT INTO btc_holdings (
          report_date, btc_count, avg_cost_usd, total_cost_usd,
          is_estimated, confidence, source
        ) VALUES (
          ${reportDate}, ${period.cumulative_btc},
          ${period.avg_btc_price.toFixed(2)}, ${totalCost.toFixed(2)},
          false, '1.000', ${`8-K filed ${period.filed}`}
        )
        ON CONFLICT (report_date) DO UPDATE SET
          btc_count = EXCLUDED.btc_count,
          avg_cost_usd = EXCLUDED.avg_cost_usd,
          total_cost_usd = EXCLUDED.total_cost_usd,
          is_estimated = false,
          source = EXCLUDED.source
      `;
      upserted++;
    } catch (err) {
      console.error(`  Error on btc_holdings ${reportDate}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`  ${upserted} btc_holdings rows upserted`);
}

async function main() {
  // Ensure tables exist
  await sql`
    CREATE TABLE IF NOT EXISTS mstr_btc_purchases (
      id BIGSERIAL PRIMARY KEY,
      purchase_number INTEGER NOT NULL,
      report_date DATE NOT NULL,
      btc_acquired INTEGER NOT NULL,
      avg_btc_cost NUMERIC(18,2) NOT NULL,
      acquisition_cost_usd NUMERIC(20,2) NOT NULL,
      cumulative_btc INTEGER NOT NULL,
      adso_thousands INTEGER,
      source VARCHAR(200) DEFAULT '8-K',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_mstr_btc_purchases_number UNIQUE (purchase_number),
      CONSTRAINT uq_mstr_btc_purchases_date UNIQUE (report_date)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS atm_issuance (
      id BIGSERIAL PRIMARY KEY,
      report_date DATE NOT NULL,
      ticker VARCHAR(10) NOT NULL,
      shares_issued INTEGER,
      proceeds_usd NUMERIC(20,2),
      avg_price NUMERIC(18,6),
      is_estimated BOOLEAN DEFAULT false,
      confidence NUMERIC(4,3) DEFAULT 1.0,
      source VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_atm_issuance_ticker_report_date UNIQUE (ticker, report_date)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS btc_holdings (
      id BIGSERIAL PRIMARY KEY,
      report_date DATE NOT NULL UNIQUE,
      btc_count INTEGER NOT NULL,
      avg_cost_usd NUMERIC(18,2),
      total_cost_usd NUMERIC(20,2),
      is_estimated BOOLEAN DEFAULT false,
      confidence NUMERIC(4,3) DEFAULT 1.0,
      source VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await backfillBtcPurchases();
  await backfillAtmIssuance();
  await backfillBtcHoldings();

  // Verify
  const [purchases] = await sql`SELECT count(*) as cnt FROM mstr_btc_purchases`;
  const [issuance] = await sql`SELECT count(*) as cnt FROM atm_issuance WHERE is_estimated = false`;
  const [holdings] = await sql`SELECT count(*) as cnt FROM btc_holdings`;

  console.log("\nBackfill complete:");
  console.log(`  mstr_btc_purchases: ${purchases.cnt} rows`);
  console.log(`  atm_issuance (confirmed): ${issuance.cnt} rows`);
  console.log(`  btc_holdings: ${holdings.cnt} rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
