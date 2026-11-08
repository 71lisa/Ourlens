import { prisma } from "@/server/db/prisma";

const GB = 1024n ** 3n;

const starterPackages = [
  {
    name: "5 tamu",
    guestCapacity: 5,
    isUnlimited: false,
    price: 19000,
    storageLimitBytes: 3n * GB,
    photoLimit: 200,
    videoLimit: 15,
    videoDurationLimit: 30,
    retentionDays: 30,
  },
  {
    name: "10 tamu",
    guestCapacity: 10,
    isUnlimited: false,
    price: 29000,
    storageLimitBytes: 5n * GB,
    photoLimit: 400,
    videoLimit: 30,
    videoDurationLimit: 45,
    retentionDays: 30,
  },
  {
    name: "25 tamu",
    guestCapacity: 25,
    isUnlimited: false,
    price: 49000,
    storageLimitBytes: 10n * GB,
    photoLimit: 1000,
    videoLimit: 60,
    videoDurationLimit: 60,
    retentionDays: 60,
  },
  {
    name: "50 tamu",
    guestCapacity: 50,
    isUnlimited: false,
    price: 79000,
    storageLimitBytes: 20n * GB,
    photoLimit: 2000,
    videoLimit: 100,
    videoDurationLimit: 60,
    retentionDays: 90,
  },
  {
    name: "100 tamu",
    guestCapacity: 100,
    isUnlimited: false,
    price: 129000,
    storageLimitBytes: 35n * GB,
    photoLimit: 3500,
    videoLimit: 150,
    videoDurationLimit: 90,
    retentionDays: 120,
  },
  {
    name: "150 tamu",
    guestCapacity: 150,
    isUnlimited: false,
    price: 169000,
    storageLimitBytes: 50n * GB,
    photoLimit: 5000,
    videoLimit: 200,
    videoDurationLimit: 90,
    retentionDays: 150,
  },
  {
    name: "200 tamu",
    guestCapacity: 200,
    isUnlimited: false,
    price: 199000,
    storageLimitBytes: 75n * GB,
    photoLimit: 8000,
    videoLimit: 300,
    videoDurationLimit: 120,
    retentionDays: 180,
  },
  {
    name: "Tidak Terbatas",
    guestCapacity: 999999,
    isUnlimited: true,
    price: 299000,
    storageLimitBytes: 150n * GB,
    photoLimit: 15000,
    videoLimit: 500,
    videoDurationLimit: 120,
    retentionDays: 365,
  },
] as const;

function normalizePackageOutput<T extends { name: string; guestCapacity?: number | null; isUnlimited?: boolean; price: unknown }>(item: T) {
  const rawName = item.name.toLowerCase();
  const fromNameCapacity = Number(rawName.match(/^(\d+)/)?.[1] ?? "0");
  const guestCapacity =
    typeof item.guestCapacity === "number" && Number.isFinite(item.guestCapacity)
      ? item.guestCapacity
      : rawName.includes("tidak terbatas")
        ? 999999
        : fromNameCapacity > 0
          ? fromNameCapacity
          : null;

  return {
    ...item,
    guestCapacity,
    isUnlimited: item.isUnlimited ?? rawName.includes("tidak terbatas"),
  };
}

export async function getActivePackages() {
  let packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: [{ guestCapacity: "asc" }, { isUnlimited: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      guestCapacity: true,
      isUnlimited: true,
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

  packages = packages.map((item) => normalizePackageOutput(item));

  const legacyPackageNames = new Set(["basic", "premium", "exclusive"]);
  const needsCatalogRefresh =
    packages.length < starterPackages.length ||
    packages.some(
      (item) =>
        legacyPackageNames.has((item.name ?? "").trim().toLowerCase()) ||
        !item.guestCapacity ||
        item.guestCapacity === 0,
    );

  if (needsCatalogRefresh) {
    await prisma.$transaction(async (transaction) => {
      const existingPackages = await transaction.package.findMany({
        select: { id: true, name: true, guestCapacity: true, isUnlimited: true, price: true },
      });

      for (const preset of starterPackages) {
        const match = existingPackages.find(
          (item) =>
            item.name.toLowerCase() === preset.name.toLowerCase() ||
            item.guestCapacity === preset.guestCapacity ||
            (item.name.toLowerCase() === "basic" && preset.guestCapacity === 5) ||
            (item.name.toLowerCase() === "premium" && preset.guestCapacity === 10) ||
            (item.name.toLowerCase() === "exclusive" && preset.guestCapacity === 25),
        );

        if (match) {
          await transaction.package.update({
            where: { id: match.id },
            data: {
              ...preset,
              price: match.price,
              currency: "IDR",
              guestCapacity: preset.guestCapacity,
              isUnlimited: preset.isUnlimited,
              eventDurationDays: Math.max(preset.retentionDays, 30),
              isActive: true,
            },
          });
          continue;
        }

        await transaction.package.create({
          data: {
            ...preset,
            currency: "IDR",
            guestCapacity: preset.guestCapacity,
            isUnlimited: preset.isUnlimited,
            eventDurationDays: Math.max(preset.retentionDays, 30),
            isActive: true,
          },
        });
      }
    });

    packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ guestCapacity: "asc" }, { isUnlimited: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        guestCapacity: true,
        isUnlimited: true,
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
    ...normalizePackageOutput(item),
    price: item.price.toString(),
    storageLimitBytes: item.storageLimitBytes.toString(),
    priceConfigured: item.price.greaterThan(0),
  }));
}