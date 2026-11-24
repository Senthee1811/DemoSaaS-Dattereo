-- Financial intelligence: attribution, recommendations, notification channels and delivery history.
-- Additive only: nothing existing is changed or dropped.

-- 1. Attribution (NULL = not attributed; never backfilled with guesses)
ALTER TABLE "gateway_api_keys" ADD COLUMN "application" VARCHAR(64);
ALTER TABLE "gateway_api_keys" ADD COLUMN "team" VARCHAR(64);

ALTER TABLE "requests" ADD COLUMN "application" VARCHAR(64);
ALTER TABLE "requests" ADD COLUMN "team" VARCHAR(64);
ALTER TABLE "requests" ADD COLUMN "tags" JSONB;
-- Cached input tokens: recorded going forward. NULL = not recorded (no backfill with guesses).
ALTER TABLE "requests" ADD COLUMN "cached_tokens_in" INTEGER;

CREATE INDEX "requests_project_id_application_created_at_idx" ON "requests"("project_id", "application", "created_at");
CREATE INDEX "requests_project_id_team_created_at_idx" ON "requests"("project_id", "team", "created_at");

-- 2. Recommendations
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "project_id" TEXT,
    "type" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "impact_low_usd" DECIMAL(14,4),
    "impact_high_usd" DECIMAL(14,4),
    "impact_basis" TEXT,
    "confidence" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" VARCHAR(500),
    "dismissed_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recommendations_org_id_fingerprint_key" ON "recommendations"("org_id", "fingerprint");
CREATE INDEX "recommendations_org_id_status_idx" ON "recommendations"("org_id", "status");
CREATE INDEX "recommendations_project_id_idx" ON "recommendations"("project_id");
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Notification channels (destination details encrypted at rest) and delivery history
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "encrypted_config" TEXT NOT NULL,
    "config_hint" TEXT,
    "event_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_channels_org_id_enabled_idx" ON "notification_channels"("org_id", "enabled");
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "channel_type" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(300),
    "last_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_deliveries_channel_id_event_id_key" ON "notification_deliveries"("channel_id", "event_id");
CREATE INDEX "notification_deliveries_org_id_created_at_idx" ON "notification_deliveries"("org_id", "created_at");
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries"("status", "created_at");
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
