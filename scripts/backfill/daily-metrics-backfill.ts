/**
 * Daily Metrics Backfill Script
 *
 * Computes historical daily_metrics from price_history + confirmed BTC purchases.
 * Backfills: btc_coverage_ratio, mNAV, volatility, correlation, beta, and more.
 *
 * Run: npx tsx scripts/backfill/daily-metrics-backfill.ts
 *
 * Data sources:
 *   - price_history table (STRC, MSTR, BTC, STRF, STRK, STRD, SPY EOD prices)
 *   - CONFIRMED_PURCHASES static data (BTC holdings step function)
 *   - EV_TIMELINE from capital-structure.ts (historical capital structure)
 */

import "dotenv/config";

import { CONFIRMED_PURCHASES } from "../../src/lib/data/confirmed-purchases";
import {
  getEvComponents,
  ANNUAL_OBLIGATIONS,
  CONVERT_DEBT_USD,
  CURRENT_PREF_NOTIONAL,
  CASH_BALANCE,
  mnavRegimeFromValue,
} from "../../src/lib/data/capital-structure";
import {
  CONFIRMED_STRC_ATM,
  TOTAL_STRC_SHARES,
} from "../../src/lib/data/confirmed-strc-atm";
import {
  realizedVol,
  beta,
  correlation,
  logReturns,
  std,
} from "../../src/lib/calculators/volatility";

const DB_URL = process.env.DATABASE_URL;
const STRC_IPO_DATE = "2025-07-29";

// --- BTC Holdings step function from confirmed purchases ---

/** Get BTC holdings as of a given date (step function: latest confirmed on or before date) */
function btcHoldingsOnDate(dateStr: string): number {
  let holdings = 0;
  for (const p of CONFIRMED_PURCHASES) {
    if (p.date <= dateStr) holdings = p.cumulative;
    else break;
  }
  return holdings;
}

/** Get MSTR ADSO (shares outstanding) from confirmed purchases Excel data */
// From the Excel, ADSO appears starting purchase #51 (2025-01-13).
// Before that we use estimates from capital structure timeline.
const ADSO_HISTORY: Array<{ date: string; adso: number }> = [
  // Pre-2025: use rough estimates from public filings
  { date: "2020-08-10", adso: 10_300_000 },
  { date: "2021-01-01", adso: 10_600_000 },
  { date: "2022-01-01", adso: 11_300_000 },
  { date: "2023-01-01", adso: 11_400_000 },
  { date: "2024-01-01", adso: 14_000_000 },
  { date: "2024-03-01", adso: 16_500_000 },
  { date: "2024-09-13", adso: 18_500_000 },
  { date: "2024-11-11", adso: 21_500_000 },
  // From Excel (ADSO in thousands)
  { date: "2025-01-06", adso: 281_735_000 },
  { date: "2025-01-13", adso: 282_418_000 },
  { date: "2025-01-21", adso: 285_425_000 },
  { date: "2025-01-27", adso: 288_254_000 },
  { date: "2025-02-10", adso: 289_439_000 },
  { date: "2025-02-24", adso: 294_063_000 },
  { date: "2025-03-17", adso: 294_038_000 },
  { date: "2025-03-24", adso: 296_002_000 },
  { date: "2025-03-31", adso: 299_674_000 },
  { date: "2025-04-14", adso: 300_590_000 },
  { date: "2025-04-21", adso: 302_353_000 },
  { date: "2025-04-28", adso: 306_417_000 },
  { date: "2025-05-05", adso: 306_828_000 },
  { date: "2025-05-12", adso: 310_078_000 },
  { date: "2025-05-19", adso: 311_846_000 },
  { date: "2025-05-26", adso: 312_737_000 },
  { date: "2025-06-02", adso: 312_778_000 },
  { date: "2025-06-09", adso: 312_840_000 },
  { date: "2025-06-16", adso: 312_883_000 },
  { date: "2025-06-23", adso: 312_903_000 },
  { date: "2025-06-30", adso: 314_216_000 },
  { date: "2025-07-14", adso: 314_242_000 },
  { date: "2025-07-21", adso: 316_705_000 },
  { date: "2025-07-29", adso: 316_703_000 },
  { date: "2025-08-11", adso: 316_710_000 },
  { date: "2025-08-18", adso: 316_727_000 },
  { date: "2025-08-25", adso: 317_624_000 },
  { date: "2025-09-02", adso: 318_877_000 },
  { date: "2025-09-08", adso: 319_486_000 },
  { date: "2025-09-15", adso: 319_500_000 },
  { date: "2025-09-22", adso: 319_727_000 },
  { date: "2025-09-29", adso: 320_094_000 },
  { date: "2025-10-13", adso: 320_067_000 },
  { date: "2025-10-20", adso: 320_071_000 },
  { date: "2025-10-27", adso: 320_089_000 },
  { date: "2025-11-03", adso: 320_277_000 },
  { date: "2025-11-10", adso: 320_282_000 },
  { date: "2025-11-17", adso: 320_283_000 },
  { date: "2025-12-01", adso: 328_510_000 },
  { date: "2025-12-08", adso: 333_631_000 },
  { date: "2025-12-15", adso: 338_444_000 },
  { date: "2025-12-29", adso: 343_641_000 },
  { date: "2025-12-31", adso: 344_897_000 },
  { date: "2026-01-05", adso: 345_632_000 },
  { date: "2026-01-12", adso: 352_204_000 },
  { date: "2026-01-20", adso: 362_606_000 },
  { date: "2026-01-26", adso: 364_173_000 },
  { date: "2026-02-02", adso: 364_845_000 },
  { date: "2026-02-09", adso: 365_461_000 },
  { date: "2026-02-17", adso: 366_114_000 },
  { date: "2026-02-23", adso: 366_419_000 },
  { date: "2026-03-02", adso: 368_154_000 },
  { date: "2026-03-09", adso: 374_506_000 },
  { date: "2026-03-16", adso: 377_340_000 },
];

function mstrSharesOnDate(dateStr: string): number {
  let shares = ADSO_HISTORY[0].adso;
  for (const entry of ADSO_HISTORY) {
    if (entry.date <= dateStr) shares = entry.adso;
    else break;
  }
  return shares;
}

/** Get cumulative STRC ATM deployed (net proceeds) as of a given date */
function strcAtmDeployedOnDate(dateStr: string): number {
  let deployed = 0;
  for (const f of CONFIRMED_STRC_ATM) {
    if (f.filed <= dateStr) deployed += f.net_proceeds;
    else break;
  }
  return deployed;
}

async function run() {
  if (!DB_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  console.log("Starting daily_metrics backfill from STRC IPO...");

  const { db } = await import("../../src/db/client");
  const { priceHistory, dailyMetrics, strcRateHistory, sofrHistory } = await import("../../src/db/schema");
  const { eq, and, gte, desc } = await import("drizzle-orm");

  // 1. Fetch all EOD prices for all tickers
  console.log("Fetching price history...");
  const allPrices = await db
    .select({
      ticker: priceHistory.ticker,
      ts: priceHistory.ts,
      price: priceHistory.price,
      volume: priceHistory.volume,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.isEod, true),
        gte(priceHistory.ts, new Date(STRC_IPO_DATE + "T00:00:00Z")),
      ),
    )
    .orderBy(priceHistory.ts);

  // Group prices by date and ticker
  const priceMap = new Map<string, Map<string, { price: number; volume: number }>>();
  for (const row of allPrices) {
    const dateStr = new Date(row.ts).toISOString().slice(0, 10);
    if (!priceMap.has(dateStr)) priceMap.set(dateStr, new Map());
    const dayMap = priceMap.get(dateStr)!;
    dayMap.set(row.ticker.toUpperCase(), {
      price: parseFloat(row.price),
      volume: parseFloat(row.volume ?? "0"),
    });
  }

  // Sort dates
  const allDates = Array.from(priceMap.keys()).sort();
  console.log(`  Found ${allDates.length} trading days with price data`);

  // Filter to days where STRC has data (trading days only)
  const tradingDays = allDates.filter((d) => {
    const dayMap = priceMap.get(d)!;
    const strc = dayMap.get("STRC");
    return strc && strc.price > 0;
  });
  console.log(`  ${tradingDays.length} days with STRC data`);

  // 2. Fetch STRC rate history for effective yield
  const rateRows = await db
    .select()
    .from(strcRateHistory)
    .orderBy(strcRateHistory.effectiveDate);

  function strcRateOnDate(dateStr: string): number | null {
    let rate: number | null = null;
    for (const r of rateRows) {
      if (r.effectiveDate <= dateStr) rate = parseFloat(r.ratePct);
      else break;
    }
    return rate;
  }

  // 3. Fetch SOFR history
  const sofrRows = await db
    .select()
    .from(sofrHistory)
    .orderBy(sofrHistory.date);

  function sofrOnDate(dateStr: string): number | null {
    let rate: number | null = null;
    for (const s of sofrRows) {
      if (s.date <= dateStr) rate = parseFloat(s.sofr1mPct);
      else break;
    }
    return rate;
  }

  // 4. Build rolling price arrays for vol/correlation/beta
  // We need prices leading up to each date
  const tickerPriceArrays: Record<string, Array<{ date: string; price: number }>> = {
    STRC: [], MSTR: [], BTC: [], STRF: [], STRK: [], STRD: [], SPY: [],
  };

  for (const date of allDates) {
    const dayMap = priceMap.get(date)!;
    for (const ticker of Object.keys(tickerPriceArrays)) {
      const entry = dayMap.get(ticker);
      if (entry && entry.price > 0) {
        tickerPriceArrays[ticker].push({ date, price: entry.price });
      }
    }
  }

  // Helper: get last N prices for a ticker up to and including a date
  function getPricesUpTo(ticker: string, dateStr: string, n: number): number[] {
    const arr = tickerPriceArrays[ticker];
    // Find index of last entry on or before dateStr
    let endIdx = -1;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].date <= dateStr) {
        endIdx = i;
        break;
      }
    }
    if (endIdx < 0) return [];
    const startIdx = Math.max(0, endIdx - n + 1);
    return arr.slice(startIdx, endIdx + 1).map((e) => e.price);
  }

  // 5. Compute metrics for each trading day and upsert
  console.log("Computing and upserting daily metrics...");

  const toStr = (v: number | null): string | null =>
    v != null && isFinite(v) ? String(v) : null;

  let insertCount = 0;
  const batchSize = 50;

  for (let i = 0; i < tradingDays.length; i++) {
    const dateStr = tradingDays[i];
    const dayMap = priceMap.get(dateStr)!;

    const strcPrice = dayMap.get("STRC")?.price ?? 0;
    const mstrPrice = dayMap.get("MSTR")?.price ?? 0;
    const btcPrice = dayMap.get("BTC")?.price ?? 0;

    // BTC holdings (step function from confirmed purchases)
    const btcCount = btcHoldingsOnDate(dateStr);
    const btcNavUsd = btcCount * btcPrice;

    // MSTR shares outstanding
    const mstrShares = mstrSharesOnDate(dateStr);
    const mstrMarketCap = mstrPrice * mstrShares;

    // Historical EV components
    const ev = getEvComponents(dateStr);

    // mNAV = EV / BTC Reserve
    let mnav: number | null = null;
    if (btcNavUsd > 0 && mstrMarketCap > 0) {
      const totalEv = mstrMarketCap + ev.convertDebt + ev.prefNotional - ev.cash;
      mnav = parseFloat((totalEv / btcNavUsd).toFixed(4));
    }
    const mnavRegime = mnav != null ? mnavRegimeFromValue(mnav) : null;

    // BTC coverage ratio
    const strcDeployed = strcAtmDeployedOnDate(dateStr);
    const coverageDenom = strcDeployed + ANNUAL_OBLIGATIONS * 3;
    const btcCoverageRatio =
      coverageDenom > 0 && btcNavUsd > 0
        ? parseFloat((btcNavUsd / coverageDenom).toFixed(4))
        : null;

    // STRC impairment price
    const totalSenior = ev.convertDebt + ev.prefNotional;
    const strcImpairmentBtcPrice = btcCount > 0 ? totalSenior / btcCount : null;

    // USD reserve months (use current ANNUAL_OBLIGATIONS as proxy)
    const usdReserveMonths =
      ev.cash > 0 ? ev.cash / (ANNUAL_OBLIGATIONS / 12) : null;

    // --- Volatility (need 22+ prices for 30d, 91+ for 90d) ---
    const strcPrices = getPricesUpTo("STRC", dateStr, 260);
    const mstrPrices = getPricesUpTo("MSTR", dateStr, 260);
    const btcPrices = getPricesUpTo("BTC", dateStr, 260);
    const strfPrices = getPricesUpTo("STRF", dateStr, 100);
    const strkPrices = getPricesUpTo("STRK", dateStr, 100);
    const strdPrices = getPricesUpTo("STRD", dateStr, 100);
    const spyPrices = getPricesUpTo("SPY", dateStr, 260);

    const vol30dStrc = strcPrices.length > 21 ? realizedVol(strcPrices, 21) : null;
    const vol90dStrc = strcPrices.length > 90 ? realizedVol(strcPrices, 90) : null;
    const volRatioStrc =
      vol30dStrc != null && vol90dStrc != null && vol90dStrc > 0
        ? vol30dStrc / vol90dStrc
        : null;

    const vol30dMstr = mstrPrices.length > 21 ? realizedVol(mstrPrices, 21) : null;
    const vol90dMstr = mstrPrices.length > 90 ? realizedVol(mstrPrices, 90) : null;

    const vol30dBtc = btcPrices.length > 21 ? realizedVol(btcPrices, 21) : null;
    const vol90dBtc = btcPrices.length > 90 ? realizedVol(btcPrices, 90) : null;

    const vol30dStrf = strfPrices.length > 21 ? realizedVol(strfPrices, 21) : null;
    const vol90dStrf = strfPrices.length > 90 ? realizedVol(strfPrices, 90) : null;

    const vol30dStrk = strkPrices.length > 21 ? realizedVol(strkPrices, 21) : null;
    const vol90dStrk = strkPrices.length > 90 ? realizedVol(strkPrices, 90) : null;

    const vol30dStrd = strdPrices.length > 21 ? realizedVol(strdPrices, 21) : null;
    const vol90dStrd = strdPrices.length > 90 ? realizedVol(strdPrices, 90) : null;

    // --- Beta ---
    const betaStrcBtc30d =
      strcPrices.length > 30 && btcPrices.length > 30
        ? beta(strcPrices, btcPrices, 30) : null;
    const betaStrcBtc90d =
      strcPrices.length > 90 && btcPrices.length > 90
        ? beta(strcPrices, btcPrices, 90) : null;
    const betaStrcMstr30d =
      strcPrices.length > 30 && mstrPrices.length > 30
        ? beta(strcPrices, mstrPrices, 30) : null;
    const betaStrcMstr90d =
      strcPrices.length > 90 && mstrPrices.length > 90
        ? beta(strcPrices, mstrPrices, 90) : null;

    const betaStrfBtc30d =
      strfPrices.length > 30 && btcPrices.length > 30
        ? beta(strfPrices, btcPrices, 30) : null;
    const betaStrfMstr30d =
      strfPrices.length > 30 && mstrPrices.length > 30
        ? beta(strfPrices, mstrPrices, 30) : null;

    const betaStrkBtc30d =
      strkPrices.length > 30 && btcPrices.length > 30
        ? beta(strkPrices, btcPrices, 30) : null;
    const betaStrkMstr30d =
      strkPrices.length > 30 && mstrPrices.length > 30
        ? beta(strkPrices, mstrPrices, 30) : null;

    const betaStrdBtc30d =
      strdPrices.length > 30 && btcPrices.length > 30
        ? beta(strdPrices, btcPrices, 30) : null;
    const betaStrdMstr30d =
      strdPrices.length > 30 && mstrPrices.length > 30
        ? beta(strdPrices, mstrPrices, 30) : null;

    // --- Correlation ---
    const corrStrcMstr30d =
      strcPrices.length > 30 && mstrPrices.length > 30
        ? correlation(strcPrices, mstrPrices, 30) : null;
    const corrStrcMstr90d =
      strcPrices.length > 90 && mstrPrices.length > 90
        ? correlation(strcPrices, mstrPrices, 90) : null;
    const corrStrcBtc30d =
      strcPrices.length > 30 && btcPrices.length > 30
        ? correlation(strcPrices, btcPrices, 30) : null;
    const corrStrcBtc90d =
      strcPrices.length > 90 && btcPrices.length > 90
        ? correlation(strcPrices, btcPrices, 90) : null;
    const corrStrcSpy30d =
      strcPrices.length > 30 && spyPrices.length > 30
        ? correlation(strcPrices, spyPrices, 30) : null;

    // --- Effective yield & par spread ---
    const strcRatePct = strcRateOnDate(dateStr);
    const strcEffectiveYield =
      strcRatePct != null && strcPrice > 0
        ? (strcRatePct / 100) * (100 / strcPrice) * 100
        : null;
    const strcParSpreadBps =
      strcPrice > 0 ? parseFloat(((strcPrice - 100) * 100).toFixed(0)) : null;

    // --- STRC VWAP (30d volume-weighted) ---
    // We can approximate from available price data
    let strcVwap1m: number | null = null;
    {
      const recentStrc = tickerPriceArrays.STRC
        .filter((e) => e.date <= dateStr)
        .slice(-30);
      if (recentStrc.length > 0) {
        let sumPV = 0, sumV = 0;
        for (const e of recentStrc) {
          const dayData = priceMap.get(e.date)?.get("STRC");
          const v = dayData?.volume ?? 0;
          if (v > 0) {
            sumPV += e.price * v;
            sumV += v;
          }
        }
        strcVwap1m = sumV > 0 ? sumPV / sumV : null;
      }
    }

    // --- STRC notional & market cap ---
    // Use cumulative STRC shares × $100 par for notional
    // Market cap = notional/100 × STRC price
    let strcSharesOnDate = 0;
    for (const f of CONFIRMED_STRC_ATM) {
      if (f.filed <= dateStr) strcSharesOnDate += f.shares_sold;
      else break;
    }
    const strcNotionalUsd = strcSharesOnDate > 0 ? strcSharesOnDate * 100 : null;
    const strcMarketCapUsd =
      strcNotionalUsd != null && strcPrice > 0
        ? (strcNotionalUsd / 100) * strcPrice
        : null;

    // --- Trading volume USD ---
    const strcDayVol = dayMap.get("STRC")?.volume ?? 0;
    const strcTradingVolumeUsd = strcDayVol > 0 ? strcDayVol * strcPrice : null;

    // --- BTC Yield YTD ---
    const year = parseInt(dateStr.slice(0, 4));
    const jan1Str = `${year}-01-01`;
    const btcAtJan1 = btcHoldingsOnDate(jan1Str);
    const btcYieldYtd =
      btcAtJan1 > 0 ? (btcCount - btcAtJan1) / btcAtJan1 : null;
    const btcDollarGainYtd =
      btcAtJan1 > 0 && btcPrice > 0 ? (btcCount - btcAtJan1) * btcPrice : null;

    // --- Sharpe ratio ---
    const sofrPct = sofrOnDate(dateStr);
    const sharpeRatioStrc = (() => {
      const volForSharpe = vol30dStrc;
      if (volForSharpe == null || volForSharpe === 0) return null;
      const annualReturn = strcEffectiveYield != null ? strcEffectiveYield / 100 : null;
      const riskFree = sofrPct != null ? sofrPct / 100 : 0;
      if (annualReturn == null) return null;
      return (annualReturn - riskFree) / volForSharpe;
    })();

    // --- Upsert ---
    const values = {
      date: dateStr,
      mnav: toStr(mnav),
      mnavRegime,
      btcCoverageRatio: toStr(btcCoverageRatio),
      strcImpairmentBtcPrice: toStr(strcImpairmentBtcPrice),
      usdReserveMonths: toStr(usdReserveMonths),
      vol30dStrc: toStr(vol30dStrc),
      vol90dStrc: toStr(vol90dStrc),
      volRatioStrc: toStr(volRatioStrc),
      vol30dMstr: toStr(vol30dMstr),
      vol90dMstr: toStr(vol90dMstr),
      vol30dBtc: toStr(vol30dBtc),
      vol90dBtc: toStr(vol90dBtc),
      vol30dStrf: toStr(vol30dStrf),
      vol90dStrf: toStr(vol90dStrf),
      vol30dStrk: toStr(vol30dStrk),
      vol90dStrk: toStr(vol90dStrk),
      vol30dStrd: toStr(vol30dStrd),
      vol90dStrd: toStr(vol90dStrd),
      betaStrcBtc30d: toStr(betaStrcBtc30d),
      betaStrcBtc90d: toStr(betaStrcBtc90d),
      betaStrcMstr30d: toStr(betaStrcMstr30d),
      betaStrcMstr90d: toStr(betaStrcMstr90d),
      betaStrfBtc30d: toStr(betaStrfBtc30d),
      betaStrfMstr30d: toStr(betaStrfMstr30d),
      betaStrkBtc30d: toStr(betaStrkBtc30d),
      betaStrkMstr30d: toStr(betaStrkMstr30d),
      betaStrdBtc30d: toStr(betaStrdBtc30d),
      betaStrdMstr30d: toStr(betaStrdMstr30d),
      corrStrcMstr30d: toStr(corrStrcMstr30d),
      corrStrcMstr90d: toStr(corrStrcMstr90d),
      corrStrcBtc30d: toStr(corrStrcBtc30d),
      corrStrcBtc90d: toStr(corrStrcBtc90d),
      corrStrcSpy30d: toStr(corrStrcSpy30d),
      strcEffectiveYield: toStr(strcEffectiveYield),
      strcParSpreadBps: toStr(strcParSpreadBps),
      sharpeRatioStrc: toStr(sharpeRatioStrc),
      strcVwap1m: toStr(strcVwap1m),
      strcNotionalUsd: toStr(strcNotionalUsd),
      strcMarketCapUsd: toStr(strcMarketCapUsd),
      strcTradingVolumeUsd: toStr(strcTradingVolumeUsd),
      btcYieldYtd: toStr(btcYieldYtd),
      btcDollarGainYtd: toStr(btcDollarGainYtd),
    };

    try {
      await db
        .insert(dailyMetrics)
        .values(values)
        .onConflictDoUpdate({
          target: dailyMetrics.date,
          set: values,
        });
      insertCount++;
    } catch (err) {
      console.error(`  Error on ${dateStr}:`, err instanceof Error ? err.message : err);
    }

    if ((i + 1) % batchSize === 0 || i === tradingDays.length - 1) {
      console.log(`  Processed ${i + 1}/${tradingDays.length} days (${dateStr})`);
    }
  }

  console.log(`\nBackfill complete: ${insertCount} daily_metrics rows upserted.`);

  // Print sample of what was computed
  if (tradingDays.length > 0) {
    const sampleDate = tradingDays[tradingDays.length - 1];
    const dayMap = priceMap.get(sampleDate)!;
    console.log(`\nSample (${sampleDate}):`);
    console.log(`  BTC holdings: ${btcHoldingsOnDate(sampleDate).toLocaleString()}`);
    console.log(`  BTC price: $${dayMap.get("BTC")?.price.toLocaleString()}`);
    console.log(`  MSTR price: $${dayMap.get("MSTR")?.price.toLocaleString()}`);
    console.log(`  STRC price: $${dayMap.get("STRC")?.price.toFixed(2)}`);
  }
}

run().catch(console.error).finally(() => process.exit());
