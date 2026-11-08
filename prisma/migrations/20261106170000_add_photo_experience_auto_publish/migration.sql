CREATE TYPE "PhotoFilter" AS ENUM (
    'ORIGINAL',
    'DISPOSABLE_CAM',
    'VINTAGE_FILM',
    'RETRO',
    'CLASSIC'
);

CREATE TYPE "PhotoFrame" AS ENUM (
    'NO_FRAME',
    'POLAROID_WHITE',
    'POLAROID_VINTAGE',
    'FILM_FRAME',
    'MINIMAL_FRAME'
);

CREATE TABLE "PhotoExperience" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "filter" "PhotoFilter" NOT NULL DEFAULT 'ORIGINAL',
    "frame" "PhotoFrame" NOT NULL DEFAULT 'NO_FRAME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoExperience_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhotoExperience_eventId_key" ON "PhotoExperience"("eventId");

ALTER TABLE "PhotoExperience"
ADD CONSTRAINT "PhotoExperience_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PhotoExperience" ("id", "eventId", "updatedAt")
SELECT 'photo-experience-' || md5("id"), "id", CURRENT_TIMESTAMP
FROM "Event";

UPDATE "MediaAsset"
SET "moderationStatus" = 'APPROVED'
WHERE "type" = 'PHOTO'
  AND "uploadStatus" = 'COMPLETE'
  AND "moderationStatus" = 'PENDING';

ALTER TABLE "MediaAsset"
ALTER COLUMN "moderationStatus" SET DEFAULT 'APPROVED';
