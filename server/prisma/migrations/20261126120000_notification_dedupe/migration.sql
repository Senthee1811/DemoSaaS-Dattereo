-- Additive: duplicate-destination detection and atomic in-app delivery
ALTER TABLE "notification_channels" ADD COLUMN "destination_hash" TEXT;
CREATE INDEX "notification_channels_org_id_destination_hash_idx" ON "notification_channels"("org_id", "destination_hash");
ALTER TABLE "notification_deliveries" ADD COLUMN "in_app_key" TEXT;
CREATE UNIQUE INDEX "notification_deliveries_in_app_key_key" ON "notification_deliveries"("in_app_key");
