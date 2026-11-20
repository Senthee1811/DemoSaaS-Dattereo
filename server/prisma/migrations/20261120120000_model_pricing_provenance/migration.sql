-- Provenance and staleness tracking for the shared model pricing table.
ALTER TABLE "model_pricing"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "price_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "provider_status" TEXT,
  ADD COLUMN "provider_checked_at" TIMESTAMP(3),
  ADD COLUMN "retires_at" TIMESTAMP(3);
