-- Failed-call auditing, asynchronous anomaly status, and reservation accuracy.
-- Additive only: no existing column is changed or dropped.

-- 1. Reservation accuracy on the spend ledger
ALTER TABLE "requests" ADD COLUMN "reserved_cost_usd" DECIMAL(10,6);
ALTER TABLE "requests" ADD COLUMN "reservation_overrun_usd" DECIMAL(10,6) NOT NULL DEFAULT 0;

-- 2. Anomaly evaluation state. New rows start PENDING (not evaluated yet); it must never read as "clear".
ALTER TABLE "requests" ADD COLUMN "anomaly_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "requests" ADD COLUMN "anomaly_evaluated_at" TIMESTAMP(3);

-- Existing rows were evaluated synchronously by the old gateway, so their state is known.
-- (One pass over `requests`; run in a low-traffic window on a very large ledger.)
UPDATE "requests"
SET "anomaly_status" = CASE
      WHEN "is_blocked" THEN 'SKIPPED'
      WHEN "is_anomaly" THEN 'ANOMALY'
      ELSE 'CLEAR'
    END,
    "anomaly_evaluated_at" = "created_at";

CREATE INDEX "requests_anomaly_status_created_at_idx" ON "requests"("anomaly_status", "created_at");

-- 3. Failed gateway calls. Never carries spend, prompts, credentials or raw provider bodies.
CREATE TABLE "request_attempts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "gateway_key_id" TEXT,
    "user_id" TEXT,
    "provider" "ProviderType" NOT NULL,
    "model" TEXT NOT NULL,
    "error_class" TEXT NOT NULL,
    "http_status" INTEGER NOT NULL,
    "upstream_status" INTEGER,
    "upstream_code" TEXT,
    "estimated_cost_usd" DECIMAL(10,6) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "request_attempts_org_id_created_at_idx" ON "request_attempts"("org_id", "created_at");
CREATE INDEX "request_attempts_project_id_created_at_idx" ON "request_attempts"("project_id", "created_at");
CREATE INDEX "request_attempts_gateway_key_id_created_at_idx" ON "request_attempts"("gateway_key_id", "created_at");
CREATE INDEX "request_attempts_error_class_idx" ON "request_attempts"("error_class");

ALTER TABLE "request_attempts" ADD CONSTRAINT "request_attempts_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
