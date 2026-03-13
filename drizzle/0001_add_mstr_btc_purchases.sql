CREATE TABLE IF NOT EXISTS "mstr_btc_purchases" (
  "id" bigserial PRIMARY KEY,
  "purchase_number" integer NOT NULL,
  "report_date" date NOT NULL,
  "btc_acquired" integer NOT NULL,
  "avg_btc_cost" numeric(18, 2) NOT NULL,
  "acquisition_cost_usd" numeric(20, 2) NOT NULL,
  "cumulative_btc" integer NOT NULL,
  "adso_thousands" integer,
  "source" varchar(200) DEFAULT '8-K',
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_mstr_btc_purchases_number" ON "mstr_btc_purchases" ("purchase_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_mstr_btc_purchases_date" ON "mstr_btc_purchases" ("report_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mstr_btc_purchases_date" ON "mstr_btc_purchases" ("report_date");
