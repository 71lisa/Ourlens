CREATE TYPE "PartnerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "PartnerAccount"
ADD COLUMN "paidOrderCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
ADD COLUMN "clientName" TEXT,
ADD COLUMN "priceSnapshot" JSONB,
ADD COLUMN "partnerAccountId" TEXT,
ADD COLUMN "tierCountedAt" TIMESTAMP(3);

CREATE TABLE "PartnerApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "partnerAccountId" TEXT,
  "businessName" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "businessDescription" TEXT NOT NULL,
  "businessAddress" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "website" TEXT,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "eventsPerMonth" INTEGER NOT NULL,
  "typicalEventTypes" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "canReapply" BOOLEAN NOT NULL DEFAULT false,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerDiscountTier" (
  "id" TEXT NOT NULL,
  "minPaidOrders" INTEGER NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerDiscountTier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerDiscountTier_minPaidOrders_check" CHECK ("minPaidOrders" > 0),
  CONSTRAINT "PartnerDiscountTier_discountPercent_check" CHECK ("discountPercent" BETWEEN 0 AND 20)
);

CREATE TABLE "PartnerPriceAgreement" (
  "id" TEXT NOT NULL,
  "partnerAccountId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerPriceAgreement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerCustomPrice" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "PartnerCustomPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerCustomPrice_price_check" CHECK ("price" > 0)
);

CREATE UNIQUE INDEX "PartnerDiscountTier_minPaidOrders_key" ON "PartnerDiscountTier"("minPaidOrders");
CREATE INDEX "PartnerDiscountTier_active_minPaidOrders_idx" ON "PartnerDiscountTier"("active", "minPaidOrders");
CREATE INDEX "PartnerApplication_userId_createdAt_idx" ON "PartnerApplication"("userId", "createdAt");
CREATE INDEX "PartnerApplication_status_createdAt_idx" ON "PartnerApplication"("status", "createdAt");
CREATE INDEX "PartnerPriceAgreement_partnerAccountId_active_startsAt_ends_idx"
  ON "PartnerPriceAgreement"("partnerAccountId", "active", "startsAt", "endsAt");
CREATE UNIQUE INDEX "PartnerCustomPrice_agreementId_packageId_key"
  ON "PartnerCustomPrice"("agreementId", "packageId");
CREATE INDEX "Order_partnerAccountId_status_idx" ON "Order"("partnerAccountId", "status");

INSERT INTO "PartnerDiscountTier" ("id", "minPaidOrders", "discountPercent", "updatedAt")
VALUES
  ('partner-tier-10', 1, 10, CURRENT_TIMESTAMP),
  ('partner-tier-12', 10, 12, CURRENT_TIMESTAMP),
  ('partner-tier-15', 20, 15, CURRENT_TIMESTAMP),
  ('partner-tier-20', 30, 20, CURRENT_TIMESTAMP);

ALTER TABLE "Order"
ADD CONSTRAINT "Order_partnerAccountId_fkey"
FOREIGN KEY ("partnerAccountId") REFERENCES "PartnerAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerApplication"
ADD CONSTRAINT "PartnerApplication_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PartnerApplication_partnerAccountId_fkey"
FOREIGN KEY ("partnerAccountId") REFERENCES "PartnerAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PartnerApplication_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerDiscountTier"
ADD CONSTRAINT "PartnerDiscountTier_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerPriceAgreement"
ADD CONSTRAINT "PartnerPriceAgreement_partnerAccountId_fkey"
FOREIGN KEY ("partnerAccountId") REFERENCES "PartnerAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PartnerPriceAgreement_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerCustomPrice"
ADD CONSTRAINT "PartnerCustomPrice_agreementId_fkey"
FOREIGN KEY ("agreementId") REFERENCES "PartnerPriceAgreement"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PartnerCustomPrice_packageId_fkey"
FOREIGN KEY ("packageId") REFERENCES "Package"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
