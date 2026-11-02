import { prisma } from "@/server/db/prisma";

export async function getOrganizerOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      event: { select: { id: true, name: true } },
      payments: {
        where: { provider: "MIDTRANS" },
        select: { status: true, checkoutUrl: true, updatedAt: true },
        take: 1,
      },
    },
  });
}

export async function getOrganizerOrder(orderId: string, userId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      event: { select: { id: true, name: true, status: true, slug: true } },
      payments: {
        where: { provider: "MIDTRANS" },
        select: { status: true, checkoutUrl: true, providerRef: true, updatedAt: true },
        take: 1,
      },
    },
  });
}
