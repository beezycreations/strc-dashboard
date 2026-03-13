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

export const maxDuration = 60;
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

    const [strcPrices, strfPrices, strkPrices, strdPrices, mstrPrices, btcPrices] =
      await Promise.all([
        getEodPrices("STRC"),
        getEodPrices("STRF"),
        getEodPrices("STRK"),
        getEodPrices("STRD"),
        getEodPrices("MSTR"),
        getEodPrices("BTC"),
      ]);

    // ── mNAV ──
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

    const mnav = mstrMarketCap > 0 ? btcNavUsd / mstrMarketCap : null;

    // ── BTC coverage ratio ──
    const totalObligations = Number(latestCapStructure.totalAnnualObligations ?? 0);
    const btcCoverageRatio =
      totalObligations > 0 ? btcNavUsd / totalObligations : null;

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
    const vol30dStrc = strcPrices.length > 30 ? realizedVol(strcPrices, 30) : null;
    const vol90dStrc = strcPrices.length > 90 ? realizedVol(strcPrices, 90) : null;
    const volRatioStrc =
      vol30dStrc != null && vol90dStrc != null && vol90dStrc > 0
        ? vol30dStrc / vol90dStrc
        : null;

    const vol30dMstr = mstrPrices.length > 30 ? realizedVol(mstrPrices, 30) : null;
    const vol90dMstr = mstrPrices.length > 90 ? realizedVol(mstrPrices, 90) : null;

    const vol30dBtc = btcPrices.length > 30 ? realizedVol(btcPrices, 30) : null;
    const vol90dBtc = btcPrices.length > 90 ? realizedVol(btcPrices, 90) : null;

    const vol30dStrf = strfPrices.length > 30 ? realizedVol(strfPrices, 30) : null;
    const vol90dStrf = strfPrices.length > 90 ? realizedVol(strfPrices, 90) : null;

    const vol30dStrk = strkPrices.length > 30 ? realizedVol(strkPrices, 30) : null;
    const vol90dStrk = strkPrices.length > 90 ? realizedVol(strkPrices, 90) : null;

    const vol30dStrd = strdPrices.length > 30 ? realizedVol(strdPrices, 30) : null;
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
    const strcParSpreadBps =
      strcEffectiveYield != null && sofrPct != null
        ? (strcEffectiveYield - sofrPct) * 100
        : null;

    // ── mNAV regime ──
    let mnavRegime: string | null = null;
    if (mnav != null) {
      if (mnav >= 1.5) mnavRegime = "premium";
      else if (mnav >= 1.0) mnavRegime = "par";
      else if (mnav >= 0.7) mnavRegime = "discount";
      else mnavRegime = "distressed";
    }

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
