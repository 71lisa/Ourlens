"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/server/db/prisma";

const applicationSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  businessType: z.string().trim().min(2).max(100),
  businessDescription: z.string().trim().min(20).max(2000),
  businessAddress: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  website: z.union([z.literal(""), z.url().max(300)]).optional(),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().regex(/^\+?[0-9\s()-]{8,24}$/),
  position: z.string().trim().min(2).max(100),
  eventsPerMonth: z.coerce.number().int().min(0).max(1000),
  typicalEventTypes: z.string().trim().min(2).max(300),
  reason: z.string().trim().min(20).max(2000),
});

export async function submitPartnerApplicationAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fpartner%2Fapply");
  if (session.user.role !== "ORGANIZER") redirect("/partner");

  const parsed = applicationSchema.safeParse({
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType"),
    businessDescription: formData.get("businessDescription"),
    businessAddress: formData.get("businessAddress"),
    city: formData.get("city"),
    province: formData.get("province"),
    website: formData.get("website") || "",
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone"),
    position: formData.get("position"),
    eventsPerMonth: formData.get("eventsPerMonth"),
    typicalEventTypes: formData.get("typicalEventTypes"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect("/partner/apply?error=invalid");

  try {
    const outcome = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))::text`,
      );
      const partnerAccount = await transaction.partnerAccount.findUnique({
        where: { userId: session.user.id },
        select: { status: true },
      });
      if (partnerAccount?.status === "ACTIVE") return "active";
      const pending = await transaction.partnerApplication.findFirst({
        where: { userId: session.user.id, status: "PENDING" },
        select: { id: true },
      });
      if (pending) return "pending";
      const previous = await transaction.partnerApplication.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: { status: true, canReapply: true },
      });
      if (previous?.status === "REJECTED" && !previous.canReapply) return "blocked";

      await transaction.partnerApplication.create({
        data: {
          ...parsed.data,
          website: parsed.data.website || null,
          userId: session.user.id,
        },
      });
      return "submitted";
    });

    if (outcome === "active") redirect("/partner");
    if (outcome === "pending") redirect("/partner/apply?error=pending");
    if (outcome === "blocked") redirect("/partner/apply?error=blocked");
    redirect("/partner/apply?submitted=1");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[partner-application] Could not submit application.", error);
    redirect("/partner/apply?error=unavailable");
  }
}
