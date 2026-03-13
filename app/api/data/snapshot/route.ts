import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { isMarketOpen, daysToMonthEnd } from "@/src/lib/utils/market-hours";
import { LATEST_CONFIRMED_BTC, LATEST_CONFIRMED_DATE } from "@/src/lib/data/confirmed-purchases";

export const revalidate = 0;

// ── Live price fetchers ──────────────────────────────────────────────

interface LivePrices {
  btc_price: number | null;
  btc_24h_pct: number | null;
  strc_price: number | null;
  strc_volume: number | null;
  strc_market_cap: number | null;
  strc_shares_outstanding: number | null;
  strc_price_avg_50: number | null;
  mstr_price: number | null;
  mstr_change_pct: number | null;
  mstr_shares_outstanding: number | null;
  quote_timestamp: number | null;
}

async function fetchLivePrices(): Promise<LivePrices> {
  const result: LivePrices = {
    btc_price: null,
    btc_24h_pct: null,
    strc_price: null,
    strc_volume: null,
    strc_market_cap: null,
    strc_shares_outstanding: null,
    strc_price_avg_50: null,
    mstr_price: null,
    mstr_change_pct: null,
    mstr_shares_outstanding: null,
    quote_timestamp: null,
  };

  // Fetch BTC from CoinGecko (no API key needed)
  const btcPromise = fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
    { next: { revalidate: 30 } }
  )
    .then((r) => r.json())
    .then((data) => {
      if (data?.bitcoin) {
        result.btc_price = data.bitcoin.usd ?? null;
        result.btc_24h_pct = data.bitcoin.usd_24h_change
          ? parseFloat(data.bitcoin.usd_24h_change.toFixed(2))
          : null;
      }
    })
    .catch(() => {});

  // Fetch STRC + MSTR from FMP stable API (quote + profile for shares outstanding)
  const fmpKey = process.env.FMP_API_KEY;
  const fmpBase = "https://financialmodelingprep.com/stable";
  const fmpPromise = fmpKey
    ? Promise.all([
        fetch(`${fmpBase}/quote?symbol=STRC&apikey=${fmpKey}`, { next: { revalidate: 30 } })
          .then((r) => r.json())
          .then((data: Array<{ symbol: string; price: number; volume?: number; marketCap?: number; priceAvg50?: number; timestamp?: number }>) => {
            const q = Array.isArray(data) ? data[0] : null;
            if (q) {
              result.strc_price = q.price;
              result.strc_volume = q.volume ?? null;
              // FMP marketCap for STRC returns MSTR's — ignore it, compute from notional instead
              result.strc_price_avg_50 = q.priceAvg50 ?? null;
              result.quote_timestamp = q.timestamp ?? null;
            }
          }).catch(() => {}),
        fetch(`${fmpBase}/quote?symbol=MSTR&apikey=${fmpKey}`, { next: { revalidate: 30 } })
          .then((r) => r.json())
          .then((data: Array<{ symbol: string; price: number; change?: number; changePercentage?: number }>) => {
            const q = Array.isArray(data) ? data[0] : null;
            if (q) {
              result.mstr_price = q.price;
              result.mstr_change_pct = q.changePercentage ?? null;
            }
          }).catch(() => {}),
        fetch(`${fmpBase}/profile?symbol=MSTR&apikey=${fmpKey}`, { next: { revalidate: 300 } })
          .then((r) => r.json())
          .then((data: Array<{ sharesOutstanding?: number }>) => {
            const p = Array.isArray(data) ? data[0] : null;
            if (p?.sharesOutstanding) result.mstr_shares_outstanding = p.sharesOutstanding;
          }).catch(() => {}),
        fetch(`${fmpBase}/profile?symbol=STRC&apikey=${fmpKey}`, { next: { revalidate: 300 } })
          .then((r) => r.json())
          .then((data: Array<{ sharesOutstanding?: number }>) => {
            const p = Array.isArray(data) ? data[0] : null;
            if (p?.sharesOutstanding) result.strc_shares_outstanding = p.sharesOutstanding;
          }).catch(() => {}),
      ]).then(() => {})
    : Promise.resolve();

  await Promise.all([btcPromise, fmpPromise]);
  return result;
}

// ── Capital structure constants (update from 10-Q/8-K filings) ───────
// These are the last confirmed values; estimated ATM issuance adjusts dynamically.

// Last confirmed share count and the MSTR ATM deployed at that filing date.
// When a new 10-Q/8-K drops, update both together so the delta stays accurate.
const MSTR_SHARES_AT_FILING = 332_000_000;     // Basic shares outstanding (~Feb 2026 10-K)
const MSTR_ATM_DEPLOYED_AT_FILING = 16_000_000_000; // MSTR ATM $ deployed as of that filing

// Aggregate principal of convertible notes
const CONVERT_DEBT_USD = 8_200_000_000;

// Perpetual preferred notional (par × shares issued)
const PREF_NOTIONAL: Record<string, number> = {
  STRF: 711_000_000,
  STRC: 3_400_000_000,
  STRK: 700_000_000,
  STRD: 1_000_000_000,
};
const TOTAL_PREF_NOTIONAL = Object.values(PREF_NOTIONAL).reduce((a, b) => a + b, 0);

// Last reported cash balance
const CASH_BALANCE = 1_000_000_000;

/**
 * Estimate adjusted MSTR shares outstanding:
 *   FMP shares (or filing shares) + estimated new shares from ATM since filing
 *
 * New shares = (current MSTR ATM deployed − deployed at filing) / current MSTR price
 * This gets corrected each time a new 8-K/10-Q updates the confirmed share count.
 */
function estimateAdjustedShares(
  baseShares: number,
  mstrAtmDeployedNow: number,
  mstrPrice: number,
): number {
  if (mstrPrice <= 0) return baseShares;
  const incrementalAtmUsd = Math.max(0, mstrAtmDeployedNow - MSTR_ATM_DEPLOYED_AT_FILING);
  const estimatedNewShares = Math.round(incrementalAtmUsd / mstrPrice);
  return baseShares + estimatedNewShares;
}

/**
 * mNAV per Strategy's methodology:
 *   mNAV = Enterprise Value / BTC Reserve
 *
 * Where:
 *   EV = (A) MSTR Market Cap
 *      + (B) Aggregate principal of indebtedness (convertible notes)
 *      + (C) Aggregate notional of perpetual preferred stock
 *      - (D) Most recently reported cash balance
 *
 *   BTC Reserve = BTC Holdings × BTC Price
 */
function computeMnav(params: {
  mstrShares: number;
  mstrPrice: number;
  btcHoldings: number;
  btcPrice: number;
  totalDebt?: number;
  totalPrefNotional?: number;
  cashBalance?: number;
  strcAtmDeployed?: number;  // for dynamic preferred notional adjustment
}): number {
  const {
    mstrShares,
    mstrPrice,
    btcHoldings,
    btcPrice,
    totalDebt = CONVERT_DEBT_USD,
    totalPrefNotional = TOTAL_PREF_NOTIONAL,
    cashBalance = CASH_BALANCE,
    strcAtmDeployed,
  } = params;

  // (A) MSTR common stock market cap
  const marketCap = mstrShares * mstrPrice;

  // (C) Adjust preferred notional if we have a live STRC ATM deployed figure
  // The base PREF_NOTIONAL.STRC is the last confirmed; if strcAtmDeployed is higher, use it
  let adjustedPrefNotional = totalPrefNotional;
  if (strcAtmDeployed !== undefined && strcAtmDeployed > PREF_NOTIONAL.STRC) {
    adjustedPrefNotional = totalPrefNotional - PREF_NOTIONAL.STRC + strcAtmDeployed;
  }

  // EV = Market Cap + Debt + Preferred - Cash
  const ev = marketCap + totalDebt + adjustedPrefNotional - cashBalance;

  // BTC Reserve
  const btcReserve = btcHoldings * btcPrice;

  if (btcReserve <= 0) return 0;
  return parseFloat((ev / btcReserve).toFixed(2));
}

function mnavRegimeFromValue(mnav: number): string {
  // mNAV > 1 = premium (EV exceeds BTC reserve); < 1 = discount
  if (mnav > 2.0) return "premium";
  if (mnav > 1.2) return "tactical";
  return "discount";
}

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
  btc_holdings: LATEST_CONFIRMED_BTC,
  btc_holdings_confirmed: LATEST_CONFIRMED_BTC,
  btc_holdings_confirmed_date: LATEST_CONFIRMED_DATE,
  btc_nav: LATEST_CONFIRMED_BTC * 70847,
  btc_coverage_ratio: 4.3,
  btc_impairment_price: 16700,
  usd_reserve: 2_250_000_000,
  usd_coverage_months: 30.2,
  total_annual_obligations: 689_000_000,
  strc_atm_deployed: 3_842_800_000,
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
  // New overview cards — null until computed by daily-metrics cron
  strc_notional: 3_842_800_000 as number | null,
  strc_market_cap: (3_842_800_000 / 100) * 100.45 as number | null,
  strc_1m_vwap: null as number | null,
  strc_trading_volume_usd: null as number | null,
  mstr_price: null as number | null,
  mstr_change_pct: null as number | null,
};

export async function GET() {
  try {
    // Start live price fetch in parallel with DB queries
    const livePromise = fetchLivePrices();

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

    // Await live prices (started in parallel above)
    const live = await livePromise;

    // If no price data at all, fall back to mock but overlay live prices
    if (!latestPrice && !latestRate) {
      const mock = {
        ...MOCK_SNAPSHOT,
        is_market_open: isMarketOpen(),
        days_to_announcement: daysToMonthEnd(),
        last_updated: new Date().toISOString(),
      };
      // Overlay live prices onto mock
      if (live.btc_price !== null) {
        mock.btc_price = live.btc_price;
        mock.btc_nav = mock.btc_holdings * live.btc_price;
        mock.btc_coverage_ratio = parseFloat(
          (mock.btc_nav / (mock.strc_atm_deployed + mock.total_annual_obligations * 3)).toFixed(2)
        );
      }
      if (live.btc_24h_pct !== null) {
        mock.btc_24h_pct = live.btc_24h_pct;
      }
      if (live.strc_price !== null) {
        mock.strc_price = live.strc_price;
        mock.strc_par_spread_bps = parseFloat(((live.strc_price - 100) * 100).toFixed(0));
        mock.strc_effective_yield = parseFloat(
          ((mock.strc_rate_pct / live.strc_price) * 100).toFixed(2)
        );
        mock.lp_current = live.strc_price;
        mock.lp_formula_active = live.strc_price >= 100;
      }
      // Recompute mNAV = EV / BTC Reserve (Strategy methodology)
      if (live.btc_price !== null && live.mstr_price !== null && live.mstr_price > 0) {
        const baseShares = live.mstr_shares_outstanding ?? MSTR_SHARES_AT_FILING;
        const adjShares = estimateAdjustedShares(baseShares, mock.mstr_atm_deployed_est, live.mstr_price);
        mock.mnav = computeMnav({
          mstrShares: adjShares,
          mstrPrice: live.mstr_price,
          btcHoldings: mock.btc_holdings,
          btcPrice: live.btc_price,
          strcAtmDeployed: mock.strc_atm_deployed,
        });
        mock.mnav_regime = mnavRegimeFromValue(mock.mnav);
        // Breakeven BTC = EV / btcHoldings (price at which mNAV = 1.0)
        const ev = (adjShares * live.mstr_price) + CONVERT_DEBT_USD + TOTAL_PREF_NOTIONAL - CASH_BALANCE;
        mock.mnav_breakeven_btc = Math.round(ev / mock.btc_holdings);
      }
      // Overlay live STRC market data
      // FMP marketCap for STRC is wrong (returns MSTR's), so compute from notional
      if (live.strc_shares_outstanding !== null && live.strc_shares_outstanding > 0) {
        mock.strc_notional = live.strc_shares_outstanding * 100; // par = $100
      }
      const strcPriceMock = live.strc_price ?? mock.strc_price;
      if (mock.strc_notional != null && mock.strc_notional > 0 && strcPriceMock > 0) {
        mock.strc_market_cap = (mock.strc_notional / 100) * strcPriceMock;
      }
      if (live.strc_price_avg_50 !== null) {
        mock.strc_1m_vwap = live.strc_price_avg_50; // 50d SMA as VWAP proxy
      }
      if (live.strc_volume !== null && live.strc_price !== null) {
        mock.strc_trading_volume_usd = live.strc_volume * live.strc_price;
      }
      // MSTR price data
      if (live.mstr_price !== null) mock.mstr_price = live.mstr_price;
      if (live.mstr_change_pct !== null) mock.mstr_change_pct = live.mstr_change_pct;
      return NextResponse.json(mock);
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

    // Overlay live prices when available (fresher than DB)
    const finalStrcPrice = live.strc_price ?? strcPrice;
    const finalBtcPrice = live.btc_price ?? btcPrice;
    const finalBtc24h = live.btc_24h_pct ?? MOCK_SNAPSHOT.btc_24h_pct;
    const finalBtcNav = btcCount * finalBtcPrice;
    const finalStrcParSpreadBps = parseFloat(((finalStrcPrice - 100) * 100).toFixed(0));
    const finalEffYield = parseFloat(((ratePct / finalStrcPrice) * 100).toFixed(2));

    // Recompute mNAV = EV / BTC Reserve (Strategy methodology)
    // Shares = FMP filing shares + estimated ATM issuance since filing
    const baseShares = live.mstr_shares_outstanding ?? MSTR_SHARES_AT_FILING;
    const adjShares = (live.mstr_price !== null && live.mstr_price > 0)
      ? estimateAdjustedShares(baseShares, mstrAtmDeployed, live.mstr_price)
      : baseShares;
    const finalMnav = (live.btc_price !== null && live.mstr_price !== null && live.mstr_price > 0)
      ? computeMnav({
          mstrShares: adjShares,
          mstrPrice: live.mstr_price,
          btcHoldings: btcCount,
          btcPrice: live.btc_price,
          strcAtmDeployed: strcAtmDeployed,
        })
      : mnav;

    const snapshot = {
      strc_price: finalStrcPrice,
      strc_par_spread_bps: finalStrcParSpreadBps,
      strc_rate_pct: ratePct,
      strc_rate_since_ipo_bps: MOCK_SNAPSHOT.strc_rate_since_ipo_bps,
      strc_effective_yield: finalEffYield,
      mnav: finalMnav,
      mnav_regime: live.mstr_price !== null ? mnavRegimeFromValue(finalMnav) : mnavRegime,
      mnav_30d_trend: MOCK_SNAPSHOT.mnav_30d_trend,
      mnav_confidence_low: mnavLow,
      mnav_confidence_high: mnavHigh,
      btc_price: finalBtcPrice,
      btc_24h_pct: finalBtc24h,
      btc_holdings: btcCount,
      btc_nav: finalBtcNav,
      btc_coverage_ratio: finalBtcNav > 0
        ? parseFloat((finalBtcNav / (strcAtmDeployed + totalAnnualObligations * 3)).toFixed(2))
        : btcCoverageRatio,
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
      lp_current: finalStrcPrice,
      lp_formula_active: finalStrcPrice >= 100,
      atm_last_confirmed_date: MOCK_SNAPSHOT.atm_last_confirmed_date,
      dividend_stopper_active: dividendStopperActive,
      btc_yield_ytd: MOCK_SNAPSHOT.btc_yield_ytd,
      btc_dollar_gain_ytd: MOCK_SNAPSHOT.btc_dollar_gain_ytd,
      btc_conversion_rate: MOCK_SNAPSHOT.btc_conversion_rate,
      mnav_breakeven_btc: (live.mstr_price !== null && live.mstr_price > 0)
        ? Math.round(((adjShares * live.mstr_price) + CONVERT_DEBT_USD + TOTAL_PREF_NOTIONAL - CASH_BALANCE) / btcCount)
        : MOCK_SNAPSHOT.mnav_breakeven_btc,
      is_market_open: isMarketOpen(),
      last_updated: new Date().toISOString(),
      strc_volume_today: volumeToday,
      strc_volume_avg_20d: volumeAvg20d,
      strc_volume_ratio: volumeRatio,
      atm_deployed_total: strcAtmDeployed,
      atm_remaining: atmRemaining,
      atm_pace_90d_monthly: atmPace90dMonthly,
      // Overview cards
      // Notional = total face value = shares × $100 par = ATM deployed USD
      // FMP marketCap for STRC is wrong (returns MSTR's), so compute from notional
      strc_notional: latestMetrics?.strcNotionalUsd ? parseFloat(latestMetrics.strcNotionalUsd)
        : (live.strc_shares_outstanding ? live.strc_shares_outstanding * 100
        : (strcAtmDeployed > 0 ? strcAtmDeployed : null)),
      strc_market_cap: (() => {
        // Market cap = shares × current price; shares = notional / $100 par
        const notional = latestMetrics?.strcNotionalUsd ? parseFloat(latestMetrics.strcNotionalUsd)
          : (live.strc_shares_outstanding ? live.strc_shares_outstanding * 100
          : (strcAtmDeployed > 0 ? strcAtmDeployed : null));
        if (notional != null && finalStrcPrice > 0) return (notional / 100) * finalStrcPrice;
        return null;
      })(),
      strc_1m_vwap: latestMetrics?.strcVwap1m ? parseFloat(latestMetrics.strcVwap1m)
        : (live.strc_price_avg_50 ?? null),
      strc_trading_volume_usd: latestMetrics?.strcTradingVolumeUsd ? parseFloat(latestMetrics.strcTradingVolumeUsd)
        : (live.strc_volume != null && live.strc_price != null ? live.strc_volume * live.strc_price
        : (volumeToday > 0 ? volumeToday * finalStrcPrice : null)),
      mstr_price: live.mstr_price,
      mstr_change_pct: live.mstr_change_pct,
    };

    return NextResponse.json(snapshot);
  } catch {
    // DB not configured or connection error — return mock data with live prices
    const live: LivePrices = await fetchLivePrices().catch(() => ({
      btc_price: null,
      btc_24h_pct: null,
      strc_price: null,
      strc_volume: null,
      strc_market_cap: null,
      strc_shares_outstanding: null,
      strc_price_avg_50: null,
      mstr_price: null,
      mstr_change_pct: null,
      mstr_shares_outstanding: null,
      quote_timestamp: null,
    }));

    const mock = {
      ...MOCK_SNAPSHOT,
      is_market_open: isMarketOpen(),
      days_to_announcement: daysToMonthEnd(),
      last_updated: new Date().toISOString(),
    };

    if (live.btc_price !== null) {
      mock.btc_price = live.btc_price;
      mock.btc_nav = mock.btc_holdings * live.btc_price;
      mock.btc_24h_pct = live.btc_24h_pct ?? mock.btc_24h_pct;
      mock.btc_coverage_ratio = parseFloat(
        (mock.btc_nav / (mock.strc_atm_deployed + mock.total_annual_obligations * 3)).toFixed(2)
      );
    }
    // mNAV = EV / BTC Reserve (Strategy methodology)
    if (live.btc_price !== null && live.mstr_price !== null && live.mstr_price > 0) {
      const baseShares = live.mstr_shares_outstanding ?? MSTR_SHARES_AT_FILING;
      const adjShares = estimateAdjustedShares(baseShares, mock.mstr_atm_deployed_est, live.mstr_price);
      mock.mnav = computeMnav({
        mstrShares: adjShares,
        mstrPrice: live.mstr_price,
        btcHoldings: mock.btc_holdings,
        btcPrice: live.btc_price,
        strcAtmDeployed: mock.strc_atm_deployed,
      });
      mock.mnav_regime = mnavRegimeFromValue(mock.mnav);
      mock.mnav_breakeven_btc = Math.round(
        ((adjShares * live.mstr_price) + CONVERT_DEBT_USD + TOTAL_PREF_NOTIONAL - CASH_BALANCE) / mock.btc_holdings
      );
    }
    if (live.strc_price !== null) {
      mock.strc_price = live.strc_price;
      mock.strc_par_spread_bps = parseFloat(((live.strc_price - 100) * 100).toFixed(0));
      mock.strc_effective_yield = parseFloat(
        ((mock.strc_rate_pct / live.strc_price) * 100).toFixed(2)
      );
      mock.lp_current = live.strc_price;
      mock.lp_formula_active = live.strc_price >= 100;
    }
    // Overlay live STRC market data
    // FMP marketCap for STRC is wrong (returns MSTR's), so compute from notional
    if (live.strc_shares_outstanding !== null && live.strc_shares_outstanding > 0) {
      mock.strc_notional = live.strc_shares_outstanding * 100;
    }
    // Market cap = (notional / $100 par) × current price
    const strcPrice = live.strc_price ?? mock.strc_price;
    const notionalVal = mock.strc_notional ?? mock.strc_atm_deployed;
    if (notionalVal > 0 && strcPrice > 0) {
      mock.strc_market_cap = (notionalVal / 100) * strcPrice;
      if (mock.strc_notional == null) mock.strc_notional = notionalVal;
    }
    if (live.strc_price_avg_50 !== null) {
      mock.strc_1m_vwap = live.strc_price_avg_50;
    }
    if (live.strc_volume !== null && live.strc_price !== null) {
      mock.strc_trading_volume_usd = live.strc_volume * live.strc_price;
    }
    // MSTR price data
    if (live.mstr_price !== null) mock.mstr_price = live.mstr_price;
    if (live.mstr_change_pct !== null) mock.mstr_change_pct = live.mstr_change_pct;

    return NextResponse.json(mock);
  }
}
