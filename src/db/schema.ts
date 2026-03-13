import {
  pgTable,
  bigserial,
  varchar,
  timestamp,
  numeric,
  boolean,
  date,
  integer,
  bigint,
  text,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// price_history
// ---------------------------------------------------------------------------
export const priceHistory = pgTable(
  "price_history",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    ticker: varchar({ length: 10 }).notNull(),
    ts: timestamp({ withTimezone: true }).notNull(),
    price: numeric({ precision: 18, scale: 6 }).notNull(),
    volume: numeric({ precision: 20, scale: 2 }),
    source: varchar({ length: 20 }),
    isEod: boolean("is_eod").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_price_history_ticker_ts").on(t.ticker, sql`${t.ts} DESC`),
    unique("uq_price_history_ticker_ts_source").on(t.ticker, t.ts, t.source),
  ],
);

// ---------------------------------------------------------------------------
// strc_rate_history
// ---------------------------------------------------------------------------
export const strcRateHistory = pgTable(
  "strc_rate_history",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    effectiveDate: date("effective_date").notNull(),
    ratePct: numeric("rate_pct", { precision: 6, scale: 4 }).notNull(),
    announcedDate: date("announced_date"),
    isConfirmed: boolean("is_confirmed").default(false),
    source: varchar({ length: 200 }),
    notes: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("uq_strc_rate_history_effective_date").on(t.effectiveDate),
  ],
);

// ---------------------------------------------------------------------------
// sofr_history
// ---------------------------------------------------------------------------
export const sofrHistory = pgTable(
  "sofr_history",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    date: date().notNull().unique(),
    sofr1mPct: numeric("sofr_1m_pct", { precision: 6, scale: 4 }).notNull(),
    source: varchar({ length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// btc_holdings
// ---------------------------------------------------------------------------
export const btcHoldings = pgTable(
  "btc_holdings",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    reportDate: date("report_date").notNull().unique(),
    btcCount: integer("btc_count").notNull(),
    avgCostUsd: numeric("avg_cost_usd", { precision: 18, scale: 2 }),
    totalCostUsd: numeric("total_cost_usd", { precision: 20, scale: 2 }),
    isEstimated: boolean("is_estimated").default(false),
    confidence: numeric({ precision: 4, scale: 3 }).default("1.0"),
    source: varchar({ length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// capital_structure_snapshots
// ---------------------------------------------------------------------------
export const capitalStructureSnapshots = pgTable(
  "capital_structure_snapshots",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    snapshotDate: date("snapshot_date").notNull().unique(),
    convertsOutstandingUsd: numeric("converts_outstanding_usd", { precision: 20, scale: 2 }),
    strfOutstandingUsd: numeric("strf_outstanding_usd", { precision: 20, scale: 2 }),
    strcOutstandingUsd: numeric("strc_outstanding_usd", { precision: 20, scale: 2 }),
    strkOutstandingUsd: numeric("strk_outstanding_usd", { precision: 20, scale: 2 }),
    strdOutstandingUsd: numeric("strd_outstanding_usd", { precision: 20, scale: 2 }),
    mstrSharesOutstanding: bigint("mstr_shares_outstanding", { mode: "bigint" }),
    mstrMarketCapUsd: numeric("mstr_market_cap_usd", { precision: 20, scale: 2 }),
    usdReserveUsd: numeric("usd_reserve_usd", { precision: 20, scale: 2 }),
    totalAnnualObligations: numeric("total_annual_obligations", { precision: 20, scale: 2 }),
    strcAtmAuthorizedUsd: numeric("strc_atm_authorized_usd", { precision: 20, scale: 2 }),
    strcAtmDeployedUsd: numeric("strc_atm_deployed_usd", { precision: 20, scale: 2 }),
    mstrAtmAuthorizedUsd: numeric("mstr_atm_authorized_usd", { precision: 20, scale: 2 }),
    mstrAtmDeployedUsd: numeric("mstr_atm_deployed_usd", { precision: 20, scale: 2 }),
    source: varchar({ length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// atm_issuance
// ---------------------------------------------------------------------------
export const atmIssuance = pgTable(
  "atm_issuance",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    reportDate: date("report_date").notNull(),
    ticker: varchar({ length: 10 }).notNull(),
    sharesIssued: integer("shares_issued"),
    proceedsUsd: numeric("proceeds_usd", { precision: 20, scale: 2 }),
    avgPrice: numeric("avg_price", { precision: 18, scale: 6 }),
    isEstimated: boolean("is_estimated").default(false),
    confidence: numeric({ precision: 4, scale: 3 }).default("1.0"),
    source: varchar({ length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("uq_atm_issuance_ticker_report_date").on(t.ticker, t.reportDate),
  ],
);

// ---------------------------------------------------------------------------
// daily_metrics
// ---------------------------------------------------------------------------
export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    date: date().notNull().unique(),

    // mNAV
    mnav: numeric({ precision: 8, scale: 4 }),
    mnavLow: numeric("mnav_low", { precision: 8, scale: 4 }),
    mnavHigh: numeric("mnav_high", { precision: 8, scale: 4 }),
    mnavRegime: varchar("mnav_regime", { length: 20 }),

    // Coverage & impairment
    btcCoverageRatio: numeric("btc_coverage_ratio", { precision: 8, scale: 4 }),
    strcImpairmentBtcPrice: numeric("strc_impairment_btc_price", { precision: 18, scale: 2 }),
    usdReserveMonths: numeric("usd_reserve_months", { precision: 6, scale: 2 }),

    // Volatility — STRC
    vol30dStrc: numeric("vol_30d_strc", { precision: 8, scale: 4 }),
    vol90dStrc: numeric("vol_90d_strc", { precision: 8, scale: 4 }),
    volRatioStrc: numeric("vol_ratio_strc", { precision: 8, scale: 4 }),

    // Volatility — MSTR
    vol30dMstr: numeric("vol_30d_mstr", { precision: 8, scale: 4 }),
    vol90dMstr: numeric("vol_90d_mstr", { precision: 8, scale: 4 }),

    // Volatility — BTC
    vol30dBtc: numeric("vol_30d_btc", { precision: 8, scale: 4 }),
    vol90dBtc: numeric("vol_90d_btc", { precision: 8, scale: 4 }),

    // Volatility — STRF
    vol30dStrf: numeric("vol_30d_strf", { precision: 8, scale: 4 }),
    vol90dStrf: numeric("vol_90d_strf", { precision: 8, scale: 4 }),

    // Volatility — STRK
    vol30dStrk: numeric("vol_30d_strk", { precision: 8, scale: 4 }),
    vol90dStrk: numeric("vol_90d_strk", { precision: 8, scale: 4 }),

    // Volatility — STRD
    vol30dStrd: numeric("vol_30d_strd", { precision: 8, scale: 4 }),
    vol90dStrd: numeric("vol_90d_strd", { precision: 8, scale: 4 }),

    // Beta — STRC
    betaStrcBtc30d: numeric("beta_strc_btc_30d", { precision: 8, scale: 4 }),
    betaStrcBtc90d: numeric("beta_strc_btc_90d", { precision: 8, scale: 4 }),
    betaStrcMstr30d: numeric("beta_strc_mstr_30d", { precision: 8, scale: 4 }),
    betaStrcMstr90d: numeric("beta_strc_mstr_90d", { precision: 8, scale: 4 }),

    // Beta — STRF
    betaStrfBtc30d: numeric("beta_strf_btc_30d", { precision: 8, scale: 4 }),
    betaStrfMstr30d: numeric("beta_strf_mstr_30d", { precision: 8, scale: 4 }),

    // Beta — STRK
    betaStrkBtc30d: numeric("beta_strk_btc_30d", { precision: 8, scale: 4 }),
    betaStrkMstr30d: numeric("beta_strk_mstr_30d", { precision: 8, scale: 4 }),

    // Beta — STRD
    betaStrdBtc30d: numeric("beta_strd_btc_30d", { precision: 8, scale: 4 }),
    betaStrdMstr30d: numeric("beta_strd_mstr_30d", { precision: 8, scale: 4 }),

    // Correlation — STRC
    corrStrcMstr30d: numeric("corr_strc_mstr_30d", { precision: 8, scale: 4 }),
    corrStrcMstr90d: numeric("corr_strc_mstr_90d", { precision: 8, scale: 4 }),
    corrStrcBtc30d: numeric("corr_strc_btc_30d", { precision: 8, scale: 4 }),
    corrStrcBtc90d: numeric("corr_strc_btc_90d", { precision: 8, scale: 4 }),

    // MSTR implied vol
    mstrIv30d: numeric("mstr_iv_30d", { precision: 8, scale: 4 }),
    mstrIv60d: numeric("mstr_iv_60d", { precision: 8, scale: 4 }),
    mstrIvPercentile252d: numeric("mstr_iv_percentile_252d", { precision: 8, scale: 4 }),

    // Estimation config
    estConfigA: numeric("est_config_a", { precision: 8, scale: 4 }),
    estConfigB: numeric("est_config_b", { precision: 8, scale: 4 }),
    estConfigC: numeric("est_config_c", { precision: 8, scale: 4 }),

    // Yield & spread
    strcEffectiveYield: numeric("strc_effective_yield", { precision: 8, scale: 4 }),
    strcParSpreadBps: numeric("strc_par_spread_bps", { precision: 8, scale: 2 }),

    // Correlation — STRC vs SPY
    corrStrcSpy30d: numeric("corr_strc_spy_30d", { precision: 8, scale: 4 }),

    // Sharpe ratio — STRC
    sharpeRatioStrc: numeric("sharpe_ratio_strc", { precision: 8, scale: 4 }),

    // 1Y realized vol — STRC
    vol1yStrc: numeric("vol_1y_strc", { precision: 8, scale: 4 }),

    // STRC market data
    strcVwap1m: numeric("strc_vwap_1m", { precision: 18, scale: 6 }),
    strcNotionalUsd: numeric("strc_notional_usd", { precision: 20, scale: 2 }),
    strcMarketCapUsd: numeric("strc_market_cap_usd", { precision: 20, scale: 2 }),
    strcTradingVolumeUsd: numeric("strc_trading_volume_usd", { precision: 20, scale: 2 }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// edgar_filings
// ---------------------------------------------------------------------------
export const edgarFilings = pgTable(
  "edgar_filings",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    accessionNo: varchar("accession_no", { length: 30 }).notNull().unique(),
    filingDate: date("filing_date").notNull(),
    formType: varchar("form_type", { length: 10 }),
    processed: boolean().default(false),
    processingNotes: text("processing_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// atm_calibration_params
// ---------------------------------------------------------------------------
export const atmCalibrationParams = pgTable(
  "atm_calibration_params",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    ticker: varchar({ length: 10 }).notNull().unique(),
    participationRateLow: numeric("participation_rate_low", { precision: 8, scale: 4 }),
    participationRateHigh: numeric("participation_rate_high", { precision: 8, scale: 4 }),
    participationRateCurrent: numeric("participation_rate_current", { precision: 8, scale: 4 }),
    sampleCount: integer("sample_count").default(0),
    lastCalibratedDate: date("last_calibrated_date"),
    notes: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// mstr_btc_purchases — Strategy's confirmed BTC acquisitions from 8-K filings
// ---------------------------------------------------------------------------
export const mstrBtcPurchases = pgTable(
  "mstr_btc_purchases",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    purchaseNumber: integer("purchase_number").notNull(),
    reportDate: date("report_date").notNull(),
    btcAcquired: integer("btc_acquired").notNull(),
    avgBtcCost: numeric("avg_btc_cost", { precision: 18, scale: 2 }).notNull(),
    acquisitionCostUsd: numeric("acquisition_cost_usd", { precision: 20, scale: 2 }).notNull(),
    cumulativeBtc: integer("cumulative_btc").notNull(),
    adsoThousands: integer("adso_thousands"),
    source: varchar({ length: 200 }).default("8-K"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("uq_mstr_btc_purchases_number").on(t.purchaseNumber),
    unique("uq_mstr_btc_purchases_date").on(t.reportDate),
    index("idx_mstr_btc_purchases_date").on(t.reportDate),
  ],
);

// ---------------------------------------------------------------------------
// accrued_dividends
// ---------------------------------------------------------------------------
export const accruedDividends = pgTable(
  "accrued_dividends",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    ticker: varchar({ length: 10 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    amountPerShare: numeric("amount_per_share", { precision: 10, scale: 6 }),
    paid: boolean().default(false),
    paymentDate: date("payment_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
);
