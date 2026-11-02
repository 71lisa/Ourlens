import { prisma } from "@/server/db/prisma";

const GB = 1024n ** 3n;

const starterPackages = [
  {
    name: "BASIC",
    price: 0,
    storageLimitBytes: 5n * GB,
    photoLimit: 500,
    videoLimit: 50,
    videoDurationLimit: 15,
    retentionDays: 30,
  },
  {
    name: "PREMIUM",
    price: 0,
    storageLimitBytes: 25n * GB,
    photoLimit: 2500,
    videoLimit: 250,
    videoDurationLimit: 15,
    retentionDays: 90,
  },
  {
    name: "EXCLUSIVE",
    price: 0,
    storageLimitBytes: 100n * GB,
    photoLimit: 10000,
    videoLimit: 1000,
    videoDurationLimit: 15,
    retentionDays: 365,
  },
] as const;

export async function getActivePackages() {
  let packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { storageLimitBytes: "asc" },
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      storageLimitBytes: true,
      photoLimit: true,
      videoLimit: true,
      videoDurationLimit: true,
      eventDurationDays: true,
      retentionDays: true,
      customEventPage: true,
      customQRCode: true,
      filtersEnabled: true,
      framesEnabled: true,
      aiEnhancementEnabled: true,
      aiCurationEnabled: true,
      digitalAlbumEnabled: true,
      liveMomentEnabled: true,
      eventChallengesEnabled: true,
    },
  });

  if (packages.length === 0 && (await prisma.package.count()) === 0) {
    await prisma.$transaction(async (transaction) => {
      if ((await transaction.package.count()) === 0) {
        await transaction.package.createMany({
          data: starterPackages.map((item) => ({
            ...item,
            currency: "IDR",
            eventDurationDays: item.retentionDays,
            isActive: true,
          })),
        });
      }
    });
    packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: { storageLimitBytes: "asc" },
      select: {
        id: true,
        name: true,
        price: true,
        currency: true,
        storageLimitBytes: true,
        photoLimit: true,
        videoLimit: true,
        videoDurationLimit: true,
        eventDurationDays: true,
        retentionDays: true,
        customEventPage: true,
        customQRCode: true,
        filtersEnabled: true,
        framesEnabled: true,
        aiEnhancementEnabled: true,
        aiCurationEnabled: true,
        digitalAlbumEnabled: true,
        liveMomentEnabled: true,
        eventChallengesEnabled: true,
      },
    });
  }

  return packages.map((item) => ({
    ...item,
    price: item.price.toString(),
    storageLimitBytes: item.storageLimitBytes.toString(),
    priceConfigured: item.price.greaterThan(0),
  }));
}