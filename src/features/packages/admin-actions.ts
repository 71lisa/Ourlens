"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/server/db/prisma";

export async function updatePackagePriceAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const packageId = formData.get("packageId");
  const rawPrice = formData.get("price");
  if (
    typeof packageId !== "string" ||
    !packageId ||
    typeof rawPrice !== "string" ||
    !/^\d{1,10}$/.test(rawPrice)
  ) {
    redirect("/admin/package-pricing?error=invalid-package-price");
  }

  const price = Number(rawPrice);
  if (!Number.isSafeInteger(price) || price <= 0 || price > 9_999_999_999) {
    redirect("/admin/package-pricing?error=invalid-package-price");
  }

  try {
    const updated = await prisma.package.updateMany({
      where: { id: packageId },
      data: { price: new Prisma.Decimal(price) },
    });
    if (updated.count !== 1) {
      redirect("/admin/package-pricing?error=package-not-found");
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[admin-packages] Could not update package price.", error);
    redirect("/admin/package-pricing?error=save-package-price");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/package-pricing");
  revalidatePath("/pricing");
  revalidatePath("/dashboard/events/create");
  revalidatePath("/partner/orders/new");
  redirect("/admin/package-pricing?updated=package-price");
}
