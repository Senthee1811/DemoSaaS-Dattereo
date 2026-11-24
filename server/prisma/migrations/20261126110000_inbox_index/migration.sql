-- Additive: serves the in-app inbox (channel_id IS NULL) and its unread counter
CREATE INDEX "notification_deliveries_org_id_channel_id_read_at_idx" ON "notification_deliveries"("org_id", "channel_id", "read_at");
