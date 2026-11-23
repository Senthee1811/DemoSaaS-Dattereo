-- Alert delivery tracking. status was defaulting to 'SENT' even though nothing was
-- delivered; it now only reaches SENT/FAILED through the alert-delivery worker.
ALTER TABLE "budget_alerts" ADD COLUMN "delivered_at" TIMESTAMP(3);
ALTER TABLE "budget_alerts" ADD COLUMN "delivery_error" TEXT;
ALTER TABLE "budget_alerts" ALTER COLUMN "status" SET DEFAULT 'IN_APP';

-- Nothing was ever delivered to an external channel before this migration, so no
-- existing row may claim it was.
UPDATE "budget_alerts" SET "status" = 'IN_APP' WHERE "status" IN ('SENT', 'RECORDED');
