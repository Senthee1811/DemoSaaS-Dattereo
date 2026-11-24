-- Additive. Existing rows keep NULL ("not recorded"); nothing is backfilled with a guess.
ALTER TABLE "requests"
  ADD COLUMN "usage_status" VARCHAR(16),
  ADD COLUMN "estimated_input_tokens" INTEGER,
  ADD COLUMN "reserved_input_tokens" INTEGER,
  ADD COLUMN "reserved_output_tokens" INTEGER,
  ADD COLUMN "estimator_version" VARCHAR(32);

ALTER TABLE "request_attempts"
  ADD COLUMN "execution_status" VARCHAR(24),
  ADD COLUMN "billing_status" VARCHAR(16),
  ADD COLUMN "reconciled_status" VARCHAR(24),
  ADD COLUMN "reconciled_cost_usd" DECIMAL(10,6),
  ADD COLUMN "reconciled_by_id" TEXT,
  ADD COLUMN "reconciled_at" TIMESTAMP(3),
  ADD COLUMN "reconciled_note" VARCHAR(300);

CREATE INDEX "request_attempts_org_id_billing_status_reconciled_status_idx" ON "request_attempts"("org_id", "billing_status", "reconciled_status");
