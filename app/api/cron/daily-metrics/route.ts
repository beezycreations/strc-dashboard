import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from "@/src/db/client";
import {
  priceHistory,
  btcHoldings,
  capitalStructureSnapshots,
  strcRateHistory,
  sofrHistory,
  dailyMetrics,
} from "@/src/db/schema";
import {
  realizedVol,
  beta,
  correlation,
  logReturns,
  std,
  ivPercentile,
} from "@/src/lib/calculators/volatility";
import { computeTrancheMetrics } from "@/src/lib/calculators/tranche-metrics";
import { today } from "@/src/lib/utils/fetchers";
import {
  computeMnav as computeMnavShared,
  mnavRegimeFromValue,
  ANNUAL_OBLIGATIONS,
} from "@/src/lib/data/capital-structure";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ── Capital structure imported from shared module ────────────────────
// All constants in src/lib/data/capital-structure.ts — single source of truth

/** Wrapper for daily-metrics that returns null on invalid inputs */
function computeMnav(params: {
  mstrMarketCap: number;
  btcHoldings: number;
  btcPrice: number;
  strcAtmDeployed?: number;
}): number | null {
  const { mstrMarketCap, btcHoldings, btcPrice } = params;
  if (btcHoldings <= 0 || btcPrice <= 0 || mstrMarketCap <= 0) return null;
  return computeMnavShared({ mstrMarketCap, btcHoldings, btcPrice });
}

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
    const warnings: string[] = [];

    // ── Fetch inputs from DB ──

    // Latest BTC holdings
    const [latestHoldings] = await db
      .select()
      .from(btcHoldings)
      .orderBy(desc(btcHoldings.reportDate))
      .limit(1);

    // Latest capital structure
    const [latestCapStructure] = await db
      .select()
      .from(capitalStructureSnapshots)
      .orderBy(desc(capitalStructureSnapshots.snapshotDate))
      .limit(1);

    // Latest STRC rate
    const [latestRate] = await db
      .select()
      .from(strcRateHistory)
      .orderBy(desc(strcRateHistory.effectiveDate))
      .limit(1);

    // Latest SOFR
    const [latestSofr] = await db
      .select()
      .from(sofrHistory)
      .orderBy(desc(sofrHistory.date))
      .limit(1);

    // Minimum data guard
    if (!latestHoldings || !latestCapStructure) {
      return NextResponse.json({
        ok: false,
        error: "Critical inputs missing: need btc_holdings and capital_structure_snapshots",
      });
    }

    // ── Price series (last 100 EOD rows per ticker) ──
    async function getEodPrices(ticker: string, limit = 100): Promise<number[]> {
      const rows = await db
        .select({ price: priceHistory.price })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.ticker, ticker),
            eq(priceHistory.isEod, true),
          ),
        )
        .orderBy(desc(priceHistory.ts))
        .limit(limit);
      // Reverse so oldest is first
      return rows.map((r) => Number(r.price)).reverse();
    }

    // Fetch 252 trading days for 1Y vol & Sharpe calculation
    const [strcPrices, strfPrices, strkPrices, strdPrices, mstrPrices, btcPrices, spyPrices] =
      await Promise.all([
        getEodPrices("STRC", 260),
        getEodPrices("STRF"),
        getEodPrices("STRK"),
        getEodPrices("STRD"),
        getEodPrices("MSTR"),
        getEodPrices("BTC"),
        getEodPrices("SPY", 260),
      ]);

    // ── mNAV (Strategy methodology: EV / BTC Reserve) ──
    const btcCount = latestHoldings.btcCount;
    const latestBtcPrice = btcPrices.length > 0 ? btcPrices[btcPrices.length - 1] : 0;
    const latestMstrPrice = mstrPrices.length > 0 ? mstrPrices[mstrPrices.length - 1] : 0;
    const mstrShares = latestCapStructure.mstrSharesOutstanding
      ? Number(latestCapStructure.mstrSharesOutstanding)
      : 0;

    const btcNavUsd = btcCount * latestBtcPrice;
    const mstrMarketCap =
      latestMstrPrice > 0 && mstrShares > 0
        ? latestMstrPrice * mstrShares
        : Number(latestCapStructure.mstrMarketCapUsd ?? 0);

    const strcAtmDeployed = Number(latestCapStructure.strcAtmDeployedUsd ?? 0);

    const mnav = computeMnav({
      mstrMarketCap,
      btcHoldings: btcCount,
      btcPrice: latestBtcPrice,
      strcAtmDeployed,
    });

    // ── BTC coverage ratio (same formula as snapshot) ──
    // Denominator = STRC ATM Deployed + 3× Annual Obligations
    const totalObligations = Number(latestCapStructure.totalAnnualObligations ?? 0) || ANNUAL_OBLIGATIONS;
    const coverageDenom = strcAtmDeployed + totalObligations * 3;
    const btcCoverageRatio =
      coverageDenom > 0 && btcNavUsd > 0
        ? parseFloat((btcNavUsd / coverageDenom).toFixed(4))
        : null;

    // ── USD reserve months ──
    const usdReserve = Number(latestCapStructure.usdReserveUsd ?? 0);
    const monthlyObligations = totalObligations / 12;
    const usdReserveMonths =
      monthlyObligations > 0 ? usdReserve / monthlyObligations : null;

    // ── STRC impairment price ──
    const totalSenior =
      Number(latestCapStructure.convertsOutstandingUsd ?? 0) +
      Number(latestCapStructure.strfOutstandingUsd ?? 0) +
      Number(latestCapStructure.strcOutstandingUsd ?? 0) +
      Number(latestCapStructure.strkOutstandingUsd ?? 0) +
      Number(latestCapStructure.strdOutstandingUsd ?? 0);
    const strcImpairmentBtcPrice =
      btcCount > 0 ? totalSenior / btcCount : null;

    // ── Volatility for all tickers ──
    // 21 trading days = 1 calendar month (matches MSTR dashboard methodology)
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

    // ── Beta & Correlation ──
    const betaStrcBtc30d =
      strcPrices.length > 30 && btcPrices.length > 30
        ? beta(strcPrices, btcPrices, 30)
        : null;
    const betaStrcBtc90d =
      strcPrices.length > 90 && btcPrices.length > 90
        ? beta(strcPrices, btcPrices, 90)
        : null;
    const betaStrcMstr30d =
      strcPrices.length > 30 && mstrPrices.length > 30
        ? beta(strcPrices, mstrPrices, 30)
        : null;
    const betaStrcMstr90d =
      strcPrices.length > 90 && mstrPrices.length > 90
        ? beta(strcPrices, mstrPrices, 90)
        : null;

    const betaStrfBtc30d =
      strfPrices.length > 30 && btcPrices.length > 30
        ? beta(strfPrices, btcPrices, 30)
        : null;
    const betaStrfMstr30d =
      strfPrices.length > 30 && mstrPrices.length > 30
        ? beta(strfPrices, mstrPrices, 30)
        : null;

    const betaStrkBtc30d =
      strkPrices.length > 30 && btcPrices.length > 30
        ? beta(strkPrices, btcPrices, 30)
        : null;
    const betaStrkMstr30d =
      strkPrices.length > 30 && mstrPrices.length > 30
        ? beta(strkPrices, mstrPrices, 30)
        : null;

    const betaStrdBtc30d =
      strdPrices.length > 30 && btcPrices.length > 30
        ? beta(strdPrices, btcPrices, 30)
        : null;
    const betaStrdMstr30d =
      strdPrices.length > 30 && mstrPrices.length > 30
        ? beta(strdPrices, mstrPrices, 30)
        : null;

    const corrStrcMstr30d =
      strcPrices.length > 30 && mstrPrices.length > 30
        ? correlation(strcPrices, mstrPrices, 30)
        : null;
    const corrStrcMstr90d =
      strcPrices.length > 90 && mstrPrices.length > 90
        ? correlation(strcPrices, mstrPrices, 90)
        : null;
    const corrStrcBtc30d =
      strcPrices.length > 30 && btcPrices.length > 30
        ? correlation(strcPrices, btcPrices, 30)
        : null;
    const corrStrcBtc90d =
      strcPrices.length > 90 && btcPrices.length > 90
        ? correlation(strcPrices, btcPrices, 90)
        : null;

    // ── Correlation — STRC vs SPY ──
    const corrStrcSpy30d =
      strcPrices.length > 30 && spyPrices.length > 30
        ? correlation(strcPrices, spyPrices, 30)
        : null;

    // ── 1Y realized vol — STRC (calendar year, matches MSTR dashboard) ──
    const priorYear = new Date().getFullYear() - 1;
    const calYearRows = await db
      .select({ price: priceHistory.price })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.ticker, "STRC"),
          eq(priceHistory.isEod, true),
          gte(priceHistory.ts, sql`'${sql.raw(String(priorYear))}-01-01'::timestamptz`),
          lte(priceHistory.ts, sql`'${sql.raw(String(priorYear))}-12-31T23:59:59'::timestamptz`),
        ),
      )
      .orderBy(priceHistory.ts);
    const calYearPrices = calYearRows.map(r => Number(r.price)).filter(p => p > 0);
    // Use calendar year if enough data, else fall back to all available
    const vol1yPrices = calYearPrices.length > 21 ? calYearPrices : strcPrices;
    const vol1yWindow = vol1yPrices.length > 21 ? vol1yPrices.length - 1 : 0;
    const vol1yStrc = vol1yWindow > 0 ? realizedVol(vol1yPrices, vol1yWindow) : null;

    // ── MSTR IV (placeholder — will come from options data) ──
    // For now store null; real IV would come from Deribit or FMP options chain
    const mstrIv30d: number | null = null;
    const mstrIv60d: number | null = null;
    const mstrIvPercentile252d: number | null = null;

    // ── Tranche EST metrics ──
    const strcRatePct = latestRate ? Number(latestRate.ratePct) : null;
    let estConfigA: number | null = null;
    let estConfigB: number | null = null;
    let estConfigC: number | null = null;

    if (strcRatePct != null) {
      const tranches = computeTrancheMetrics(strcRatePct);
      for (const t of tranches) {
        if (t.name === "A") estConfigA = t.est;
        if (t.name === "B") estConfigB = t.est;
        if (t.name === "C") estConfigC = t.est;
      }
    }

    // ── Effective yield ──
    const strcPrice = strcPrices.length > 0 ? strcPrices[strcPrices.length - 1] : null;
    const sofrPct = latestSofr ? Number(latestSofr.sofr1mPct) : null;
    const strcEffectiveYield =
      strcRatePct != null && strcPrice != null && strcPrice > 0
        ? (strcRatePct / 100) * (100 / strcPrice) * 100
        : null;
    // Par spread = (STRC price − $100 par) × 100 bps (same as snapshot)
    const strcParSpreadBps =
      strcPrice != null
        ? parseFloat(((strcPrice - 100) * 100).toFixed(0))
        : null;

    // ── Sharpe Ratio — STRC ──
    // Sharpe = (annualized return − risk-free rate) / annualized vol
    const sharpeRatioStrc = (() => {
      const volForSharpe = vol30dStrc ?? vol1yStrc;
      if (volForSharpe == null || volForSharpe === 0) return null;
      const annualReturn = strcEffectiveYield != null ? strcEffectiveYield / 100 : null;
      const riskFree = sofrPct != null ? sofrPct / 100 : 0;
      if (annualReturn == null) return null;
      return (annualReturn - riskFree) / volForSharpe;
    })();

    // ── STRC market data ──
    const vwapRows = await db
      .select({ price: priceHistory.price, volume: priceHistory.volume })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.ticker, "STRC"),
          eq(priceHistory.isEod, true),
          gte(priceHistory.ts, sql`now() - interval '30 days'`),
        ),
      )
      .orderBy(desc(priceHistory.ts))
      .limit(30);

    let strcVwap1m: number | null = null;
    if (vwapRows.length > 0) {
      let sumPV = 0;
      let sumV = 0;
      for (const row of vwapRows) {
        const p = Number(row.price);
        const v = Number(row.volume ?? 0);
        if (v > 0) {
          sumPV += p * v;
          sumV += v;
        }
      }
      strcVwap1m = sumV > 0 ? sumPV / sumV : null;
    }

    const strcNotionalUsd = Number(latestCapStructure.strcAtmDeployedUsd ?? 0) || null;
    const strcMarketCapUsd =
      strcNotionalUsd != null && strcPrice != null
        ? (strcNotionalUsd / 100) * strcPrice
        : null;

    const latestVwapRow = vwapRows.length > 0 ? vwapRows[0] : null;
    const strcTradingVolumeUsd =
      latestVwapRow && latestVwapRow.volume
        ? Number(latestVwapRow.volume) * Number(latestVwapRow.price)
        : null;

    // ── mNAV regime (same thresholds as snapshot) ──
    const mnavRegime = mnav != null ? mnavRegimeFromValue(mnav) : null;

    // ── Write to daily_metrics ──
    const toStr = (v: number | null): string | null =>
      v != null ? String(v) : null;

    await db
      .insert(dailyMetrics)
      .values({
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
        mstrIv30d: toStr(mstrIv30d),
        mstrIv60d: toStr(mstrIv60d),
        mstrIvPercentile252d: toStr(mstrIvPercentile252d),
        estConfigA: toStr(estConfigA),
        estConfigB: toStr(estConfigB),
        estConfigC: toStr(estConfigC),
        strcEffectiveYield: toStr(strcEffectiveYield),
        strcParSpreadBps: toStr(strcParSpreadBps),
        corrStrcSpy30d: toStr(corrStrcSpy30d),
        sharpeRatioStrc: toStr(sharpeRatioStrc),
        vol1yStrc: toStr(vol1yStrc),
        strcVwap1m: toStr(strcVwap1m),
        strcNotionalUsd: toStr(strcNotionalUsd),
        strcMarketCapUsd: toStr(strcMarketCapUsd),
        strcTradingVolumeUsd: toStr(strcTradingVolumeUsd),
      })
      .onConflictDoUpdate({
        target: dailyMetrics.date,
        set: {
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
          mstrIv30d: toStr(mstrIv30d),
          mstrIv60d: toStr(mstrIv60d),
          mstrIvPercentile252d: toStr(mstrIvPercentile252d),
          estConfigA: toStr(estConfigA),
          estConfigB: toStr(estConfigB),
          estConfigC: toStr(estConfigC),
          strcEffectiveYield: toStr(strcEffectiveYield),
          strcParSpreadBps: toStr(strcParSpreadBps),
          corrStrcSpy30d: toStr(corrStrcSpy30d),
          sharpeRatioStrc: toStr(sharpeRatioStrc),
          vol1yStrc: toStr(vol1yStrc),
          strcVwap1m: toStr(strcVwap1m),
          strcNotionalUsd: toStr(strcNotionalUsd),
          strcMarketCapUsd: toStr(strcMarketCapUsd),
          strcTradingVolumeUsd: toStr(strcTradingVolumeUsd),
        },
      });

    return NextResponse.json({
      ok: true,
      date: dateStr,
      mnav,
      btcCoverageRatio,
      usdReserveMonths,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
