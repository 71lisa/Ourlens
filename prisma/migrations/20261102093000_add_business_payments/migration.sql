ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "Order"
ADD COLUMN "orderNumber" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "packageSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "Order" AS o
SET
  "orderNumber" = 'OL-legacy-' || o."id",
  "idempotencyKey" = 'legacy-' || o."id",
  "packageSnapshot" = jsonb_build_object(
    'name', p."name",
    'price', o."amount"::text,
    'currency', o."currency",
    'storageLimitBytes', p."storageLimitBytes"::text,
    'photoLimit', p."photoLimit",
    'videoLimit', p."videoLimit",
    'videoDurationLimit', p."videoDurationLimit",
    'eventDurationDays', p."eventDurationDays",
    'retentionDays', p."retentionDays",
    'customEventPage', p."customEventPage",
    'customQRCode', p."customQRCode",
    'filtersEnabled', p."filtersEnabled",
    'framesEnabled', p."framesEnabled",
    'aiEnhancementEnabled', p."aiEnhancementEnabled",
    'aiCurationEnabled', p."aiCurationEnabled",
    'digitalAlbumEnabled', p."digitalAlbumEnabled",
    'liveMomentEnabled', p."liveMomentEnabled",
    'eventChallengesEnabled', p."eventChallengesEnabled"
  )
FROM "Package" AS p
WHERE o."packageId" = p."id";

UPDATE "Order"
SET
  "orderNumber" = 'OL-legacy-' || "id",
  "idempotencyKey" = 'legacy-' || "id"
WHERE "orderNumber" IS NULL OR "idempotencyKey" IS NULL;

ALTER TABLE "Order"
ALTER COLUMN "orderNumber" SET NOT NULL,
ALTER COLUMN "idempotencyKey" SET NOT NULL,
ALTER COLUMN "packageSnapshot" DROP DEFAULT;

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE UNIQUE INDEX "Order_eventId_key" ON "Order"("eventId");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
DROP INDEX IF EXISTS "Order_userId_idx";

ALTER TABLE "Payment"
ADD COLUMN "checkoutUrl" TEXT,
ADD COLUMN "checkoutRequestedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");
CREATE UNIQUE INDEX "Payment_orderId_provider_key" ON "Payment"("orderId", "provider");
DROP INDEX IF EXISTS "Payment_orderId_idx";
