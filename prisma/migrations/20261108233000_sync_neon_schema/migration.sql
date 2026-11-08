-- AlterTable
ALTER TABLE "Event"
ADD COLUMN IF NOT EXISTS "organizerName" TEXT;

-- AlterTable
ALTER TABLE "Package"
ADD COLUMN IF NOT EXISTS "guestCapacity" INTEGER,
ADD COLUMN IF NOT EXISTS "isUnlimited" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PromotionSettings"
ALTER COLUMN "updatedAt" DROP DEFAULT;