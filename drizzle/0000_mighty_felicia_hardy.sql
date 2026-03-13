CREATE TABLE "accrued_dividends" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount_per_share" numeric(10, 6),
	"paid" boolean DEFAULT false,
	"payment_date" date,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "atm_calibration_params" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"participation_rate_low" numeric(8, 4),
	"participation_rate_high" numeric(8, 4),
	"participation_rate_current" numeric(8, 4),
	"sample_count" integer DEFAULT 0,
	"last_calibrated_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "atm_calibration_params_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "atm_issuance" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_date" date NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"shares_issued" integer,
	"proceeds_usd" numeric(20, 2),
	"avg_price" numeric(18, 6),
	"is_estimated" boolean DEFAULT false,
	"confidence" numeric(4, 3) DEFAULT '1.0',
	"source" varchar(200),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_atm_issuance_ticker_report_date" UNIQUE("ticker","report_date")
);
--> statement-breakpoint
CREATE TABLE "btc_holdings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_date" date NOT NULL,
	"btc_count" integer NOT NULL,
	"avg_cost_usd" numeric(18, 2),
	"total_cost_usd" numeric(20, 2),
	"is_estimated" boolean DEFAULT false,
	"confidence" numeric(4, 3) DEFAULT '1.0',
	"source" varchar(200),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "btc_holdings_report_date_unique" UNIQUE("report_date")
);
--> statement-breakpoint
CREATE TABLE "capital_structure_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_date" date NOT NULL,
	"converts_outstanding_usd" numeric(20, 2),
	"strf_outstanding_usd" numeric(20, 2),
	"strc_outstanding_usd" numeric(20, 2),
	"strk_outstanding_usd" numeric(20, 2),
	"strd_outstanding_usd" numeric(20, 2),
	"mstr_shares_outstanding" bigint,
	"mstr_market_cap_usd" numeric(20, 2),
	"usd_reserve_usd" numeric(20, 2),
	"total_annual_obligations" numeric(20, 2),
	"strc_atm_authorized_usd" numeric(20, 2),
	"strc_atm_deployed_usd" numeric(20, 2),
	"mstr_atm_authorized_usd" numeric(20, 2),
	"mstr_atm_deployed_usd" numeric(20, 2),
	"source" varchar(200),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "capital_structure_snapshots_snapshot_date_unique" UNIQUE("snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"mnav" numeric(8, 4),
	"mnav_low" numeric(8, 4),
	"mnav_high" numeric(8, 4),
	"mnav_regime" varchar(20),
	"btc_coverage_ratio" numeric(8, 4),
	"strc_impairment_btc_price" numeric(18, 2),
	"usd_reserve_months" numeric(6, 2),
	"vol_30d_strc" numeric(8, 4),
	"vol_90d_strc" numeric(8, 4),
	"vol_ratio_strc" numeric(8, 4),
	"vol_30d_mstr" numeric(8, 4),
	"vol_90d_mstr" numeric(8, 4),
	"vol_30d_btc" numeric(8, 4),
	"vol_90d_btc" numeric(8, 4),
	"vol_30d_strf" numeric(8, 4),
	"vol_90d_strf" numeric(8, 4),
	"vol_30d_strk" numeric(8, 4),
	"vol_90d_strk" numeric(8, 4),
	"vol_30d_strd" numeric(8, 4),
	"vol_90d_strd" numeric(8, 4),
	"beta_strc_btc_30d" numeric(8, 4),
	"beta_strc_btc_90d" numeric(8, 4),
	"beta_strc_mstr_30d" numeric(8, 4),
	"beta_strc_mstr_90d" numeric(8, 4),
	"beta_strf_btc_30d" numeric(8, 4),
	"beta_strf_mstr_30d" numeric(8, 4),
	"beta_strk_btc_30d" numeric(8, 4),
	"beta_strk_mstr_30d" numeric(8, 4),
	"beta_strd_btc_30d" numeric(8, 4),
	"beta_strd_mstr_30d" numeric(8, 4),
	"corr_strc_mstr_30d" numeric(8, 4),
	"corr_strc_mstr_90d" numeric(8, 4),
	"corr_strc_btc_30d" numeric(8, 4),
	"corr_strc_btc_90d" numeric(8, 4),
	"mstr_iv_30d" numeric(8, 4),
	"mstr_iv_60d" numeric(8, 4),
	"mstr_iv_percentile_252d" numeric(8, 4),
	"est_config_a" numeric(8, 4),
	"est_config_b" numeric(8, 4),
	"est_config_c" numeric(8, 4),
	"strc_effective_yield" numeric(8, 4),
	"strc_par_spread_bps" numeric(8, 2),
	"corr_strc_spy_30d" numeric(8, 4),
	"sharpe_ratio_strc" numeric(8, 4),
	"vol_1y_strc" numeric(8, 4),
	"strc_vwap_1m" numeric(18, 6),
	"strc_notional_usd" numeric(20, 2),
	"strc_market_cap_usd" numeric(20, 2),
	"strc_trading_volume_usd" numeric(20, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "daily_metrics_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "edgar_filings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"accession_no" varchar(30) NOT NULL,
	"filing_date" date NOT NULL,
	"form_type" varchar(10),
	"processed" boolean DEFAULT false,
	"processing_notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "edgar_filings_accession_no_unique" UNIQUE("accession_no")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	"volume" numeric(20, 2),
	"source" varchar(20),
	"is_eod" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_price_history_ticker_ts_source" UNIQUE("ticker","ts","source")
);
--> statement-breakpoint
CREATE TABLE "sofr_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"sofr_1m_pct" numeric(6, 4) NOT NULL,
	"source" varchar(50),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sofr_history_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "strc_rate_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"effective_date" date NOT NULL,
	"rate_pct" numeric(6, 4) NOT NULL,
	"announced_date" date,
	"is_confirmed" boolean DEFAULT false,
	"source" varchar(200),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_strc_rate_history_effective_date" UNIQUE("effective_date")
);
--> statement-breakpoint
CREATE INDEX "idx_price_history_ticker_ts" ON "price_history" USING btree ("ticker","ts" DESC);