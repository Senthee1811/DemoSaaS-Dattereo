-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "gateway_key_id" TEXT;

-- CreateIndex
CREATE INDEX "requests_gateway_key_id_created_at_idx" ON "requests"("gateway_key_id", "created_at");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_gateway_key_id_fkey" FOREIGN KEY ("gateway_key_id") REFERENCES "gateway_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

