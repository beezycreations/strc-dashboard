import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { isMarketOpen, daysToMonthEnd } from "@/src/lib/utils/market-hours";

export const revalidate = 0;

const MOCK_SNAPSHOT = {
  strc_price: 100.45,
  strc_par_spread_bps: 45,
  strc_rate_pct: 11.25,
  strc_rate_since_ipo_bps: 225,
  strc_effective_yield: 11.2,
  mnav: 1.2,
  mnav_regime: "tactical",
  mnav_30d_trend: -0.05,
  mnav_confidence_low: 1.16,
  mnav_confidence_high: 1.24,
  btc_price: 70847,
  btc_24h_pct: 2.31,
  btc_holdings: 738731,
  btc_nav: 52_300_000_000,
  btc_coverage_ratio: 4.3,
  btc_impairment_price: 16700,
  usd_reserve: 2_250_000_000,
  usd_coverage_months: 30.2,
  total_annual_obligations: 689_000_000,
  strc_atm_deployed: 3_400_000_000,
  strc_atm_authorized: 4_200_000_000,
  mstr_atm_deployed_est: 18_000_000_000,
  mstr_atm_authorized: 21_000_000_000,
  sofr_1m_pct: 4.3,
  days_to_announcement: 18,
  min_rate_next_month: 11.0,
  lp_current: 100.45,
  lp_formula_active: true,
  atm_last_confirmed_date: "2026-02-28",
  dividend_stopper_active: false,
  btc_yield_ytd: 0.42,
  btc_dollar_gain_ytd: 8_900_000_000,
  btc_conversion_rate: 0.5,
  mnav_breakeven_btc: 85300,
  is_market_open: false,
  last_updated: new Date().toISOString(),
  strc_volume_today: 4200000,
  strc_volume_avg_20d: 3100000,
  strc_volume_ratio: 1.35,
  atm_deployed_total: 3_400_000_000,
  atm_remaining: 800_000_000,
  atm_pace_90d_monthly: 380_000_000,
};

export async function GET() {
  try {
    const { db } = await import("@/src/db/client");
    const {
      priceHistory,
      strcRateHistory,
      sofrHistory,
      btcHoldings,
      capitalStructureSnapshots,
      atmIssuance,
      dailyMetrics,
      accruedDividends,
    } = await import("@/src/db/schema");

    // Latest STRC price
    const [latestPrice] = await db
      .select()
      .from(priceHistory)
      .where(({ ticker }) => ({ ticker: "STRC" } as never))
      .orderBy(desc(priceHistory.ts))
      .limit(1)
      .catch(() => []);

    // Latest STRC rate
    const [latestRate] = await db
      .select()
      .from(strcRateHistory)
      .orderBy(desc(strcRateHistory.effectiveDate))
      .limit(1)
      .catch(() => []);

    // Latest SOFR
    const [latestSofr] = await db
      .select()
      .from(sofrHistory)
      .orderBy(desc(sofrHistory.date))
      .limit(1)
      .catch(() => []);

    // Latest BTC holdings
    const [latestBtc] = await db
      .select()
      .from(btcHoldings)
      .orderBy(desc(btcHoldings.reportDate))
      .limit(1)
      .catch(() => []);

    // Latest capital structure
    const [latestCap] = await db
      .select()
      .from(capitalStructureSnapshots)
      .orderBy(desc(capitalStructureSnapshots.snapshotDate))
      .limit(1)
      .catch(() => []);

    // Latest daily metrics
    const [latestMetrics] = await db
      .select()
      .from(dailyMetrics)
      .orderBy(desc(dailyMetrics.date))
      .limit(1)
      .catch(() => []);

    // Volume — last 20 EOD records for STRC
    const recentVolumes = await db
      .select()
      .from(priceHistory)
      .where(({ ticker, isEod }) => ({ ticker: "STRC", isEod: true } as never))
      .orderBy(desc(priceHistory.ts))
      .limit(20)
      .catch(() => []);

    // Latest ATM issuance for pace
    const recentAtm = await db
      .select()
      .from(atmIssuance)
      .orderBy(desc(atmIssuance.reportDate))
      .limit(90)
      .catch(() => []);

    // Latest accrued dividends
    const [latestDiv] = await db
      .select()
      .from(accruedDividends)
      .orderBy(desc(accruedDividends.periodEnd))
      .limit(1)
      .catch(() => []);

    // If no price data at all, fall back to mock
    if (!latestPrice && !latestRate) {
      return NextResponse.json({
        ...MOCK_SNAPSHOT,
        is_market_open: isMarketOpen(),
        days_to_announcement: daysToMonthEnd(),
        last_updated: new Date().toISOString(),
      });
    }

    // Parse values
    const strcPrice = latestPrice ? parseFloat(latestPrice.price) : MOCK_SNAPSHOT.strc_price;
    const ratePct = latestRate ? parseFloat(latestRate.ratePct) : MOCK_SNAPSHOT.strc_rate_pct;
    const sofrPct = latestSofr ? parseFloat(latestSofr.sofr1mPct) : MOCK_SNAPSHOT.sofr_1m_pct;
    const btcCount = latestBtc ? latestBtc.btcCount : MOCK_SNAPSHOT.btc_holdings;

    // Derived fields
    const strcParSpreadBps = (strcPrice - 100) * 100;
    const strcEffectiveYield = (ratePct / strcPrice) * 100;
    const daysToAnnouncement = daysToMonthEnd();
    const minRateNextMonth = Math.max(sofrPct, ratePct - 0.25);

    // BTC price from daily metrics or price_history
    const btcPrice = latestMetrics
      ? MOCK_SNAPSHOT.btc_price // would come from price_history for BTC ticker
      : MOCK_SNAPSHOT.btc_price;

    const btcNav = btcCount * btcPrice;
    const btcCoverageRatio = latestMetrics
      ? parseFloat(latestMetrics.btcCoverageRatio ?? "0")
      : MOCK_SNAPSHOT.btc_coverage_ratio;
    const btcImpairmentPrice = latestMetrics
      ? parseFloat(latestMetrics.strcImpairmentBtcPrice ?? "0")
      : MOCK_SNAPSHOT.btc_impairment_price;
    const usdCoverageMonths = latestMetrics
      ? parseFloat(latestMetrics.usdReserveMonths ?? "0")
      : MOCK_SNAPSHOT.usd_coverage_months;

    // Volume stats
    const volumeToday = latestPrice?.volume ? parseFloat(latestPrice.volume) : MOCK_SNAPSHOT.strc_volume_today;
    const volumes = recentVolumes
      .filter((v) => v.volume)
      .map((v) => parseFloat(v.volume!));
    const volumeAvg20d =
      volumes.length > 0
        ? volumes.reduce((a, b) => a + b, 0) / volumes.length
        : MOCK_SNAPSHOT.strc_volume_avg_20d;
    const volumeRatio = volumeAvg20d > 0 ? volumeToday / volumeAvg20d : 1;

    // ATM
    const strcAtmDeployed = latestCap
      ? parseFloat(latestCap.strcAtmDeployedUsd ?? "0")
      : MOCK_SNAPSHOT.strc_atm_deployed;
    const strcAtmAuthorized = latestCap
      ? parseFloat(latestCap.strcAtmAuthorizedUsd ?? "0")
      : MOCK_SNAPSHOT.strc_atm_authorized;
    const atmRemaining = strcAtmAuthorized - strcAtmDeployed;

    // ATM pace: sum last 90 days of issuance / 3
    const atmTotal90d = recentAtm
      .filter((a) => a.ticker === "STRC")
      .reduce((sum, a) => sum + parseFloat(a.proceedsUsd ?? "0"), 0);
    const atmPace90dMonthly = atmTotal90d / 3;

    // mNAV
    const mnav = latestMetrics ? parseFloat(latestMetrics.mnav ?? "0") : MOCK_SNAPSHOT.mnav;
    const mnavLow = latestMetrics ? parseFloat(latestMetrics.mnavLow ?? "0") : MOCK_SNAPSHOT.mnav_confidence_low;
    const mnavHigh = latestMetrics ? parseFloat(latestMetrics.mnavHigh ?? "0") : MOCK_SNAPSHOT.mnav_confidence_high;
    const mnavRegime = latestMetrics?.mnavRegime ?? MOCK_SNAPSHOT.mnav_regime;

    // Capital structure
    const usdReserve = latestCap
      ? parseFloat(latestCap.usdReserveUsd ?? "0")
      : MOCK_SNAPSHOT.usd_reserve;
    const totalAnnualObligations = latestCap
      ? parseFloat(latestCap.totalAnnualObligations ?? "0")
      : MOCK_SNAPSHOT.total_annual_obligations;
    const mstrAtmDeployed = latestCap
      ? parseFloat(latestCap.mstrAtmDeployedUsd ?? "0")
      : MOCK_SNAPSHOT.mstr_atm_deployed_est;
    const mstrAtmAuthorized = latestCap
      ? parseFloat(latestCap.mstrAtmAuthorizedUsd ?? "0")
      : MOCK_SNAPSHOT.mstr_atm_authorized;

    const dividendStopperActive = latestDiv ? !latestDiv.paid : false;

    const snapshot = {
      strc_price: strcPrice,
      strc_par_spread_bps: strcParSpreadBps,
      strc_rate_pct: ratePct,
      strc_rate_since_ipo_bps: MOCK_SNAPSHOT.strc_rate_since_ipo_bps, // historical reference
      strc_effective_yield: strcEffectiveYield,
      mnav,
      mnav_regime: mnavRegime,
      mnav_30d_trend: MOCK_SNAPSHOT.mnav_30d_trend, // requires historical computation
      mnav_confidence_low: mnavLow,
      mnav_confidence_high: mnavHigh,
      btc_price: btcPrice,
      btc_24h_pct: MOCK_SNAPSHOT.btc_24h_pct,
      btc_holdings: btcCount,
      btc_nav: btcNav,
      btc_coverage_ratio: btcCoverageRatio,
      btc_impairment_price: btcImpairmentPrice,
      usd_reserve: usdReserve,
      usd_coverage_months: usdCoverageMonths,
      total_annual_obligations: totalAnnualObligations,
      strc_atm_deployed: strcAtmDeployed,
      strc_atm_authorized: strcAtmAuthorized,
      mstr_atm_deployed_est: mstrAtmDeployed,
      mstr_atm_authorized: mstrAtmAuthorized,
      sofr_1m_pct: sofrPct,
      days_to_announcement: daysToAnnouncement,
      min_rate_next_month: minRateNextMonth,
      lp_current: strcPrice, // liquidation preference = current price for STRC
      lp_formula_active: strcPrice >= 100,
      atm_last_confirmed_date: MOCK_SNAPSHOT.atm_last_confirmed_date,
      dividend_stopper_active: dividendStopperActive,
      btc_yield_ytd: MOCK_SNAPSHOT.btc_yield_ytd,
      btc_dollar_gain_ytd: MOCK_SNAPSHOT.btc_dollar_gain_ytd,
      btc_conversion_rate: MOCK_SNAPSHOT.btc_conversion_rate,
      mnav_breakeven_btc: MOCK_SNAPSHOT.mnav_breakeven_btc,
      is_market_open: isMarketOpen(),
      last_updated: new Date().toISOString(),
      strc_volume_today: volumeToday,
      strc_volume_avg_20d: volumeAvg20d,
      strc_volume_ratio: volumeRatio,
      atm_deployed_total: strcAtmDeployed,
      atm_remaining: atmRemaining,
      atm_pace_90d_monthly: atmPace90dMonthly,
    };

    return NextResponse.json(snapshot);
  } catch {
    // DB not configured or connection error — return mock data
    return NextResponse.json({
      ...MOCK_SNAPSHOT,
      is_market_open: isMarketOpen(),
      days_to_announcement: daysToMonthEnd(),
      last_updated: new Date().toISOString(),
    });
  }
}
