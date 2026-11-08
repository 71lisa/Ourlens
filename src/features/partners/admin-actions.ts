"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/server/db/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");
  return session.user;
}

function adminError(code: string): never {
  redirect(`/admin?error=${encodeURIComponent(code)}`);
}

export async function approvePartnerApplicationAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string" || !applicationId) adminError("invalid");

  try {
    await prisma.$transaction(async (transaction) => {
      const application = await transaction.partnerApplication.findFirst({
        where: { id: applicationId, status: "PENDING" },
      });
      if (!application) throw new Error("The pending partner application was not found.");
      const account = await transaction.partnerAccount.upsert({
        where: { userId: application.userId },
        create: {
          userId: application.userId,
          businessName: application.businessName,
          status: "ACTIVE",
        },
        update: {
          businessName: application.businessName,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      await transaction.user.update({
        where: { id: application.userId },
        data: { role: "PARTNER" },
      });
      await transaction.partnerApplication.update({
        where: { id: application.id },
        data: {
          status: "APPROVED",
          partnerAccountId: account.id,
          reviewedById: admin.id,
          reviewedAt: new Date(),
          adminNote: null,
          canReapply: false,
        },
      });
    });
  } catch (error) {
    console.error("[partner-admin] Could not approve partner application.", error);
    adminError("approve");
  }
  revalidatePath("/admin");
  revalidatePath("/partner");
  redirect("/admin?updated=approved");
}

export async function rejectPartnerApplicationAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const applicationId = formData.get("applicationId");
  const note = formData.get("adminNote");
  const canReapply = formData.get("canReapply") === "on";
  if (typeof applicationId !== "string" || !applicationId) adminError("invalid");
  if (typeof note !== "string" || note.trim().length > 1000) adminError("invalid");

  try {
    const updated = await prisma.partnerApplication.updateMany({
      where: { id: applicationId, status: "PENDING" },
      data: {
        status: "REJECTED",
        adminNote: note.trim() || null,
        canReapply,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1) adminError("not-pending");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[partner-admin] Could not reject partner application.", error);
    adminError("reject");
  }
  revalidatePath("/admin");
  redirect("/admin?updated=rejected");
}

export async function togglePartnerAccountStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const partnerAccountId = formData.get("partnerAccountId");
  const status = formData.get("status");

  if (typeof partnerAccountId !== "string" || !partnerAccountId) {
    adminError("invalid");
  }
  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    adminError("invalid");
  }

  try {
    await prisma.partnerAccount.update({
      where: { id: partnerAccountId },
      data: { status },
    });
  } catch (error) {
    console.error("[partner-admin] Could not update partner status.", error);
    adminError("reject");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/partner-management");
  redirect("/admin/partner-management?updated=partner-status");
}

export async function savePartnerCustomPriceAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const partnerAccountId = formData.get("partnerAccountId");
  const packageId = formData.get("packageId");
  const rawPrice = formData.get("price");
  const remove = formData.get("remove") === "1";
  if (
    typeof partnerAccountId !== "string" ||
    !partnerAccountId ||
    typeof packageId !== "string" ||
    !packageId
  ) {
    adminError("invalid-price");
  }
  if (!remove && (typeof rawPrice !== "string" || !/^\d{1,9}$/.test(rawPrice))) {
    adminError("invalid-price");
  }
  if (remove) {
    try {
      await removePartnerCustomPrice(partnerAccountId, packageId);
    } catch (error) {
      console.error("[partner-admin] Could not remove custom package price.", error);
      adminError("save-price");
    }
    revalidatePath("/admin");
    revalidatePath("/partner/orders/new");
    redirect("/admin?updated=price");
  }
  const price = Number(rawPrice);
  if (!Number.isSafeInteger(price) || price <= 0) adminError("invalid-price");

  try {
    await prisma.$transaction(async (transaction) => {
      const [account, packageItem] = await Promise.all([
        transaction.partnerAccount.findFirst({
          where: { id: partnerAccountId, status: "ACTIVE" },
          select: { id: true },
        }),
        transaction.package.findFirst({
          where: { id: packageId, isActive: true, currency: "IDR" },
          select: { id: true },
        }),
      ]);
      if (!account || !packageItem) throw new Error("Partner or package is unavailable.");

      const now = new Date();
      const agreement = await transaction.partnerPriceAgreement.findFirst({
        where: {
          partnerAccountId: account.id,
          active: true,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        orderBy: { startsAt: "desc" },
        select: { id: true },
      });
      const currentAgreement = agreement ?? await transaction.partnerPriceAgreement.create({
        data: {
          partnerAccountId: account.id,
          startsAt: now,
          createdById: admin.id,
          notes: "Dikelola melalui admin OurLens",
        },
        select: { id: true },
      });
      await transaction.partnerCustomPrice.upsert({
        where: {
          agreementId_packageId: {
            agreementId: currentAgreement.id,
            packageId: packageItem.id,
          },
        },
        create: {
          agreementId: currentAgreement.id,
          packageId: packageItem.id,
          price: new Prisma.Decimal(price),
        },
        update: { price: new Prisma.Decimal(price) },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    console.error("[partner-admin] Could not save custom package price.", error);
    adminError("save-price");
  }
  revalidatePath("/admin");
  revalidatePath("/partner/orders/new");
  redirect("/admin?updated=price");
}

async function removePartnerCustomPrice(partnerAccountId: string, packageId: string) {
  await prisma.$transaction(async (transaction) => {
    const [account, packageItem] = await Promise.all([
      transaction.partnerAccount.findUnique({ where: { id: partnerAccountId }, select: { id: true } }),
      transaction.package.findUnique({ where: { id: packageId }, select: { id: true } }),
    ]);
    if (!account || !packageItem) throw new Error("Partner or package is unavailable.");
    const agreement = await transaction.partnerPriceAgreement.findFirst({
      where: {
        partnerAccountId: account.id,
        active: true,
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      orderBy: { startsAt: "desc" },
      select: { id: true },
    });
    if (!agreement) return;
    await transaction.partnerCustomPrice.deleteMany({
      where: { agreementId: agreement.id, packageId: packageItem.id },
    });
  });
}
