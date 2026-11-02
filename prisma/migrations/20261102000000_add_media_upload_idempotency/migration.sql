ALTER TABLE "MediaAsset"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "MediaAsset_eventId_idempotencyKey_key"
ON "MediaAsset"("eventId", "idempotencyKey");
