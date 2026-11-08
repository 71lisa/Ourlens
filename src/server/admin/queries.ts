import { prisma } from "@/server/db/prisma";

export type DashboardRange = {
  start: Date;
  end: Date;
  label: string;
};

export function getDateRange(period: string | undefined, customStart?: string, customEnd?: string): DashboardRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);

  if (period === "7") {
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "7 hari terakhir" };
  }
  if (period === "30") {
    start.setDate(end.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "30 hari terakhir" };
  }
  if (period === "90") {
    start.setMonth(end.getMonth() - 2);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "3 bulan terakhir" };
  }
  if (period === "365") {
    start.setFullYear(end.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "12 bulan terakhir" };
  }
  if (customStart && customEnd) {
    const parsedStart = new Date(customStart);
    const parsedEnd = new Date(customEnd);
    if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime())) {
      const normalizedStart = new Date(parsedStart);
      normalizedStart.setHours(0, 0, 0, 0);
      const normalizedEnd = new Date(parsedEnd);
      normalizedEnd.setHours(23, 59, 59, 999);
      return { start: normalizedStart, end: normalizedEnd, label: "Rentang kustom" };
    }
  }

  start.setDate(end.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start, end, label: "30 hari terakhir" };
}

export async function getAdminDashboardData(range: DashboardRange) {
  const [totals, paymentSummary, recentApplications, recentOrders, topPartners, revenueSeries, orderSeries] = await Promise.all([
    Promise.all([
      prisma.user.count(),
      prisma.partnerAccount.count({ where: { status: "ACTIVE" } }),
      prisma.partnerApplication.count({ where: { status: "PENDING" } }),
      prisma.event.count(),
      prisma.order.count(),
      prisma.payment.count({ where: { status: "PAID" } }),
      prisma.order.aggregate({
        _sum: { amount: true },
        where: { status: "PAID", createdAt: { gte: range.start, lte: range.end } },
      }),
    ]),
    prisma.payment.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    prisma.partnerApplication.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { applicant: { select: { name: true, email: true } } },
    }),
    prisma.order.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        event: { select: { name: true, eventType: true } },
        partnerAccount: { select: { id: true, businessName: true } },
      },
    }),
    prisma.partnerAccount.findMany({
      orderBy: { paidOrderCount: "desc" },
      take: 5,
      select: {
        id: true,
        businessName: true,
        paidOrderCount: true,
        status: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["createdAt"],
      where: { status: "PAID", createdAt: { gte: range.start, lte: range.end } },
      _sum: { amount: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: range.start, lte: range.end } },
      _count: { id: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const [userCount, activePartners, pendingApplications, totalEvents, totalOrders, successfulPayments, revenueAggregate] = totals;
  const revenue = Number(revenueAggregate._sum.amount ?? 0);

  return {
    stats: {
      userCount,
      activePartners,
      pendingApplications,
      totalEvents,
      totalOrders,
      successfulPayments,
      revenue,
    },
    paymentSummary: paymentSummary.map((item) => ({
      status: item.status,
      count: item._count.status,
    })),
    recentApplications,
    recentOrders,
    topPartners,
    revenueSeries,
    orderSeries,
  };
}

export async function getAdminSectionData(section: string) {
  switch (section) {
    case "partner-applications": {
      return prisma.partnerApplication.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: { applicant: { select: { name: true, email: true } }, reviewer: { select: { name: true, email: true } } },
      });
    }
    case "partner-management": {
      return Promise.all([
        prisma.partnerAccount.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { name: true, email: true } },
            orders: {
              select: { id: true, status: true, amount: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            applications: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        }),
        prisma.partnerDiscountTier.findMany({
          where: { active: true },
          orderBy: { minPaidOrders: "asc" },
        }),
      ]);
    }
    case "partner-pricing": {
      return Promise.all([
        prisma.partnerDiscountTier.findMany({
          where: { active: true },
          orderBy: { minPaidOrders: "asc" },
        }),
        prisma.partnerPriceAgreement.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            partnerAccount: { select: { id: true, businessName: true } },
            prices: { include: { package: { select: { id: true, name: true, price: true } } } },
          },
        }),
        prisma.package.findMany({
          where: { isActive: true },
          orderBy: { price: "asc" },
          select: { id: true, name: true, price: true, currency: true },
        }),
        prisma.partnerAccount.findMany({
          where: { status: "ACTIVE" },
          orderBy: { businessName: "asc" },
          select: { id: true, businessName: true },
        }),
      ]);
    }
    case "order-management": {
      return prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          event: { select: { name: true, eventType: true, status: true } },
          partnerAccount: { select: { businessName: true } },
          package: { select: { name: true, price: true } },
          payments: { orderBy: { createdAt: "desc" } },
        },
      });
    }
    case "payment-management": {
      return prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        include: { order: { select: { id: true, orderNumber: true, user: { select: { name: true, email: true } }, event: { select: { name: true } }, partnerAccount: { select: { businessName: true } } } } },
      });
    }
    case "event-management": {
      return prisma.event.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          owner: { select: { name: true, email: true } },
          package: { select: { name: true } },
          orders: { select: { status: true }, take: 5 },
          qrCode: { select: { active: true, scanCount: true } },
          _count: { select: { mediaAssets: true, memories: true } },
        },
      });
    }
    case "user-management": {
      return prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: { select: { orders: true, ownedEvents: true } },
        },
      });
    }
    case "package-pricing": {
      return prisma.package.findMany({
        orderBy: [{ isActive: "desc" }, { price: "asc" }],
      });
    }
    case "promotions": {
      const now = new Date();
      await prisma.referralVoucher.updateMany({
        where: { status: "AVAILABLE", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      return Promise.all([
        prisma.promotionSettings.findUnique({ where: { id: "global" } }),
        prisma.referral.findMany({
          take: 100,
          orderBy: { createdAt: "desc" },
          include: {
            referrer: { select: { name: true, email: true } },
            referred: { select: { name: true, email: true } },
            voucher: { select: { amount: true, status: true, expiresAt: true, usedAt: true } },
          },
        }),
        prisma.referralVoucher.findMany({
          take: 100,
          orderBy: { createdAt: "desc" },
          include: {
            owner: { select: { name: true, email: true } },
            referral: {
              select: {
                referralCode: true,
                referred: { select: { name: true, email: true } },
              },
            },
          },
        }),
        prisma.order.groupBy({
          by: ["status"],
          where: {
            promotionType: "FIRST_EVENT",
            partnerAccountId: null,
            status: { in: ["PAID", "PENDING"] },
          },
          _count: { id: true },
        }),
      ]);
    }
    case "free-trial-management": {
      return prisma.freeTrial.findMany({
        take: 100,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          event: {
            select: {
              name: true,
              slug: true,
              mediaAssets: {
                where: { type: "PHOTO", uploadStatus: "COMPLETE" },
                select: { id: true },
              },
            },
          },
        },
      });
    }
    case "reports": {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      return Promise.all([
        prisma.order.groupBy({
          by: ["status"],
          _count: { id: true },
        }),
        prisma.partnerAccount.findMany({
          orderBy: { paidOrderCount: "desc" },
          take: 5,
          select: { businessName: true, paidOrderCount: true, status: true },
        }),
        prisma.order.aggregate({
          _sum: { amount: true },
          where: { status: "PAID" },
        }),
        Promise.all([
          prisma.user.count({
            where: { createdAt: { gte: currentMonthStart, lte: now } },
          }),
          prisma.user.count({
            where: { createdAt: { gte: previousMonthStart, lt: currentMonthStart } },
          }),
        ]),
      ]);
    }
    default:
      return null;
  }
}
