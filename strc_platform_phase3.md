# STRC Intelligence Platform — Phase 3: Data Architecture & API Mapping

**Version:** 1.2  
**Date:** March 2026  
**Purpose:** Complete data pipeline specification for Claude Code implementation. Every field on the dashboard is traced to its exact source call, response path, transformation, and DB write. No field should require guesswork during build.  
**Depends on:** Phase 1 v1.0 (schema, pipeline, formulas) + Phase 2 v2.2 (endpoint interfaces, component contracts)

### Project Identity

| Property | Value |
|---|---|
| Project name | STRC Dashboard |
| GitHub repo | `beezycreations/strc-dashboard` |
| Production domain | `strc.finance` |
| Registrar | Cloudflare Registrar |
| Vercel team | beezycreations |
| Neon project | `strc-dashboard` (new project, isolated from dimetrics) |
| EDGAR User-Agent | `STRCDashboard/1.0 admin@strc.finance` |

### v1.2 Changes

- Added §9 Access Control — Cloudflare Zero Trust spec with finalized domain (`strc.finance`)
- Added Project Identity table with all finalized deployment coordinates
- Updated all placeholder domain references to `strc.finance`
- Updated EDGAR User-Agent string to `STRCDashboard/1.0 admin@strc.finance`
- Updated repo reference to `beezycreations/strc-dashboard`
- Expanded §8 deploy checklist with pre-deploy Zero Trust step and domain registration confirmation

### v1.1 Audit Fixes (10 bugs corrected)

| # | Location | Bug | Fix |
|---|---|---|---|
| 1 | §4.2 BTC extractor | `text.match(/gi/)` drops capture groups | Replaced with `pattern.exec()` on non-global regexes |
| 2 | §5.3 atm-calibration | Dead `rates` variable computed but never used | Removed; replaced with clarifying comment |
| 3 | §3.4 edgar-check | `alreadyProcessed()` (async DB query) called inside `.filter()` — always evaluates to `false`, no filings ever processed | Replaced with upfront `processedSet` query + synchronous filter |
| 4 | §3.4, §5.4 | `err.message` on TypeScript `unknown` catch type — strict-mode compile error | Added `instanceof Error` guard in both catch blocks |
| 5 | §3.3 SOFR cron note | "EDGAR can lag" — EDGAR is the SEC, unrelated to SOFR/FRED | Corrected to reference CME Group publication timing |
| 6 | §2.1 field map | `btc_yield_ytd` said "See formula below" but no formula existed | Added formula: `(btc_now - btc_jan1) / strc_shares_jan1`, expressed as mBTC/share |
| 7 | §3.1 `upsertPrice` | `change24h` parameter accepted but never written to any DB column | Removed parameter; added comment explaining 24h change is derived on read |
| 8 | §2.1 field map | `atm_deployed_total` and `strc_atm_deployed` both map to same source column with no explanation | Added note clarifying both are the same value used in different UI contexts |
| 9 | §6.3 SR1 forward curve | `month_n: i * 3` hardcodes equal 3-month spacing regardless of actual DTE; `SR1` front-month included but may be near-expired | Replaced with DTE-based `month_n` computation using actual contract expiry dates |
| 10 | §3.2 daily-metrics | `rank(today_iv, past_iv_252d)` used undefined `rank()` function | Replaced with explicit `filter(v => v < today_iv).length / n × 100` formula |

---

## Table of Contents

1. [Source Registry](#1-source-registry)
2. [Field-Level API Mapping](#2-field-level-api-mapping)
3. [Cron Job Contracts](#3-cron-job-contracts)
4. [EDGAR 8-K Parser](#4-edgar-8-k-parser)
5. [Backfill Scripts](#5-backfill-scripts)
6. [Data API Route Implementations](#6-data-api-route-implementations)
7. [Data Quality Rules](#7-data-quality-rules)
8. [First-Deploy Checklist](#8-first-deploy-checklist)
9. [Access Control — Cloudflare Zero Trust](#9-access-control--cloudflare-zero-trust)

---

## 1. Source Registry

All external sources used in the pipeline. Reference this table before writing any fetch call — use the exact URLs, param names, and rate limits shown here.

### 1.1 Financial Modeling Prep (FMP)

**Base URL:** `https://financialmodelingprep.com/api`  
**Auth:** `?apikey=${process.env.FMP_API_KEY}` on every request  
**Plan required:** Paid (Standard or higher for options endpoint)  
**Rate limit:** ~300 requests/minute on Standard plan. Never exceed 250/min to leave headroom.

| Endpoint | Method | Used for |
|---|---|---|
| `/v3/quote/{ticker}` | GET | Real-time quote — STRC, STRF, STRK, STRD, MSTR |
| `/v3/historical-price-full/{ticker}` | GET | EOD price history — all tickers |
| `/v3/historical-price-full/SR1` | GET | SOFR futures (SR1) for forward curve |
| `/v3/options/{ticker}` | GET | MSTR options chain (15-min delay) |
| `/v3/income-statement/{ticker}` | GET | Not used in v1 — reserved |

**Quote response shape (used fields only):**
```typescript
// GET /v3/quote/STRC
{
  symbol: "STRC",
  price: 100.45,
  volume: 4200000,
  previousClose: 100.20,
  change: 0.25,
  changesPercentage: 0.25,
  open: 100.15,
  dayHigh: 100.60,
  dayLow: 99.90,
  yearHigh: 103.20,
  yearLow: 89.10,
  timestamp: 1741876800   // Unix seconds
}
```

**Historical price response shape:**
```typescript
// GET /v3/historical-price-full/STRC?from=2025-07-29&to=2026-03-13
{
  symbol: "STRC",
  historical: [
    {
      date: "2026-03-13",
      open: 100.15,
      high: 100.60,
      low: 99.90,
      close: 100.45,
      volume: 4200000,
      adjClose: 100.45,
      change: 0.25,
      changePercent: 0.25,
    },
    // ... oldest last
  ]
}
```
Note: `historical` array is newest-first by default. Reverse before inserting to DB.

**SR1 (SOFR futures) response shape:**
```typescript
// GET /v3/historical-price-full/SR1
// Same structure as above. SR1 is the front-month 1-Month SOFR futures contract.
// Implied SOFR = 100 − close_price
// e.g. close=95.70 → implied SOFR = 4.30%
// For the forward curve: fetch the N-month contracts (SR1, SR1Z5, etc.)
// FMP has limited SR1 chain depth — if forward months unavailable, fall back to FRED projections
```

**MSTR options response shape:**
```typescript
// GET /v3/options/MSTR?apikey=...
{
  symbol: "MSTR",
  option_activity: [
    {
      date: "2026-03-28",          // expiry date (not trade date)
      puts_calls: "PUT",
      strike: "245",
      last_price: "10.50",
      bid: "10.10",
      ask: "10.60",
      volume: 1450,
      open_interest: 18200,
      implied_volatility: "0.88",   // decimal not pct — multiply by 100
      delta: "-0.48",
      theta: "-0.32",
      gamma: "0.02",
      vega: "0.18",
      in_the_money: false,
    },
    // ...
  ]
}
```
Parse: filter `puts_calls === "PUT"`. Strike is string — `parseInt(strike)`. IV is decimal — `parseFloat(implied_volatility) * 100`. Delta, theta are strings — `parseFloat()`.

---

### 1.2 CoinGecko

**Base URL:** `https://api.coingecko.com/api/v3`  
**Auth:** None required on free tier. Optional: `x-cg-demo-api-key` header if key available.  
**Rate limit:** 30 requests/minute free tier. Cache BTC price for 60 seconds minimum.

| Endpoint | Method | Used for |
|---|---|---|
| `/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true` | GET | Live BTC price + 24h change |
| `/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily` | GET | BTC price history for backfill |

**Price response:**
```typescript
// GET /simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true
{
  bitcoin: {
    usd: 70847,
    usd_24h_change: 2.31
  }
}
```

**History response:**
```typescript
// GET /coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily
{
  prices: [
    [1704067200000, 42000.50],   // [unix_ms, price_usd]
    // ...
  ],
  total_volumes: [[...], ...],
  market_caps: [[...], ...]
}
```
Convert unix_ms to ISO date: `new Date(ts).toISOString().slice(0, 10)`.

---

### 1.3 FRED (Federal Reserve Economic Data)

**Base URL:** `https://api.stlouisfed.org/fred`  
**Auth:** `&api_key=${process.env.FRED_API_KEY}&file_type=json`  
**Rate limit:** 120 requests/minute. SOFR fetches once daily — no throttle concern.

| Endpoint | Used for |
|---|---|
| `/series/observations?series_id=TERMSFR1M&sort_order=desc&limit=5` | Latest 1-Month Term SOFR values |
| `/series/observations?series_id=TERMSFR1M&observation_start=2025-01-01` | Historical SOFR for backfill |

**Response:**
```typescript
{
  observations: [
    { date: "2026-03-12", value: "4.30" },
    { date: "2026-03-11", value: "4.30" },
    // ...
  ]
}
```
Note: FRED updates TERMSFR1M on business days, typically by 4pm ET. Value is string — `parseFloat(value)`. On weekends/holidays FRED returns the most recent available value.

---

### 1.4 SEC EDGAR

**Base URL:** `https://data.sec.gov`  
**Auth:** None. Required header: `User-Agent: YourApp/1.0 your@email.com` (EDGAR enforcement policy).  
**Rate limit:** 10 requests/second polite limit. Space calls 100ms apart minimum.  
**CIK:** `0001050446` (MicroStrategy / Strategy)

| Endpoint | Used for |
|---|---|
| `/submissions/CIK0001050446.json` | Filing index — get all recent 8-K accession numbers |
| `/Archives/edgar/data/1050446/{accession_no_normalized}/{primary_document}` | Full 8-K document text |
| `https://efts.sec.gov/LATEST/search-index?q=%22STRC%22&dateRange=custom&startdt={date}&enddt={date}&forms=8-K` | Search filings mentioning STRC |

**Submissions response structure:**
```typescript
{
  cik: "1050446",
  name: "MicroStrategy Incorporated",
  filings: {
    recent: {
      accessionNumber: ["0001050446-26-000012", "0001050446-26-000008", ...],
      filingDate:      ["2026-02-05", "2026-01-30", ...],
      form:            ["8-K", "10-K", "8-K", ...],
      primaryDocument: ["0001050446-26-000012.htm", ...],
      description:     ["Quarterly Report on Bitcoin Holdings", ...]
    }
  }
}
```
Zip `accessionNumber`, `filingDate`, `form`, `primaryDocument`, `description` arrays by index. Filter `form === "8-K"`. Normalize accession number for URL: `"0001050446-26-000012"` → `"000105044626000012"` (remove dashes).

**8-K document URL construction:**
```typescript
function buildEdgarDocUrl(accessionNo: string, primaryDoc: string): string {
  const normalized = accessionNo.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/1050446/${normalized}/${primaryDoc}`;
}
```

---

### 1.5 Deribit (BTC Options)

**Base URL:** `https://www.deribit.com/api/v2/public`  
**Auth:** None for public endpoints  
**Rate limit:** 20 requests/second. Single call for full BTC option chain covers all needs.

| Endpoint | Used for |
|---|---|
| `/get_book_summary_by_currency?currency=BTC&kind=option` | Full BTC options chain — all strikes and expiries |

**Key response fields:** See Phase 2 Section 6.7.2. Parse instrument name `BTC-28MAR26-70000-P` to extract expiry, strike, type. Filter: `type === "P"` (puts only). Filter: `strike >= btcSpot × 0.75 && strike <= btcSpot × 1.15`.

**Expiry bucketing (30d/60d/90d):** Find the nearest real expiry within each window:
```typescript
function bucketExpiry(instruments: DeribitInstrument[], btcSpot: number, window: '30d' | '60d' | '90d') {
  const today = new Date();
  const maxDte = window === '30d' ? 35 : window === '60d' ? 65 : 100;
  const minDte = window === '30d' ? 5 : window === '60d' ? 36 : 66;
  
  // Get unique expiry dates
  const expiries = [...new Set(instruments.map(i => i.expiry))];
  
  // Find the nearest expiry within window
  const target = expiries
    .map(e => ({ e, dte: Math.floor((new Date(e).getTime() - today.getTime()) / 86400000) }))
    .filter(x => x.dte >= minDte && x.dte <= maxDte)
    .sort((a, b) => a.dte - b.dte)[0];
  
  if (!target) return null;
  return instruments.filter(i => i.expiry === target.e);
}
```

---

## 2. Field-Level API Mapping

Every field in every dashboard response traced to its exact source and transformation.

### 2.1 `/api/data/snapshot` — Field Map

| Response field | Source | Transformation |
|---|---|---|
| `strc_price` | FMP `/v3/quote/STRC` → `price` | None |
| `strc_par_spread_bps` | Derived | `(strc_price - 100) × 100` |
| `strc_rate_pct` | `strc_rate_history` → latest `rate_pct` where `effective_date ≤ today` | None |
| `strc_rate_since_ipo_bps` | Derived | `(current_rate_pct - 9.00) × 100` |
| `strc_effective_yield` | Derived | `strc_rate_pct / strc_price × 100` |
| `mnav` | `daily_metrics` → latest `mnav` | None — computed in daily cron |
| `mnav_regime` | `daily_metrics` → latest `mnav_regime` | None |
| `mnav_30d_trend` | `daily_metrics` → `mnav[today] - mnav[30d ago]` | Pulled from two rows |
| `mnav_confidence_low` | `daily_metrics` → `mnav_low` | None |
| `mnav_confidence_high` | `daily_metrics` → `mnav_high` | None |
| `btc_price` | CoinGecko `/simple/price` → `bitcoin.usd` | None |
| `btc_24h_pct` | CoinGecko `/simple/price` → `bitcoin.usd_24h_change` | None |
| `btc_holdings` | `btc_holdings` → latest row `btc_count` | None |
| `btc_nav` | Derived | `btc_holdings × btc_price` |
| `btc_coverage_ratio` | `daily_metrics` → latest `btc_coverage_ratio` | None |
| `btc_impairment_price` | `daily_metrics` → latest `strc_impairment_btc_price` | None |
| `usd_reserve` | `capital_structure_snapshots` → latest `usd_reserve_usd` | None |
| `usd_coverage_months` | `daily_metrics` → latest `usd_reserve_months` | None |
| `total_annual_obligations` | `capital_structure_snapshots` → latest `total_annual_obligations` | None |
| `strc_atm_deployed` | `capital_structure_snapshots` → latest `strc_atm_deployed_usd` | None |
| `strc_atm_authorized` | `capital_structure_snapshots` → latest `strc_atm_authorized_usd` | None |
| `mstr_atm_deployed_est` | `capital_structure_snapshots` → `mstr_atm_deployed_usd` | None |
| `mstr_atm_authorized` | `capital_structure_snapshots` → `mstr_atm_authorized_usd` | None |
| `sofr_1m_pct` | `sofr_history` → latest `sofr_1m_pct` | None |
| `days_to_announcement` | Derived | Calendar days from today to last calendar day of current month |
| `min_rate_next_month` | Derived | `max(sofr_1m_pct, strc_rate_pct - 0.25)` |
| `lp_current` | Derived | See LP formula below |
| `lp_formula_active` | Derived | `true` if ATM event in last 10 calendar days |
| `atm_last_confirmed_date` | `atm_issuance` → latest `report_date` where `ticker='STRC'` | ISO string |
| `dividend_stopper_active` | `accrued_dividends` → any unpaid cumulative amount > 0 | Boolean |
| `btc_yield_ytd` | Derived | BTC yield = `(btc_holdings_now - btc_holdings_jan1) / strc_shares_outstanding_jan1`. Represents BTC accumulated per STRC share outstanding since Jan 1. Expressed as BTC/share × 1000 (i.e., mBTC per share). |
| `btc_dollar_gain_ytd` | Derived | `(btc_holdings_now - btc_holdings_jan1) × btc_price_now` |
| `btc_conversion_rate` | `atm_calibration_params` → `participation_rate_current` for MSTR | Displayed as pct |
| `mnav_breakeven_btc` | Derived | See formula below |
| `is_market_open` | Derived | `isMarketOpen()` from `src/lib/utils/market-hours.ts` |
| `last_updated` | Server | `new Date().toISOString()` |
| `strc_volume_today` | `price_history` → latest `volume` where `ticker='STRC'` | None |
| `strc_volume_avg_20d` | Derived | Mean of last 20 `volume` rows for STRC | None |
| `strc_volume_ratio` | Derived | `strc_volume_today / strc_volume_avg_20d` | None |
| `atm_deployed_total` | Same source as `strc_atm_deployed` — `capital_structure_snapshots.strc_atm_deployed_usd`. **Note:** `strc_atm_deployed` is used in the Capital Stack context (Section 2 capital structure row); `atm_deployed_total` is used in the Volume+ATM Tracker KPI strip (Section 6.1 volume row). Same value, two semantic usages. Frontend may use either field interchangeably. | None |
| `atm_remaining` | Derived | `strc_atm_authorized - strc_atm_deployed` | None |
| `atm_pace_90d_monthly` | Derived | See pace formula below | None |

**LP formula:**
```typescript
// Dynamic Liquidation Preference (CoD definition)
async function computeLP(db: DB): Promise<{ lp: number; active: boolean }> {
  const today = new Date();
  const tenDaysAgo = new Date(today.getTime() - 10 * 86400000);
  
  // Check if ATM active in last 10 CALENDAR days
  const recentAtm = await db
    .select()
    .from(atm_issuance)
    .where(and(
      eq(atm_issuance.ticker, 'STRC'),
      gte(atm_issuance.report_date, tenDaysAgo.toISOString().slice(0, 10))
    ))
    .limit(1);
  
  if (!recentAtm.length) {
    return { lp: 100.00, active: false };
  }
  
  // ATM active: LP = max($100, prior_day_close, 10d_avg_close)
  const priceRows = await db
    .select({ price: price_history.price })
    .from(price_history)
    .where(eq(price_history.ticker, 'STRC'))
    .orderBy(desc(price_history.ts))
    .limit(11);  // today + 10 prior sessions
  
  const closes = priceRows.map(r => parseFloat(r.price));
  const priorDayClose = closes[1] ?? 100;
  const tenDayAvg = closes.slice(1, 11).reduce((a, b) => a + b, 0) / Math.min(10, closes.slice(1).length);
  
  const lp = Math.max(100, priorDayClose, tenDayAvg);
  return { lp: Math.round(lp * 100) / 100, active: true };
}
```

**mNAV break-even BTC formula:**
```typescript
// The BTC price at which ATM issuance is dilution-neutral (mNAV = 1.0)
// Derived from: mNAV = (MSTR_shares × MSTR_price) / (BTC_holdings × BTC_price)
// At break-even: new_shares × MSTR_price = new_BTC × BTC_price → mNAV_new = 1.0
// Simplified: break_even_btc = (MSTR_price × shares_outstanding) / btc_holdings
function mnavBreakevenBtc(mstrPrice: number, sharesOutstanding: number, btcHoldings: number): number {
  return (mstrPrice * sharesOutstanding) / btcHoldings;
}
```

**ATM 90-day pace formula:**
```typescript
// Sum of all ATM proceeds in trailing 90 calendar days, annualized to $/month
async function computeAtmPace90d(db: DB): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const rows = await db
    .select({ proceeds: atm_issuance.proceeds_usd })
    .from(atm_issuance)
    .where(and(
      eq(atm_issuance.ticker, 'STRC'),
      gte(atm_issuance.report_date, cutoff)
    ));
  const total = rows.reduce((s, r) => s + parseFloat(r.proceeds), 0);
  return total / 3;  // 90 days ÷ 3 = monthly rate
}
```

---

### 2.2 `/api/data/history` — Field Map

| Field | Source query | Notes |
|---|---|---|
| `prices[].strc` | `price_history` where `ticker='STRC'`, `is_eod=true` | Use `close` / `price` column |
| `prices[].mstr` | `price_history` where `ticker='MSTR'`, `is_eod=true` | |
| `prices[].btc` | `price_history` where `ticker='BTC'`, `is_eod=true` | |
| `rates[].rate_pct` | `strc_rate_history` ordered by `effective_date` asc | Forward-fill: on dates between resets, carry forward the last known rate |
| `rates[].sofr_pct` | `sofr_history` joined to date range | Forward-fill on weekends/holidays |
| `rates[].is_confirmed` | `strc_rate_history.is_confirmed` | |
| `mnav[].mnav` | `daily_metrics.mnav` | |
| `mnav[].mnav_low` | `daily_metrics.mnav_low` | |
| `mnav[].mnav_high` | `daily_metrics.mnav_high` | |
| `vol[].vol_30d_strc` | `daily_metrics.vol_30d_strc` | |
| `vol[].vol_90d_strc` | `daily_metrics.vol_90d_strc` | |
| `corr[].strc_mstr_30d` | `daily_metrics.corr_strc_mstr_30d` | |
| `corr[].strc_btc_30d` | `daily_metrics.corr_strc_btc_30d` | |
| `sofr_forward[]` | FMP `/v3/historical-price-full/SR1` → latest N contracts | Compute at request time; do not store |

**Forward-fill helper:**
```typescript
function forwardFill<T extends { date: string; value: number | null }>(rows: T[]): T[] {
  let last: number | null = null;
  return rows.map(r => {
    if (r.value !== null) { last = r.value; return r; }
    return { ...r, value: last };
  });
}
```

**Date range:** Default 90 days. Support `?range=1m|3m|all` query param. "all" = from IPO date 2025-07-29.

---

### 2.3 `/api/data/volatility` — Field Map

All fields from `daily_metrics` latest row, plus `corr_history` from last 60 rows.

| Field | Source column |
|---|---|
| `vol_30d` | `daily_metrics.vol_30d_{ticker}` |
| `vol_90d` | `daily_metrics.vol_90d_{ticker}` |
| `vol_ratio` | `daily_metrics.vol_ratio_strc` (STRC only; derive for others: `vol_30d/vol_90d`) |
| `iv_30d` | `daily_metrics.mstr_iv_30d` (MSTR only; null for others) |
| `iv_60d` | `daily_metrics.mstr_iv_60d` (MSTR only) |
| `iv_percentile` | `daily_metrics.mstr_iv_percentile_252d` (MSTR only) |
| `beta_btc_30d` | `daily_metrics.beta_{ticker}_btc_30d` |
| `beta_mstr_30d` | `daily_metrics.beta_{ticker}_mstr_30d` |
| `signal` | Derived: `vol_ratio > 1.5` → 'stress'; `> 1.2` → 'watch'; else 'normal' |

Tickers in vol table: STRC, STRF, STRK, STRD, MSTR, BTC. SPY row shown as baseline — derive `vol_30d_spy` from FMP historical prices using same rolling std formula, do not store separately (compute on demand or add to `daily_metrics`).

---

### 2.4 `/api/data/tranche` — Field Map

All tranche metrics computed from two inputs: `strc_rate_pct` (from `strc_rate_history`) and the three config constants (hardcoded: A=50/50, B=67/33, C=75/25).

```typescript
// src/lib/calculators/tranche-metrics.ts

const SENIOR_TARGET_RATE = 7.5;  // fixed — locked in product design
const CONFIGS = [
  { name: 'A', seniorPct: 0.50, juniorPct: 0.50 },
  { name: 'B', seniorPct: 0.67, juniorPct: 0.33 },
  { name: 'C', seniorPct: 0.75, juniorPct: 0.25 },
];

function computeTrancheMetrics(strcRatePct: number) {
  return CONFIGS.map(c => {
    const scr = strcRatePct / (SENIOR_TARGET_RATE * c.seniorPct);
    const est = strcRatePct - (SENIOR_TARGET_RATE * c.seniorPct);   // excess spread
    const juniorYield = est / c.juniorPct;
    const rfb = est;
    const floor = SENIOR_TARGET_RATE * c.seniorPct;

    return {
      name: c.name,
      senior_pct: c.seniorPct,
      junior_pct: c.juniorPct,
      junior_yield_pct: juniorYield,
      scr,
      est,
      rfb,
      floor_pct: floor,
      scr_status:  scr >= 1.25 ? 'pass' : scr >= 1.0 ? 'watch' : 'eod',
      est_status:  est >= 2.0  ? 'pass' : est >= 0   ? 'watch' : 'eod',
      rfb_status:  rfb >= 3.0  ? 'pass' : rfb >= 2.0 ? 'watch' : 'eod',
    };
  });
}
```

`excess_spread_history` per config: query `daily_metrics.est_config_a|b|c` over the date range. These are stored by the daily cron.

---

### 2.5 `/api/data/volume-atm` — Field Map

| Field | Source |
|---|---|
| `volume_today` | `price_history` → latest `volume` where `ticker='STRC'` |
| `volume_avg_20d` | Mean of last 20 sessions' volume for STRC |
| `volume_ratio` | `volume_today / volume_avg_20d` |
| `atm_authorized` | Constant `4_200_000_000` (locked from CoD) |
| `atm_deployed` | `SUM(proceeds_usd)` from `atm_issuance` where `ticker='STRC'` |
| `atm_remaining` | `atm_authorized - atm_deployed` |
| `atm_pace_90d_monthly` | See Section 2.1 pace formula |
| `volume_history[]` | `price_history` all STRC rows since IPO, with rolling avg and ATM event join |
| `cumulative_atm[]` | Running sum of `atm_issuance.proceeds_usd` aligned to trading day dates |
| `atm_events[]` | `atm_issuance` ordered by `report_date` asc, all STRC rows |

**Rolling average computation (in-route):**
```typescript
// Compute 20-day rolling avg after fetching all rows — do not store
function addRollingAvg(rows: { date: string; volume: number }[]) {
  return rows.map((r, i) => {
    const window = rows.slice(Math.max(0, i - 19), i + 1);
    const avg = window.reduce((s, x) => s + x.volume, 0) / window.length;
    return { ...r, avg_20d: Math.round(avg), vol_ratio: +(r.volume / avg).toFixed(2) };
  });
}
```

---

## 3. Cron Job Contracts

Full specification for all five cron routes. Each route must be idempotent — running it twice on the same data must produce the same result with no duplicate rows.

### 3.1 `/api/cron/prices`

**Schedule:** `* * * * *` (every 1 minute)  
**Vercel timeout:** 10s (default) — must complete within 8s to leave margin  
**File:** `src/app/api/cron/prices/route.ts`

```typescript
export const maxDuration = 10;

export async function GET(request: Request) {
  // 1. Authenticate cron call
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // 2. Determine what to fetch
  const marketOpen = isMarketOpen();
  
  // 3. Always fetch BTC (24/7)
  const btcPrice = await fetchBtcPrice();
  await upsertPrice('BTC', btcPrice.usd, false);
  
  // 4. If market open, fetch all equity tickers
  if (marketOpen) {
    const tickers = ['STRC', 'STRF', 'STRK', 'STRD', 'MSTR'];
    const quotes = await Promise.all(tickers.map(fetchFmpQuote));
    
    for (const [ticker, quote] of zip(tickers, quotes)) {
      if (!quote) continue;  // FMP returned null/error for this ticker
      await upsertPrice(ticker, quote.price, false, {
        volume: quote.volume,
        open: quote.open,
        high: quote.dayHigh,
        low: quote.dayLow,
      });
    }
  }
  
  // 5. At market close (16:00 ET), mark EOD prices
  if (isMarketClose()) {
    await markEodPrices();  // set is_eod=true on latest row for each equity ticker
  }
  
  return Response.json({ ok: true, market_open: marketOpen, ts: new Date().toISOString() });
}
```

**`upsertPrice` implementation:**
```typescript
// Note: change24h is intentionally omitted — price_history schema has no change column.
// 24h change is derived on read from consecutive price rows, not stored.
async function upsertPrice(
  ticker: string,
  price: number,
  isEod: boolean,
  extras?: { volume?: number; open?: number; high?: number; low?: number }
) {
  const now = new Date();
  await db.insert(price_history)
    .values({
      ticker,
      ts: now,
      price: price.toString(),
      volume: extras?.volume?.toString() ?? null,
      source: ticker === 'BTC' ? 'coingecko' : 'fmp',
      is_eod: isEod,
    })
    .onConflictDoUpdate({
      target: [price_history.ticker, price_history.ts, price_history.source],
      set: { price: price.toString(), volume: extras?.volume?.toString() ?? null },
    });
}
```

**`isMarketClose` implementation:**
```typescript
export function isMarketClose(): boolean {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  // True in the 16:00–16:01 window
  return et.getDay() >= 1 && et.getDay() <= 5 && hour === 16 && minute === 0;
}
```

**Error handling:** Wrap each fetch in try/catch. Log errors to console (Vercel captures these). Never throw from the cron handler — return `{ ok: false, error: message }` with status 200 so Vercel does not retry aggressively.

---

### 3.2 `/api/cron/daily-metrics`

**Schedule:** `0 1 * * *` (1am UTC = 8pm ET previous day — after market close)  
**Vercel timeout:** `export const maxDuration = 60`  
**File:** `src/app/api/cron/daily-metrics/route.ts`

**Execution order (strict — each step depends on the previous):**

```
Step 1: Fetch inputs
  a) Latest EOD prices (STRC, MSTR, BTC, STRF, STRK, STRD) from price_history
  b) Latest strc_rate_pct from strc_rate_history
  c) Latest sofr_1m_pct from sofr_history
  d) Latest btc_holdings from btc_holdings
  e) Latest capital_structure_snapshots row
  f) Price history arrays (90d, 252d) for all tickers

Step 2: Compute mNAV
  mstr_shares = capital_structure_snapshots.mstr_shares_outstanding
  mnav = (mstr_price × mstr_shares) / (btc_holdings × btc_price)
  
  // Confidence interval via ATM estimator uncertainty
  mnav_low  = mnav × 0.97   // ±3% from share count uncertainty
  mnav_high = mnav × 1.03
  
  // Regime
  if      (mnav > 4.0)  mnav_regime = 'aggressive'
  else if (mnav > 2.5)  mnav_regime = 'opportunistic'
  else if (mnav > 1.0)  mnav_regime = 'tactical'
  else                  mnav_regime = 'crisis'

Step 3: Compute BTC Coverage
  total_senior_claims = converts + strf_outstanding + strc_outstanding + accrued_unpaid
  btc_coverage_ratio = (btc_holdings × btc_price) / total_senior_claims
  strc_impairment_btc_price = total_senior_claims / btc_holdings

Step 4: Compute USD Coverage
  usd_reserve_months = usd_reserve / (total_annual_obligations / 12)

Step 5: Compute volatility (all tickers)
  For each of [STRC, MSTR, BTC, STRF, STRK, STRD]:
    returns_30d  = log returns over last 30 trading days
    returns_90d  = log returns over last 90 trading days
    vol_30d = std(returns_30d) × sqrt(252)
    vol_90d = std(returns_90d) × sqrt(252)
    vol_ratio = vol_30d / vol_90d   // STRC only

Step 6: Compute beta and correlation
  For STRC vs MSTR (30d and 90d):
    beta_strc_mstr_30d = cov(strc_returns_30d, mstr_returns_30d) / var(mstr_returns_30d)
    corr_strc_mstr_30d = beta × (vol_mstr_30d / vol_strc_30d)
    
  For STRC vs BTC (30d and 90d): same pattern
  For STRF, STRK, STRD vs MSTR and BTC: same pattern (30d only)

Step 7: Compute MSTR IV (from options)
  Fetch ATM put IV from FMP /v3/options/MSTR
  Filter to nearest 30d expiry, ATM strike, extract implied_volatility
  mstr_iv_30d = ATM IV for nearest 30d expiry
  mstr_iv_60d = ATM IV for nearest 60d expiry
  
  // IV percentile (252d rolling)
  past_iv_252d = last 252 rows of daily_metrics.mstr_iv_30d (non-null only)
  // Percentile = fraction of historical days where IV was BELOW today's IV
  mstr_iv_percentile = past_iv_252d.filter(v => v < today_iv).length / past_iv_252d.length × 100
  // e.g. if today_iv=85 and 220 of 252 past days had iv < 85 → percentile = 87.3%

Step 8: Compute tranche metrics
  For each config [A, B, C]:
    scr = strc_rate_pct / (7.5 × senior_pct)
    est = strc_rate_pct - (7.5 × senior_pct)
    rfb = est  // excess spread to reserve fund build
    // Store est_config_a, est_config_b, est_config_c in daily_metrics

Step 9: Compute STRC effective yield
  strc_effective_yield = strc_rate_pct / strc_eod_price × 100
  strc_par_spread_bps = (strc_eod_price - 100) × 100

Step 10: Write to daily_metrics (single upsert)
  ON CONFLICT(date) DO UPDATE — idempotent
```

**Minimum viable data guard:** If any of (strc_price, btc_price, btc_holdings, strc_rate_pct) is null/zero, log an error and abort — do not write a corrupt row.

---

### 3.3 `/api/cron/sofr`

**Schedule:** `0 16 * * 1-5` (4pm UTC, weekdays)  
**Vercel timeout:** `export const maxDuration = 10`  
**File:** `src/app/api/cron/sofr/route.ts`

```typescript
export async function GET(request: Request) {
  // Auth check
  
  // Fetch latest 5 TERMSFR1M observations from FRED
  const url = `https://api.stlouisfed.org/fred/series/observations`
    + `?series_id=TERMSFR1M&sort_order=desc&limit=5`
    + `&api_key=${process.env.FRED_API_KEY}&file_type=json`;
  
  const res = await fetch(url, { next: { revalidate: 0 } });
  const { observations } = await res.json();
  
  // Insert new observations, skip existing
  for (const obs of observations) {
    if (obs.value === '.') continue;  // FRED uses '.' for missing values
    await db.insert(sofr_history)
      .values({ date: obs.date, sofr_1m_pct: parseFloat(obs.value), source: 'fred' })
      .onConflictDoNothing();  // unique index on date — idempotent
  }
  
  return Response.json({ ok: true, latest: observations[0] });
}
```

**Note:** FRED's TERMSFR1M series reflects CME Group's published 1-Month Term SOFR rate. CME typically publishes by 8am ET on business days; FRED ingests and publishes later the same day. The 4pm UTC (noon ET) schedule provides ample buffer. If the latest FRED value is more than 2 business days old, emit a console.warn — this indicates a FRED API or upstream CME publication issue.

---

### 3.4 `/api/cron/edgar-check`

**Schedule:** `0 * * * *` (every hour)  
**Vercel timeout:** `export const maxDuration = 60`  
**File:** `src/app/api/cron/edgar-check/route.ts`

**Full implementation:** See Section 4 (EDGAR 8-K Parser) for the parsing logic called from this route.

```typescript
export const maxDuration = 60;

export async function GET(request: Request) {
  // Auth check
  
  // 1. Fetch filing index
  const submissions = await fetchEdgarSubmissions('0001050446');
  
  // 2. Build candidate 8-K list from index arrays
  const all8Ks = zip(
    submissions.filings.recent.accessionNumber,
    submissions.filings.recent.filingDate,
    submissions.filings.recent.form,
    submissions.filings.recent.primaryDocument,
    submissions.filings.recent.description
  ).filter(([,, form]) => form === '8-K');
  
  // 3. Fetch already-processed accession numbers from DB in one query
  //    IMPORTANT: alreadyProcessed() is async (DB query) — cannot be called inside .filter().
  //    Fetch the full set first, then filter synchronously.
  const processedRows = await db
    .select({ accession_no: edgar_filings.accession_no })
    .from(edgar_filings)
    .where(eq(edgar_filings.processed, true));
  const processedSet = new Set(processedRows.map(r => r.accession_no));
  
  const unprocessed8Ks = all8Ks.filter(([acc]) => !processedSet.has(acc));
  
  // 4. Process up to 3 per cron run to stay within 60s
  const toProcess = unprocessed8Ks.slice(0, 3);
  const results = [];
  
  for (const [accessionNo, filingDate, , primaryDoc] of toProcess) {
    try {
      const result = await parse8K(accessionNo, filingDate, primaryDoc);
      await markProcessed(accessionNo, filingDate, result.notes);
      results.push({ accessionNo, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`EDGAR parse failed for ${accessionNo}:`, err);
      await markProcessed(accessionNo, filingDate, `ERROR: ${msg}`);
    }
    
    // Polite rate limiting — 200ms between requests
    await sleep(200);
  }
  
  return Response.json({ ok: true, processed: results.length, details: results });
}
```

---

### 3.5 `/api/cron/atm-calibration` (GitHub Actions only)

This cron runs via GitHub Actions `workflow_dispatch`, not Vercel — it reprocesses all historical 8-K filings to compute confirmed ATM participation rates.

**Not a Vercel route.** See Section 5.3 for the backfill script.

---

## 4. EDGAR 8-K Parser

The most critical pipeline component. Gets five different data types from a single document type.

### 4.1 Parser Architecture

```typescript
// src/lib/parsers/edgar-8k-parser.ts

export interface ParsedEightK {
  accessionNo:      string;
  filingDate:       string;
  btcHoldings?:     { count: number; avgCost?: number; totalCost?: number };
  atmProceeds?:     { ticker: 'STRC' | 'STRF' | 'STRK' | 'STRD' | 'MSTR'; proceeds: number; shares: number; avgPrice: number }[];
  strcRate?:        { ratePct: number; effectiveDate: string };
  usdReserve?:      { amount: number };
  sharesOutstanding?: { mstr: number };
  notes:            string;  // human-readable summary for edgar_filings.processing_notes
}

export async function parse8K(
  accessionNo: string,
  filingDate: string,
  primaryDoc: string
): Promise<ParsedEightK> {
  const url = buildEdgarDocUrl(accessionNo, primaryDoc);
  const html = await fetchWithRetry(url, { headers: { 'User-Agent': 'STRCDashboard/1.0 admin@strc.finance' } });
  
  // Strip HTML tags for regex matching
  const text = stripHtml(html);
  
  const result: ParsedEightK = { accessionNo, filingDate, notes: '' };
  
  result.btcHoldings    = extractBtcHoldings(text);
  result.atmProceeds    = extractAtmProceeds(text);
  result.strcRate       = extractStrcRate(text, filingDate);
  result.usdReserve     = extractUsdReserve(text);
  result.sharesOutstanding = extractSharesOutstanding(text);
  
  result.notes = buildNotesSummary(result);
  
  return result;
}
```

### 4.2 BTC Holdings Extractor

```typescript
function extractBtcHoldings(text: string): ParsedEightK['btcHoldings'] {
  // Primary pattern: "XXX,XXX bitcoin" or "XXX,XXX BTC"
  // Strategy 8-Ks use "approximately XXX,XXX bitcoin" consistently
  //
  // ⚠️ IMPORTANT: Use pattern.exec(text), NOT text.match(pattern).
  // When a RegExp has the /g flag, text.match() returns all full-match strings
  // with NO capture groups. pattern.exec() preserves capture groups (match[1], etc.).
  const patterns = [
    /approximately\s+([\d,]+)\s+bitcoin/i,
    /([\d,]+)\s+bitcoin/i,
    /aggregate\s+bitcoin\s+holdings\s+of\s+([\d,]+)/i,
    /holds?\s+([\d,]+)\s+(?:bitcoin|btc)/i,
  ];
  
  let count: number | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const parsed = parseInt(match[1].replace(/,/g, ''));
      // Sanity check: must be between 500,000 and 2,000,000 (reasonable BTC holdings range)
      if (parsed >= 500_000 && parsed <= 2_000_000) {
        count = parsed;
        break;
      }
    }
  }
  
  if (!count) return undefined;
  
  // Average cost basis (optional — present in some filings)
  const costMatch = text.match(/average\s+cost\s+(?:basis|per\s+bitcoin)\s+of\s+approximately\s+\$([\d,]+)/i);
  const avgCost = costMatch ? parseInt(costMatch[1].replace(/,/g, '')) : undefined;
  
  return { count, avgCost, totalCost: avgCost ? count * avgCost : undefined };
}
```

**DB write after successful extraction:**
```typescript
if (result.btcHoldings) {
  await db.insert(btc_holdings)
    .values({
      report_date: filingDate,
      btc_count: result.btcHoldings.count,
      avg_cost_usd: result.btcHoldings.avgCost ?? null,
      total_cost_usd: result.btcHoldings.totalCost ?? null,
      is_estimated: false,
      confidence: 1.0,
      source: accessionNo,
    })
    .onConflictDoUpdate({
      target: [btc_holdings.report_date],
      set: {
        btc_count: result.btcHoldings.count,
        is_estimated: false,
        confidence: 1.0,
        source: accessionNo,
      }
    });
}
```

### 4.3 ATM Proceeds Extractor

```typescript
function extractAtmProceeds(text: string): ParsedEightK['atmProceeds'] {
  const results: ParsedEightK['atmProceeds'] = [];
  
  // Strategy 8-Ks have a tabular section: "ATM Sales Activity" or "Preferred Stock ATM Program"
  // Format: "For the period... we sold X shares of STRC... for aggregate proceeds of $Y million"
  
  const tickers: Array<'STRC' | 'STRF' | 'STRK' | 'STRD' | 'MSTR'> = ['STRC', 'STRF', 'STRK', 'STRD', 'MSTR'];
  
  for (const ticker of tickers) {
    // Match pattern: proceeds amount near ATM and ticker reference
    const proceedsPatterns = [
      new RegExp(`${ticker}[^.]{0,200}(?:\\$([\\d.]+)\\s*(?:million|billion)|([\\d,]+)\\s*(?:million|billion)\\s*dollars)[^.]{0,100}(?:atm|at-the-market)`, 'gi'),
      new RegExp(`(?:atm|at-the-market)[^.]{0,200}${ticker}[^.]{0,200}\\$([\\d.]+)\\s*(?:million|billion)`, 'gi'),
      new RegExp(`aggregate\\s+proceeds[^.]{0,100}${ticker}[^.]{0,100}\\$([\\d.]+)\\s*(?:million|billion)`, 'gi'),
    ];
    
    // Shares pattern
    const sharesPatterns = [
      new RegExp(`([\\d,]+)\\s+shares\\s+of[^.]{0,50}${ticker}`, 'gi'),
      new RegExp(`${ticker}[^.]{0,50}([\\d,]+)\\s+shares`, 'gi'),
    ];
    
    let proceeds: number | null = null;
    let shares: number | null = null;
    
    for (const pattern of proceedsPatterns) {
      const match = pattern.exec(text);
      if (match) {
        const raw = parseFloat((match[1] || match[2]).replace(/,/g, ''));
        const isBillion = match[0].toLowerCase().includes('billion');
        proceeds = isBillion ? raw * 1_000_000_000 : raw * 1_000_000;
        break;
      }
    }
    
    for (const pattern of sharesPatterns) {
      const match = pattern.exec(text);
      if (match) {
        shares = parseInt(match[1].replace(/,/g, ''));
        break;
      }
    }
    
    if (proceeds && shares) {
      results.push({
        ticker,
        proceeds,
        shares,
        avgPrice: proceeds / shares,
      });
    }
  }
  
  return results.length > 0 ? results : undefined;
}
```

**DB write:**
```typescript
if (result.atmProceeds) {
  for (const atm of result.atmProceeds) {
    await db.insert(atm_issuance)
      .values({
        report_date: filingDate,
        ticker: atm.ticker,
        shares_issued: atm.shares,
        proceeds_usd: atm.proceeds,
        avg_price: atm.avgPrice,
        is_estimated: false,
        confidence: 1.0,
        source: accessionNo,
      })
      .onConflictDoUpdate({
        target: [atm_issuance.ticker, atm_issuance.report_date],
        set: {
          shares_issued: atm.shares,
          proceeds_usd: atm.proceeds,
          avg_price: atm.avgPrice,
          is_estimated: false,
          source: accessionNo,
        }
      });
  }
}
```

### 4.4 STRC Rate Extractor

```typescript
function extractStrcRate(text: string, filingDate: string): ParsedEightK['strcRate'] {
  // Strategy announces rate changes via press release attached to 8-K
  // Typical language: "STRC... dividend rate of X.XX% per annum"
  // or: "monthly dividend rate... has been set at X.XX%"
  
  const patterns = [
    /STRC[^.]{0,150}(\d+\.\d+)%\s*per\s*annum/gi,
    /(\d+\.\d+)%\s*per\s*annum[^.]{0,150}STRC/gi,
    /monthly\s+(?:regular\s+)?dividend\s+rate[^.]{0,100}(\d+\.\d+)%/gi,
    /dividend\s+rate[^.]{0,50}(?:has\s+been\s+)?(?:set|determined)[^.]{0,50}(\d+\.\d+)%/gi,
    /(\d+\.\d+)%[^.]{0,50}(?:annual(?:ized)?|per\s+annum)[^.]{0,100}(?:stretch|STRC)/gi,
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const ratePct = parseFloat(match[1]);
      // Sanity check: STRC rate should be between 4% and 25% (reasonable range)
      if (ratePct >= 4.0 && ratePct <= 25.0) {
        // Rate effective date is first business day of the announced month
        // Filing date is typically the last week of the prior month
        const filingDt = new Date(filingDate);
        const effectiveMonth = new Date(filingDt.getFullYear(), filingDt.getMonth() + 1, 1);
        const effectiveDate = effectiveMonth.toISOString().slice(0, 10);
        
        return { ratePct, effectiveDate };
      }
    }
  }
  
  return undefined;
}
```

**DB write:**
```typescript
if (result.strcRate) {
  await db.insert(strc_rate_history)
    .values({
      effective_date: result.strcRate.effectiveDate,
      rate_pct: result.strcRate.ratePct,
      announced_date: filingDate,
      is_confirmed: true,
      source: accessionNo,
    })
    .onConflictDoUpdate({
      target: [strc_rate_history.effective_date],
      set: {
        rate_pct: result.strcRate.ratePct,
        is_confirmed: true,
        source: accessionNo,
      }
    });
}
```

**⚠️ Rate effective date logic:** The announcement typically comes in the last few days of month N. The new rate is effective the first business day of month N+1. The extractor infers this from the filing date. If the filing text explicitly states an effective date (e.g., "effective April 1, 2026"), parse that directly and use it instead.

### 4.5 USD Reserve Extractor

```typescript
function extractUsdReserve(text: string): ParsedEightK['usdReserve'] {
  const patterns = [
    /USD\s+Reserve[^.]{0,100}\$?([\d.]+)\s*(?:billion|million)/gi,
    /cash\s+and\s+cash\s+equivalents[^.]{0,100}\$?([\d.]+)\s*(?:billion|million)/gi,
    /\$?([\d.]+)\s*(?:billion|million)[^.]{0,100}(?:USD\s+Reserve|unrestricted\s+cash)/gi,
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const raw = parseFloat(match[1]);
      const isBillion = match[0].toLowerCase().includes('billion');
      const amount = isBillion ? raw * 1_000_000_000 : raw * 1_000_000;
      // Sanity check: must be between $100M and $20B
      if (amount >= 1e8 && amount <= 2e10) return { amount };
    }
  }
  return undefined;
}
```

**DB write:** Updates `capital_structure_snapshots.usd_reserve_usd` for the filing date row. If no row exists for that date, insert a new snapshot row with known fields and null for unknowns.

### 4.6 Shares Outstanding Extractor

```typescript
function extractSharesOutstanding(text: string): ParsedEightK['sharesOutstanding'] {
  const patterns = [
    /(\d{1,3}(?:,\d{3})*)\s+shares\s+of\s+(?:Class\s+A\s+)?common\s+stock\s+(?:were\s+)?(?:issued\s+and\s+)?outstanding/gi,
    /(?:Class\s+A\s+)?common\s+stock[^.]{0,100}(\d{1,3}(?:,\d{3})*)\s+shares\s+outstanding/gi,
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const shares = parseInt(match[1].replace(/,/g, ''));
      // Sanity check: MSTR shares are roughly 200M–350M in 2025–2026
      if (shares >= 100_000_000 && shares <= 500_000_000) {
        return { mstr: shares };
      }
    }
  }
  return undefined;
}
```

### 4.7 Parser Failure Modes and Fallbacks

| Failure | Expected frequency | Handling |
|---|---|---|
| HTTP 429 from EDGAR | Rare | Retry after 5s with exponential backoff (max 3 retries) |
| Regex matched but sanity check failed | Occasional | Log the raw match + sanity failure; skip this field, continue with others |
| Filing is HTML with heavy JS (dynamic rendering) | Rare | Try fetching `.txt` version of same accession if primary doc fails |
| Rate announced in text format ("eleven and one-quarter percent") | Possible | Add text-to-number patterns; flag for manual review if unparsed |
| Filing describes prior period only (e.g., 10-K) | Regular | BTC holdings still extractable; rate may not be present — acceptable |
| Connection timeout | Occasional | Mark filing as `processed=false` with note; retry next cron run |

**The parser must never corrupt the database.** When uncertain, prefer writing nothing over writing a wrong value. All parser writes include `source: accessionNo` so any bad data can be traced and corrected.

---

## 5. Backfill Scripts

All four scripts live in `scripts/backfill/`. Run via GitHub Actions (`workflow_dispatch`) or locally against `NEON_DATABASE_DIRECT_URL`. Never run against production DB with live traffic — use Neon's branching feature to create a test branch first.

### 5.1 `price-backfill.ts`

**Purpose:** Pull all EOD price history from IPO date (2025-07-29) to today for STRC, STRF, STRK, STRD, MSTR, and BTC.

```typescript
// scripts/backfill/price-backfill.ts

const TICKERS_FMP = ['STRC', 'STRF', 'STRK', 'STRD', 'MSTR'];
const IPO_DATE = '2025-07-29';

async function run() {
  console.log('Starting price backfill from', IPO_DATE);
  
  // FMP equity tickers
  for (const ticker of TICKERS_FMP) {
    console.log(`Fetching ${ticker}...`);
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}`
      + `?from=${IPO_DATE}&to=${today()}&apikey=${process.env.FMP_API_KEY}`;
    
    const res = await fetch(url);
    const { historical } = await res.json();
    
    // Reverse: historical is newest-first, insert oldest-first
    const rows = [...historical].reverse();
    
    for (const row of rows) {
      await directDb.insert(price_history).values({
        ticker,
        ts: new Date(row.date + 'T16:00:00-05:00'),  // 4pm ET = market close
        price: row.close.toString(),
        volume: row.volume?.toString() ?? null,
        source: 'fmp',
        is_eod: true,
      }).onConflictDoNothing();
    }
    
    console.log(`  ✓ ${rows.length} days inserted for ${ticker}`);
    await sleep(300);  // 300ms between FMP calls
  }
  
  // BTC from CoinGecko
  console.log('Fetching BTC...');
  const btcUrl = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart`
    + `?vs_currency=usd&days=365&interval=daily`;
  const btcRes = await fetch(btcUrl);
  const { prices } = await btcRes.json();
  
  for (const [tsMs, price] of prices) {
    const date = new Date(tsMs).toISOString().slice(0, 10);
    if (date < IPO_DATE) continue;
    await directDb.insert(price_history).values({
      ticker: 'BTC',
      ts: new Date(tsMs),
      price: price.toString(),
      source: 'coingecko',
      is_eod: true,
    }).onConflictDoNothing();
  }
  
  console.log('Price backfill complete.');
}

run().catch(console.error).finally(() => process.exit());
```

---

### 5.2 `rate-history-reconstruction.ts`

**Purpose:** Pull all Strategy 8-K filings since STRC IPO, extract rate announcements, seed `strc_rate_history` with confirmed entries only.

**⚠️ Critical:** Run this before seeding any rate data. See Phase 1 Appendix A for the mandatory execution sequence.

```typescript
// scripts/backfill/rate-history-reconstruction.ts

async function run() {
  console.log('Scanning EDGAR 8-Ks for STRC rate announcements...');
  
  // 1. Fetch all filings since IPO
  const submissions = await fetchEdgarSubmissions('0001050446');
  const filings8K = extractFilings8K(submissions, IPO_DATE);
  
  console.log(`Found ${filings8K.length} 8-K filings since ${IPO_DATE}`);
  
  // 2. Parse each for STRC rate
  const confirmed: { effectiveDate: string; ratePct: number; source: string }[] = [];
  
  for (const filing of filings8K) {
    const html = await fetchEdgarDoc(filing.accessionNo, filing.primaryDoc);
    const text = stripHtml(html);
    const rateResult = extractStrcRate(text, filing.filingDate);
    
    if (rateResult) {
      console.log(`  ✓ Found rate ${rateResult.ratePct}% in ${filing.accessionNo} (filing: ${filing.filingDate})`);
      confirmed.push({
        effectiveDate: rateResult.effectiveDate,
        ratePct: rateResult.ratePct,
        source: filing.accessionNo,
      });
    }
    
    await sleep(200);
  }
  
  // 3. Print reconciliation report
  console.log('\n═══ RECONCILIATION REPORT ═══');
  console.log('Confirmed from EDGAR:');
  confirmed.forEach(r => console.log(`  ${r.effectiveDate}: ${r.ratePct}%  (${r.source})`));
  
  // 4. Cross-check against expected reference values
  const EXPECTED = [
    { date: '2025-07-29', rate: 9.00 },    // IPO (CoD)
    { date: '2025-11-01', rate: 10.50 },   // Q3 earnings
    { date: '2026-01-01', rate: 11.25 },   // Q4 earnings
    { date: '2026-02-01', rate: 11.25 },   // Q4 earnings
  ];
  
  console.log('\nValidation against known confirmed values:');
  for (const expected of EXPECTED) {
    const found = confirmed.find(r => r.effectiveDate === expected.date);
    const match = found && found.ratePct === expected.rate;
    console.log(`  ${expected.date} ${expected.rate}%: ${match ? '✓ MATCH' : found ? `⚠ MISMATCH (found ${found.ratePct}%)` : '✗ NOT FOUND'}`);
  }
  
  // 5. Write only confirmed entries — IPO entry added manually (not from 8-K)
  console.log('\nWriting confirmed entries to strc_rate_history...');
  
  // IPO rate is from CoD, not 8-K — insert manually
  await directDb.insert(strc_rate_history).values({
    effective_date: '2025-07-29',
    rate_pct: 9.00,
    announced_date: '2025-07-28',
    is_confirmed: true,
    source: 'Certificate of Designations — IPO',
  }).onConflictDoNothing();
  
  for (const r of confirmed) {
    await directDb.insert(strc_rate_history).values({
      effective_date: r.effectiveDate,
      rate_pct: r.ratePct,
      is_confirmed: true,
      source: r.source,
    }).onConflictDoUpdate({
      target: [strc_rate_history.effective_date],
      set: { rate_pct: r.ratePct, is_confirmed: true, source: r.source },
    });
  }
  
  console.log(`\nDone. ${confirmed.length + 1} confirmed entries written.`);
  console.log('Review gaps in the rate chart — NULL months display as interpolated dashes (not zero).');
}

run().catch(console.error).finally(() => process.exit());
```

---

### 5.3 `atm-calibration.ts`

**Purpose:** Reprocess all historical 8-K ATM disclosures to compute confirmed participation rates per ticker. Updates `atm_calibration_params` table.

```typescript
// scripts/backfill/atm-calibration.ts
// Logic: for each confirmed ATM event, compute actual_participation = shares_issued / avg_daily_volume
// Use this to calibrate the participation_rate_current for the estimator

async function run() {
  console.log('Calibrating ATM participation rates...');
  
  const tickers = ['STRC', 'STRF', 'STRK', 'STRD', 'MSTR'];
  
  for (const ticker of tickers) {
    // Get all confirmed ATM events for this ticker
    const events = await directDb.select()
      .from(atm_issuance)
      .where(and(eq(atm_issuance.ticker, ticker), eq(atm_issuance.is_estimated, false)))
      .orderBy(asc(atm_issuance.report_date));
    
    if (!events.length) {
      console.log(`  ${ticker}: no confirmed events — using defaults`);
      continue;
    }
    
    // NOTE: With only ~7 confirmed events at launch, there is insufficient data
    // to derive statistically meaningful participation rates from share counts alone.
    // Use hardcoded defaults (MSTR=0.04, preferreds=0.20) as the initial calibration.
    // These will be overwritten on each reconciliation as more 8-K events accumulate.
    const participationRates = events.map(_e => {
      return ticker === 'MSTR' ? 0.04 : 0.20;
    });
    
    const low = Math.min(...participationRates);
    const high = Math.max(...participationRates);
    const current = participationRates.reduce((a, b) => a + b, 0) / participationRates.length;
    
    await directDb.insert(atm_calibration_params).values({
      ticker,
      participation_rate_low: low,
      participation_rate_high: high,
      participation_rate_current: current,
      sample_count: events.length,
      last_calibrated_date: new Date().toISOString().slice(0, 10),
      notes: `Calibrated from ${events.length} confirmed 8-K events`,
    }).onConflictDoUpdate({
      target: [atm_calibration_params.ticker],
      set: {
        participation_rate_low: low,
        participation_rate_high: high,
        participation_rate_current: current,
        sample_count: events.length,
        last_calibrated_date: new Date().toISOString().slice(0, 10),
      }
    });
    
    console.log(`  ${ticker}: low=${low.toFixed(3)} high=${high.toFixed(3)} current=${current.toFixed(3)} (n=${events.length})`);
  }
  
  console.log('ATM calibration complete.');
}

run().catch(console.error).finally(() => process.exit());
```

---

### 5.4 `edgar-full-scan.ts`

**Purpose:** Process ALL historical Strategy 8-K filings since IPO in one pass. Populates: `btc_holdings`, `atm_issuance`, `strc_rate_history`, `capital_structure_snapshots`, `mstr_shares_history`.

**Run once on initial setup. Never run again unless resetting the DB.**

```typescript
// scripts/backfill/edgar-full-scan.ts

async function run() {
  console.log('Full EDGAR scan — processing all 8-K filings since', IPO_DATE);
  
  const submissions = await fetchEdgarSubmissions('0001050446');
  const filings8K = extractFilings8K(submissions, IPO_DATE);
  
  console.log(`Processing ${filings8K.length} 8-K filings...`);
  
  let processed = 0, errors = 0;
  
  for (const filing of filings8K) {
    try {
      const result = await parse8K(filing.accessionNo, filing.filingDate, filing.primaryDoc);
      await persistParsedEightK(result);  // writes to all relevant tables
      await markProcessed(filing.accessionNo, filing.filingDate, result.notes);
      processed++;
      
      if (processed % 10 === 0) {
        console.log(`  Processed ${processed}/${filings8K.length} filings...`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR: ${filing.accessionNo}:`, msg);
      errors++;
    }
    
    await sleep(200);  // Polite EDGAR rate limiting
  }
  
  console.log(`\nScan complete. Processed: ${processed}, Errors: ${errors}`);
  console.log('Run rate-history-reconstruction.ts next to verify rate history completeness.');
}

run().catch(console.error).finally(() => process.exit());
```

---

## 6. Data API Route Implementations

Full TypeScript implementation sketches for all six data routes. These are the canonical implementations — Claude Code should use these as the basis for the actual routes.

### 6.1 `/api/data/snapshot/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { isMarketOpen } from '@/lib/utils/market-hours';
// ... other imports

export const revalidate = 0;  // No ISR — always fresh

export async function GET() {
  const [
    strcQuote,
    latestRate,
    latestSofr,
    latestMetrics,
    latestCapital,
    latestBtc,
    latestAtm,
    btcSpot,
    volumeStats,
  ] = await Promise.all([
    db.query.price_history.findFirst({
      where: eq(price_history.ticker, 'STRC'),
      orderBy: [desc(price_history.ts)],
    }),
    db.query.strc_rate_history.findFirst({
      where: lte(strc_rate_history.effective_date, today()),
      orderBy: [desc(strc_rate_history.effective_date)],
    }),
    db.query.sofr_history.findFirst({
      orderBy: [desc(sofr_history.date)],
    }),
    db.query.daily_metrics.findFirst({
      orderBy: [desc(daily_metrics.date)],
    }),
    db.query.capital_structure_snapshots.findFirst({
      orderBy: [desc(capital_structure_snapshots.snapshot_date)],
    }),
    db.query.btc_holdings.findFirst({
      orderBy: [desc(btc_holdings.report_date)],
    }),
    db.query.atm_issuance.findFirst({
      where: eq(atm_issuance.ticker, 'STRC'),
      orderBy: [desc(atm_issuance.report_date)],
    }),
    fetchBtcSpot(),          // CoinGecko live price
    computeVolumeStats(db),  // volume_today, avg_20d, ratio
  ]);
  
  if (!strcQuote || !latestRate || !latestSofr) {
    return NextResponse.json({ error: 'Insufficient data' }, { status: 503 });
  }
  
  const strcPrice = parseFloat(strcQuote.price);
  const ratePct = parseFloat(latestRate.rate_pct);
  const sofrPct = parseFloat(latestSofr.sofr_1m_pct);
  const { lp, active: lpActive } = await computeLP(db);
  
  const snapshot: DashboardSnapshot = {
    strc_price:              strcPrice,
    strc_par_spread_bps:     Math.round((strcPrice - 100) * 100),
    strc_rate_pct:           ratePct,
    strc_rate_since_ipo_bps: Math.round((ratePct - 9.0) * 100),
    strc_effective_yield:    ratePct / strcPrice * 100,
    mnav:                    parseFloat(latestMetrics?.mnav ?? '0'),
    mnav_regime:             latestMetrics?.mnav_regime ?? 'unknown',
    mnav_30d_trend:          0,  // computed separately from daily_metrics history
    // ... all other fields
    sofr_1m_pct:             sofrPct,
    days_to_announcement:    daysToMonthEnd(),
    min_rate_next_month:     Math.max(sofrPct, ratePct - 0.25),
    lp_current:              lp,
    lp_formula_active:       lpActive,
    is_market_open:          isMarketOpen(),
    last_updated:            new Date().toISOString(),
    ...volumeStats,
  };
  
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' }
  });
}

function daysToMonthEnd(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.ceil((lastDay.getTime() - now.getTime()) / 86400000);
}
```

### 6.2 Cron Authentication Middleware

All cron routes must validate the `CRON_SECRET`:

```typescript
// src/lib/utils/cron-auth.ts
export function validateCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  // Vercel sends the secret as Bearer token when invoking cron routes
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// Usage in every cron route:
if (!validateCronSecret(request)) {
  return new Response('Unauthorized', { status: 401 });
}
```

**Note:** In `vercel.json`, Vercel automatically sends `CRON_SECRET` as `Authorization: Bearer {secret}` to cron routes. This must match the env variable value. If running cron routes locally via curl for testing, pass `-H "Authorization: Bearer your_secret"`.

### 6.3 SR1 Forward Curve (computed at request time)

```typescript
// src/lib/estimators/sofr-forward-model.ts

export async function fetchSofrForwardCurve(): Promise<Array<{ month_n: number; implied_sofr: number }>> {
  // Fetch SR1 SOFR futures contracts from FMP.
  // Contract codes: SR1H6 = Mar 2026, SR1M6 = Jun 2026, SR1U6 = Sep 2026, SR1Z6 = Dec 2026
  // Implied SOFR rate = 100 − futures_price  (e.g. price 95.70 → 4.30%)
  //
  // ⚠️ Do NOT use i * 3 for month_n — contract spacing relative to TODAY varies.
  //    Compute actual DTE for each contract and convert to fractional months.
  
  const contracts: { ticker: string; expiryDate: string }[] = [
    { ticker: 'SR1H6', expiryDate: '2026-03-16' },   // 3rd Monday of March 2026
    { ticker: 'SR1M6', expiryDate: '2026-06-15' },   // 3rd Monday of June 2026
    { ticker: 'SR1U6', expiryDate: '2026-09-21' },   // 3rd Monday of September 2026
    { ticker: 'SR1Z6', expiryDate: '2026-12-21' },   // 3rd Monday of December 2026
  ];
  
  const today = new Date();
  const results: Array<{ month_n: number; implied_sofr: number }> = [];
  
  for (const { ticker, expiryDate } of contracts) {
    try {
      const res = await fetchFmpQuote(ticker);
      if (res?.price && res.price > 0) {
        const dte = Math.max(0, Math.floor((new Date(expiryDate).getTime() - today.getTime()) / 86400000));
        const month_n = dte / 30.44;  // convert DTE to fractional months
        results.push({
          month_n: parseFloat(month_n.toFixed(1)),
          implied_sofr: parseFloat((100 - res.price).toFixed(4)),
        });
      }
    } catch { /* skip missing or expired contracts */ }
  }
  
  // Sort by month_n ascending
  results.sort((a, b) => a.month_n - b.month_n);
  
  // Interpolate to integer months 0–12
  return interpolateMonthly(results);
}

function interpolateMonthly(points: Array<{ month_n: number; implied_sofr: number }>) {
  const out = [];
  for (let m = 0; m <= 12; m++) {
    const exact = points.find(p => Math.round(p.month_n) === m);
    if (exact) { out.push({ month_n: m, implied_sofr: exact.implied_sofr }); continue; }
    
    // Linear interpolation between nearest surrounding points
    const lower = [...points].reverse().find(p => p.month_n < m);
    const upper = points.find(p => p.month_n > m);
    if (!lower || !upper) continue;
    
    const t = (m - lower.month_n) / (upper.month_n - lower.month_n);
    out.push({
      month_n: m,
      implied_sofr: parseFloat((lower.implied_sofr + t * (upper.implied_sofr - lower.implied_sofr)).toFixed(4)),
    });
  }
  return out;
}
```

---

## 7. Data Quality Rules

Rules enforced at the data layer. Violations are logged but do not crash the pipeline.

### 7.1 Schema Constraints (enforced in DB)

| Table | Field | Constraint |
|---|---|---|
| `price_history` | `price` | Must be > 0 |
| `strc_rate_history` | `rate_pct` | Must be between 0 and 50 |
| `btc_holdings` | `btc_count` | Must be > 0 |
| `daily_metrics` | `mnav` | Must be > 0 |
| `daily_metrics` | `btc_coverage_ratio` | Must be > 0 |
| `atm_issuance` | `proceeds_usd` | Must be > 0 |
| `sofr_history` | `sofr_1m_pct` | Must be between 0 and 20 |

Add these as `CHECK` constraints in the Drizzle schema:
```typescript
// In schema.ts, for btc_holdings:
btc_count: numeric('btc_count', { precision: 14, scale: 3 })
  .notNull()
  .$check(sql`btc_count > 0`),
```

### 7.2 Stale Data Detection

The snapshot route should include staleness signals in the response:

```typescript
// Append to DashboardSnapshot
stale_flags: {
  btc_price:    minutesSince(btcSpot.fetchedAt) > 5,     // CoinGecko > 5min
  strc_price:   !isMarketOpen() ? false : minutesSince(strcQuote.ts) > 5,
  sofr:         daysSince(latestSofr.date) > 3,           // FRED > 3 days old
  btc_holdings: daysSince(latestBtc.report_date) > 10,   // no 8-K in 10 days
  metrics:      daysSince(latestMetrics.date) > 2,        // daily cron > 2 days
}
```

Frontend: when any `stale_flags` field is `true`, show amber dot on that KPI card.

### 7.3 Null / Missing Data Display Rules

Never show `0` for a value that is missing — that is a false signal. Rules:

| Situation | Display |
|---|---|
| Rate for a month not yet confirmed | Show last confirmed rate with amber `Est.` badge |
| BTC holdings stale > 7 days | Show value with `~` prefix + amber badge |
| Daily metrics not computed today | Show yesterday's metrics with `[Yesterday]` timestamp |
| Volume not available for today | Show `—` in KPI, not `0` |
| Deribit options chain unavailable | Show empty chain with "Deribit unavailable" state, MSTR chain still functional |
| FMP options data > 20 min old | Show amber "Data delayed" banner; still show last fetched data |

### 7.4 Forward-Fill Rules for Charts

Rate history chart and SOFR chart: use forward-fill for gaps (weekends, holidays, unconfirmed months). Never interpolate — forward-fill preserves the true step-function nature of the rate.

Price history chart: no forward-fill on weekends/holidays — simply don't render data points for non-trading days. Chart.js will connect the lines across gaps correctly.

Correlation/vol charts: forward-fill from `daily_metrics` — no data means the cron didn't run that day. Forward-fill maximum 5 days; beyond that show a gap to indicate data quality issue.

---

## 8. First-Deploy Checklist

Execute in this exact order. Each step depends on the previous.

```
PRE-DEPLOY: ACCESS CONTROL
──────────────────────────
□ 0a. Confirm strc.finance is active in Cloudflare (registered ✓)
□ 0b. Configure Cloudflare Zero Trust — full instructions in Section 9
       (complete Steps 9.1–9.4 before first Vercel deploy)
       → You will need the production URL from step below before completing 9.2

ENVIRONMENT SETUP
─────────────────
□ 1. Create Neon project named 'strc-dashboard' (new project — isolated from dimetrics)
     → US East Ohio region (matches Vercel default, minimizes latency)
□ 2. Copy NEON_DATABASE_URL (pooled) and NEON_DATABASE_DIRECT_URL (direct)
□ 3. Add FMP_API_KEY (paid plan — verify options endpoint access with test call)
□ 4. Add FRED_API_KEY (free — register at fred.stlouisfed.org/docs/api/api_key.html)
□ 5. Generate CRON_SECRET: openssl rand -hex 32
□ 6. Add all env vars to .env.local (local) and Vercel dashboard (production)
□ 7. Add NEON_DATABASE_DIRECT_URL, FMP_API_KEY, and FRED_API_KEY as GitHub repo secrets
     in beezycreations/strc-dashboard → Settings → Secrets → Actions

DATABASE SETUP
──────────────
□ 8.  Run migration: npx drizzle-kit push
□ 9.  Verify all 10 tables created (see Phase 1 Section 11.2)
□ 10. Seed ATM calibration defaults: INSERT into atm_calibration_params
      (MSTR: 0.02/0.06/0.04) and (STRC/STRF/STRK/STRD: 0.10/0.30/0.20)

HISTORICAL DATA BACKFILL (via GitHub Actions — run in this order)
─────────────────────────
□ 11. Run: edgar-full-scan
      → Wait for completion (~10–15 min for full 8-K archive)
      → Check edgar_filings table: all 8-Ks since 2025-07-29 should be marked processed

□ 12. Run: rate-history-reconstruction
      → Inspect reconciliation report output
      → Verify these 4 confirmed entries exist in strc_rate_history:
          2025-07-29 → 9.00%  ✓
          2025-11-01 → 10.50% ✓
          2026-01-01 → 11.25% ✓
          2026-02-01 → 11.25% ✓
      → For any gap months, manually check businesswire.com for press releases
      → Insert any manually found rates with is_confirmed=true

□ 13. Run: price-backfill
      → Verify price_history has rows for all 5 equity tickers + BTC since 2025-07-29
      → Spot check: STRC close on 2025-07-29 should be ≈ $90 (IPO price range)

□ 14. Run: atm-calibration
      → Verify atm_calibration_params updated for STRC (should reflect 7 confirmed events)

□ 15. Manually run daily-metrics cron once to seed daily_metrics from backfilled prices:
      curl -X GET https://your-app.vercel.app/api/cron/daily-metrics \
           -H "Authorization: Bearer $CRON_SECRET"
      → Verify daily_metrics has rows from 2025-07-29 to today

□ 16. Run SOFR cron once to seed sofr_history:
      curl -X GET https://your-app.vercel.app/api/cron/sofr \
           -H "Authorization: Bearer $CRON_SECRET"

PRODUCTION VERIFICATION
───────────────────────
□ 17. Add strc.finance domain to Vercel project:
      Vercel → project → Settings → Domains → Add → strc.finance
      Cloudflare will auto-configure the DNS records (same registrar + proxy)
□ 18. Complete Zero Trust Step 9.5 (middleware) — requires production domain confirmed in Vercel
□ 19. Smoke-test auth gate: open strc.finance in incognito → should see Cloudflare OTP screen
      (NOT the dashboard — if dashboard loads without OTP, Zero Trust policy is misconfigured)
□ 20. Call /api/data/snapshot — verify no 503, all fields populated
□ 21. Call /api/data/history?range=all — verify price, rate, SOFR arrays populated
□ 22. Call /api/data/volume-atm — verify volume_history array has data, atm_events shows 7 events
□ 23. Call /api/data/options?asset=mstr&expiry=30d — verify chain rows returned
□ 24. Load dashboard in browser (after OTP auth) — verify:
        Overview KPI strip: all 6 values populated (no dashes)
        Price chart: shows data from Jul 2025, dividend flags visible at month-ends
        Volume tracker: chart renders with all 4 datasets, ATM event log shows 7 events
        Rate Engine: rate history chart shows confirmed (solid) vs. estimated (faded) bars
        Position Modes: options chain loads, clicking a row triggers calculator
□ 25. Enable Vercel cron jobs — verify in Vercel dashboard that all 4 crons are scheduled
□ 26. Wait 1 hour and re-check /api/data/snapshot last_updated field — should advance
□ 27. Check Vercel Function Logs for any cron errors from first scheduled runs
```

---

## 9. Access Control — Cloudflare Zero Trust

**Strategy:** Cloudflare Zero Trust Access sits between the internet and Vercel. Every request to `strc.finance` passes through Cloudflare's auth gate before reaching the application. The dashboard never handles credentials directly — Cloudflare owns authentication completely.

**Why this over in-app auth:**
- `strc.finance` is already on Cloudflare Registrar → DNS is natively managed here, no additional setup
- Zero Trust free tier covers 50 users — well above the 6–20 target
- Per-user email OTP — each person authenticates individually, sessions are individual, revocation is immediate
- Full audit log of who accessed what and when, built into Cloudflare dashboard
- Zero Phase 4 build time for auth — only the middleware file (Step 9.5) touches the codebase

---

### 9.1 Enable Zero Trust

```
1. dash.cloudflare.com → your account → Zero Trust (left sidebar)
2. Create organization: team name = strc  (this sets your auth domain: strc.cloudflareaccess.com)
3. Select plan: Free  (no credit card required for ≤50 users)
```

---

### 9.2 Create the Access Application

```
Zero Trust → Access → Applications → Add an Application → Self-hosted

Application name:     STRC Dashboard
Session duration:     24 hours          ← users re-auth once per day
Subdomain:            (leave blank)     ← using apex domain, not subdomain
Domain:               strc.finance
```

Under **Application appearance:**
```
Logo URL:       (optional — leave blank for now)
App launcher:   (leave disabled)
```

Click **Next**.

---

### 9.3 Define the Access Policy

```
Policy name:    Approved Users
Action:         Allow
Selector:       Emails
Value:          (enter each approved email on a new line)
```

**Initial approved list — add each person's email:**
```
your@email.com
person2@email.com
person3@email.com
...
```

One email per entry. Click **Save policy** → **Next** → **Add application**.

**Adding a user later:**
```
Zero Trust → Access → Applications → STRC Dashboard → Edit
→ Policy → Approved Users → Add entry → their email → Save
```
Access is immediate — no invite required, just tell them to go to `strc.finance`.

**Revoking a user:**
```
Zero Trust → Access → Applications → STRC Dashboard → Edit
→ Policy → Approved Users → delete their email → Save
```
Active sessions expire within 1 minute of removal. Their next request returns the Cloudflare auth gate.

---

### 9.4 Set the Login Method

```
Zero Trust → Settings → Authentication → Login methods
```

**One-time PIN** is enabled by default — this is correct. Each user experience:

1. Navigates to `strc.finance`
2. Cloudflare intercepts — shows branded "Enter your email" screen (hosted by Cloudflare, not your app)
3. User receives a 6-digit OTP to their email (expires in 10 minutes)
4. Enters OTP → receives a session cookie valid for 24 hours
5. All subsequent requests within the session pass straight through to the dashboard

No passwords. No accounts to create. No password reset flows. Users just need access to their email.

---

### 9.5 Middleware — Lock Vercel to Cloudflare Only

**Critical:** Without this, anyone who discovers the raw `*.vercel.app` URL bypasses Cloudflare Access entirely and reaches the dashboard unauthenticated.

**File:** `src/middleware.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cloudflare Access JWT audience tag — find this in:
// Zero Trust → Access → Applications → STRC Dashboard → Overview → Application Audience Tag
const CF_AUD = process.env.CF_ACCESS_AUD ?? '';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';

  // Block direct Vercel URL access — redirect to production domain
  // Prevents auth bypass via the raw *.vercel.app URL
  if (host.endsWith('.vercel.app')) {
    return NextResponse.redirect('https://strc.finance' + request.nextUrl.pathname, {
      status: 301,
    });
  }

  // In production, verify Cloudflare Access JWT is present
  // CF Access injects this header on every authenticated request
  // Its absence means the request did not pass through Zero Trust
  if (process.env.NODE_ENV === 'production') {
    const cfJwt = request.headers.get('cf-access-jwt-assertion');
    if (!cfJwt) {
      // No CF JWT — block with 401. In practice this should never happen
      // for browser traffic (CF Access intercepts first), but guards against
      // direct API calls that bypass the Cloudflare proxy.
      return NextResponse.json(
        { error: 'Unauthorized — access via strc.finance only' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  // Apply middleware to all routes except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
```

**Environment variable to add:**
```bash
# .env.local and Vercel dashboard
CF_ACCESS_AUD=your_audience_tag_here
```

Find the Audience Tag at: Zero Trust → Access → Applications → STRC Dashboard → Overview → **Application Audience Tag** (long hex string).

**Also in Vercel:** Settings → Domains → remove the auto-generated `strc-dashboard.vercel.app` domain or set it to redirect to `strc.finance`. This is a belt-and-suspenders measure alongside the middleware.

---

### 9.6 Audit Log

```
Zero Trust → Logs → Access → filter by Application: STRC Dashboard
```

Each row shows:
- User email
- Login timestamp
- IP address + country
- Action: Allowed / Blocked
- Auth method: OTP

Export as CSV if needed. Logs are retained for 30 days on the free tier.

---

### 9.7 User Reference Card

Send this to each person you onboard:

```
STRC Dashboard — Access Instructions

URL:     https://strc.finance
Access:  Email-based — no password required

To log in:
  1. Go to strc.finance
  2. Enter your email address at the prompt
  3. Check your inbox for a 6-digit code (arrives within ~30 seconds)
  4. Enter the code — you're in for 24 hours

After 24 hours your session expires and you'll be prompted to re-authenticate.
If you have any access issues, contact [your contact info].
```

---

*End of Phase 3 Document v1.2 — STRC Intelligence Platform*  
*Preceding documents: `strc_platform_phase1.md` (schema, formulas, architecture), `strc_platform_phase2_v2.md` (wireframe spec v2.2)*  
*Next: Phase 4 — Build (Claude Code implementation per Section 12.1 build order)*  
*Repo: `beezycreations/strc-dashboard` | Domain: `strc.finance`*
