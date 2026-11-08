CREATE TYPE "PromotionType" AS ENUM ('FIRST_EVENT', 'REFERRAL_VOUCHER');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED');
CREATE TYPE "ReferralVoucherStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'USED', 'EXPIRED');

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

ALTER TABLE "Order"
  ADD COLUMN "baseAmount" DECIMAL(12,2),
  ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "promotionType" "PromotionType";
CREATE INDEX "Order_promotionType_status_idx" ON "Order"("promotionType", "status");

CREATE TABLE "PromotionSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "firstEventActive" BOOLEAN NOT NULL DEFAULT true,
  "referralActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  CONSTRAINT "PromotionSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "referralCode" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "rewardOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rewardedAt" TIMESTAMP(3),
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralVoucher" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "referralId" TEXT NOT NULL,
  "orderId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "ReferralVoucherStatus" NOT NULL DEFAULT 'AVAILABLE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "ReferralVoucher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FreeTrial" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "photoLimit" INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "FreeTrial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE UNIQUE INDEX "Referral_rewardOrderId_key" ON "Referral"("rewardOrderId");
CREATE INDEX "Referral_referrerId_createdAt_idx" ON "Referral"("referrerId", "createdAt");
CREATE INDEX "Referral_status_createdAt_idx" ON "Referral"("status", "createdAt");
CREATE UNIQUE INDEX "ReferralVoucher_referralId_key" ON "ReferralVoucher"("referralId");
CREATE UNIQUE INDEX "ReferralVoucher_orderId_key" ON "ReferralVoucher"("orderId");
CREATE INDEX "ReferralVoucher_ownerId_status_expiresAt_idx" ON "ReferralVoucher"("ownerId", "status", "expiresAt");
CREATE INDEX "ReferralVoucher_createdAt_idx" ON "ReferralVoucher"("createdAt");
CREATE UNIQUE INDEX "FreeTrial_userId_key" ON "FreeTrial"("userId");
CREATE UNIQUE INDEX "FreeTrial_eventId_key" ON "FreeTrial"("eventId");
CREATE INDEX "FreeTrial_createdAt_idx" ON "FreeTrial"("createdAt");

ALTER TABLE "PromotionSettings"
  ADD CONSTRAINT "PromotionSettings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Referral"
  ADD CONSTRAINT "Referral_referrerId_fkey"
  FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral"
  ADD CONSTRAINT "Referral_referredUserId_fkey"
  FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral"
  ADD CONSTRAINT "Referral_rewardOrderId_fkey"
  FOREIGN KEY ("rewardOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferralVoucher"
  ADD CONSTRAINT "ReferralVoucher_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralVoucher"
  ADD CONSTRAINT "ReferralVoucher_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralVoucher"
  ADD CONSTRAINT "ReferralVoucher_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FreeTrial"
  ADD CONSTRAINT "FreeTrial_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FreeTrial"
  ADD CONSTRAINT "FreeTrial_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PromotionSettings" ("id", "firstEventActive", "referralActive", "updatedAt")
VALUES ('global', true, true, CURRENT_TIMESTAMP);