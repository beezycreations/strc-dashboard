import { NextResponse } from "next/server";
import {
  SATA_PAR,
  SATA_RATE_PCT,
  SATA_NOTIONAL,
  SATA_ANNUAL_DIVIDEND,
  SATA_MONTHLY_DIVIDEND,
  SATA_ISSUANCE_FLOOR,
  ASST_SHARES_OUTSTANDING,
  SEMLER_CONVERT_NOTES,
  STRC_TREASURY_POSITION,
  computeAmplificationRatio,
  computeSataEvMnav,
  computeSataEffectiveYield,
  computeReserveMonths,
} from "@/src/lib/data/sata-capital-structure";
import { LATEST_SATA_BTC, LATEST_SATA_BTC_DATE } from "@/src/lib/data/sata-confirmed-purchases";
import { isMarketOpen } from "@/src/lib/utils/market-hours";

export const revalidate = 0;

interface LivePrices {
  btc_price: number | null;
  btc_24h_pct: number | null;
  sata_price: number | null;
  sata_volume: number | null;
  asst_price: number | null;
  asst_volume: number | null;
  asst_shares_outstanding: number | null;
  asst_change_pct: number | null;
  strc_price: number | null; // For reserve valuation
  mstr_price: number | null;
  quote_timestamp: number | null;
}

async function fetchLivePrices(): Promise<LivePrices> {
  const result: LivePrices = {
    btc_price: null,
    btc_24h_pct: null,
    sata_price: null,
    sata_volume: null,
    asst_price: null,
    asst_volume: null,
    asst_shares_outstanding: null,
    asst_change_pct: null,
    strc_price: null,
    mstr_price: null,
    quote_timestamp: null,
  };

  // Fetch BTC from CoinGecko
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

  // Fetch SATA + ASST + STRC from FMP
  const fmpKey = process.env.FMP_API_KEY;
  const fmpBase = "https://financialmodelingprep.com/stable";
  const fmpPromise = fmpKey
    ? Promise.all([
        fetch(`${fmpBase}/quote?symbol=SATA&apikey=${fmpKey}`, { next: { revalidate: 30 } })
          .then((r) => r.json())
          .then((data: Array<{ price: number; volume?: number; timestamp?: number }>) => {
            const q = Array.isArray(data) ? data[0] : null;
            if (q) {
              result.sata_price = q.price;
              result.sata_volume = q.volume ?? null;
              result.quote_timestamp = q.timestamp ?? null;
            }
          }).catch(() => {}),
        fetch(`${fmpBase}/quote?symbol=ASST&apikey=${fmpKey}`, { next: { revalidate: 30 } })
          .then((r) => r.json())
          .then((data: Array<{ price: number; volume?: number; changePercentage?: number }>) => {
            const q = Array.isArray(data) ? data[0] : null;
            if (q) {
              result.asst_price = q.price;
              result.asst_volume = q.volume ?? null;
              result.asst_change_pct = q.changePercentage ?? null;
            }
          }).catch(() => {}),
        fetch(`${fmpBase}/profile?symbol=ASST&apikey=${fmpKey}`, { next: { revalidate: 300 } })
          .then((r) => r.json())
          .then((data: Array<{ sharesOutstanding?: number }>) => {
            const p = Array.isArray(data) ? data[0] : null;
            if (p?.sharesOutstanding) result.asst_shares_outstanding = p.sharesOutstanding;
          }).catch(() => {}),
        fetch(`${fmpBase}/quote?symbol=STRC&apikey=${fmpKey}`, { next: { revalidate: 30 } })
          .then((r) => r.json())
          .then((data: Array<{ price: number }>) => {
            const q = Array.isArray(data) ? data[0] : null;
            if (q) result.strc_price = q.price;
          }).catch(() => {}),
        fetch(`${fmpBase}/quote?symbol=MSTR&apikey=${fmpKey}`, { next: { revalidate: 30 } })
          .then((r) => r.json())
          .then((data: Array<{ price: number }>) => {
            const q = Array.isArray(data) ? data[0] : null;
            if (q) result.mstr_price = q.price;
          }).catch(() => {}),
      ]).then(() => {})
    : Promise.resolve();

  await Promise.all([btcPromise, fmpPromise]);
  return result;
}

function buildSnapshot(live: LivePrices) {
  const sataPrice = live.sata_price;
  const btcPrice = live.btc_price;
  const asstPrice = live.asst_price;
  const btcHoldings = LATEST_SATA_BTC;

  // Par spread
  const sataParSpreadBps = sataPrice != null ? parseFloat(((sataPrice - SATA_PAR) * 100).toFixed(0)) : null;

  // Effective yield
  const effectiveYield = sataPrice != null ? computeSataEffectiveYield(sataPrice) : null;

  // ASST market cap
  const asstSharesOut = live.asst_shares_outstanding ?? ASST_SHARES_OUTSTANDING;
  const asstMarketCap = asstPrice != null ? asstSharesOut * asstPrice : null;

  // Amplification ratio
  const amplificationRatio = btcPrice != null
    ? computeAmplificationRatio({ btcHoldings, btcPrice })
    : null;

  // EV/mNAV
  const evMnav = (asstMarketCap != null && btcPrice != null)
    ? computeSataEvMnav({ asstMarketCap, btcHoldings, btcPrice })
    : null;

  // BTC NAV
  const btcNav = btcPrice != null ? btcHoldings * btcPrice : null;

  // Reserve calculation with live STRC price
  const reserves = computeReserveMonths({
    strcPrice: live.strc_price ?? undefined,
  });

  return {
    sata_price: sataPrice,
    sata_par_spread_bps: sataParSpreadBps,
    sata_rate_pct: SATA_RATE_PCT,
    sata_effective_yield: effectiveYield,
    sata_notional: SATA_NOTIONAL,
    sata_annual_dividend: SATA_ANNUAL_DIVIDEND,
    sata_monthly_dividend: SATA_MONTHLY_DIVIDEND,
    sata_issuance_floor: SATA_ISSUANCE_FLOOR,
    sata_volume_today: live.sata_volume ?? 0,

    asst_price: asstPrice,
    asst_change_pct: live.asst_change_pct,
    asst_market_cap: asstMarketCap,
    asst_shares_outstanding: asstSharesOut,

    amplification_ratio: amplificationRatio,
    ev_mnav: evMnav,

    btc_price: btcPrice ?? 0,
    btc_24h_pct: live.btc_24h_pct,
    btc_holdings: btcHoldings,
    btc_holdings_date: LATEST_SATA_BTC_DATE,
    btc_nav: btcNav,

    semler_convert_notes: SEMLER_CONVERT_NOTES,

    // Reserves
    cash_reserve: reserves.cashMonths * SATA_MONTHLY_DIVIDEND,
    cash_reserve_months: reserves.cashMonths,
    strc_reserve_value: reserves.strcValue,
    strc_reserve_months: reserves.strcMonths,
    total_reserve_months: reserves.totalMonths,
    strc_price: live.strc_price,
    strc_treasury_position: STRC_TREASURY_POSITION,

    mstr_price: live.mstr_price,

    is_market_open: isMarketOpen(),
    last_updated: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const live = await fetchLivePrices();
    return NextResponse.json(buildSnapshot(live));
  } catch {
    const empty: LivePrices = {
      btc_price: null, btc_24h_pct: null, sata_price: null, sata_volume: null,
      asst_price: null, asst_volume: null, asst_shares_outstanding: null,
      asst_change_pct: null, strc_price: null, mstr_price: null, quote_timestamp: null,
    };
    return NextResponse.json(buildSnapshot(empty));
  }
}
