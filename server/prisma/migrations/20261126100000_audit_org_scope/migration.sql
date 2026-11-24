-- Additive: org scope for administrative audit rows (NULL for existing request-level rows)
ALTER TABLE "audit_log" ADD COLUMN "org_id" TEXT;
CREATE INDEX "audit_log_org_id_created_at_idx" ON "audit_log"("org_id", "created_at");
