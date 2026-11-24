-- Additive. Derived data only: `requests` remains the source of truth and this can be dropped and rebuilt.
CREATE TABLE "request_daily_rollups" (
    "org_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "gateway_key_id" TEXT NOT NULL DEFAULT '',
    "application" TEXT NOT NULL DEFAULT '',
    "team" TEXT NOT NULL DEFAULT '',
    "requests" INTEGER NOT NULL,
    "tokens_in" BIGINT NOT NULL,
    "tokens_out" BIGINT NOT NULL,
    "cached_tokens_in" BIGINT NOT NULL,
    "cached_known_rows" INTEGER NOT NULL,
    "cost_usd" DECIMAL(18,6) NOT NULL,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_daily_rollups_pkey" PRIMARY KEY ("project_id","day","provider","model","gateway_key_id","application","team")
);

CREATE INDEX "request_daily_rollups_org_id_day_idx" ON "request_daily_rollups"("org_id", "day");

CREATE TABLE "rollup_state" (
    "key" TEXT NOT NULL,
    "complete_through" DATE,
    "last_build_at" TIMESTAMP(3),
    "last_reconcile_at" TIMESTAMP(3),
    "last_discrepancies" INTEGER NOT NULL DEFAULT 0,
    "last_repaired_days" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rollup_state_pkey" PRIMARY KEY ("key")
);
