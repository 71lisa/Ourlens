import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPackageSnapshot } from "@/server/packages/snapshot";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
const originalMidtransKey = process.env.MIDTRANS_SERVER_KEY;
const originalMidtransEnvironment = process.env.MIDTRANS_ENVIRONMENT;

import { prisma } from "@/server/db/prisma";
import { getActivePackages } from "@/server/packages/catalog";
import { getOrganizerOrder } from "@/server/orders/queries";
import { createCheckoutForOrder } from "@/server/orders/service";
import { POST as midtransWebhook } from "@/app/api/payments/midtrans/webhook/route";
import { POST as createGuestSession } from "@/app/api/events/[slug]/guest-session/route";
import { POST as uploadGuestMemory } from "@/app/api/events/[slug]/memories/route";

describe.skipIf(!databaseAvailable)("PostgreSQL business payments integration", () => {
  const suffix = crypto.randomUUID();
  const eventIds: string[] = [];
  const orderIds: string[] = [];
  const partnerAccountIds: string[] = [];
  const catalogPackages: Awaited<ReturnType<typeof getActivePackages>> = [];
  let ownerId = "";
  let packageId = "";
  let packageRecord: Awaited<ReturnType<typeof prisma.package.findUniqueOrThrow>>;

  async function createScenario(name: string) {
    const event = await prisma.event.create({
      data: {
        ownerId,
        packageId,
        name,
        slug: `payment-${crypto.randomUUID()}`,
        status: "DRAFT",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        timeZone: "Asia/Jakarta",
      },
      select: { id: true },
    });
    eventIds.push(event.id);
    const order = await prisma.order.create({
      data: {
        orderNumber: `OL-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
        userId: ownerId,
        packageId,
        eventId: event.id,
        packageSnapshot: createPackageSnapshot(packageRecord),
        status: "PENDING",
        amount: packageRecord.price,
        currency: packageRecord.currency,
        payments: {
          create: {
            provider: "MIDTRANS",
            amount: packageRecord.price,
            status: "PENDING",
          },
        },
      },
    });
    orderIds.push(order.id);
    return order;
  }

  function stubStatusResponse(
    orderNumber: string,
    transactionStatus: string,
    fraudStatus = "accept",
  ) {
    const fetchMock = vi.fn(async () => Response.json({
      order_id: orderNumber,
      transaction_id: `midtrans-${orderNumber}`,
      status_code: "200",
      gross_amount: packageRecord.price.toFixed(2),
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function sendNotification(
    orderNumber: string,
    transactionStatus: string,
    fraudStatus = "accept",
    invalidSignature = false,
  ) {
    const statusCode = "200";
    const grossAmount = packageRecord.price.toFixed(2);
    const expectedSignature = createHash("sha512")
      .update(`${orderNumber}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`)
      .digest("hex");
    const signature = invalidSignature
      ? `${expectedSignature.startsWith("0") ? "1" : "0"}${expectedSignature.slice(1)}`
      : expectedSignature;
    const response = await midtransWebhook(new Request("http://localhost/api/payments/midtrans/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        order_id: orderNumber,
        status_code: statusCode,
        gross_amount: grossAmount,
        transaction_status: transactionStatus,
        fraud_status: fraudStatus,
        signature_key: signature,
      }),
    }));
    return response;
  }

  beforeAll(async () => {
    if (!databaseAvailable) return;
    vi.stubEnv("MIDTRANS_SERVER_KEY", "integration-test-server-key");
    vi.stubEnv("MIDTRANS_ENVIRONMENT", "sandbox");
    await prisma.$connect();
    catalogPackages.push(...await getActivePackages());
    const owner = await prisma.user.create({
      data: {
        email: `${suffix}@payments.test`,
        name: "Payment integration",
        role: "ORGANIZER",
      },
      select: { id: true },
    });
    ownerId = owner.id;
    packageRecord = await prisma.package.create({
      data: {
        name: `Integration ${suffix}`,
        guestCapacity: 5,
        isUnlimited: false,
        price: 25000,
        currency: "IDR",
        storageLimitBytes: 123456789n,
        photoLimit: 200,
        videoLimit: 20,
        videoDurationLimit: 15,
        eventDurationDays: 2,
        retentionDays: 30,
        isActive: true,
      },
    });
    packageId = packageRecord.id;
  });

  afterAll(async () => {
    if (!databaseAvailable) return;
    if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (eventIds.length) await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    if (partnerAccountIds.length) await prisma.partnerAccount.deleteMany({ where: { id: { in: partnerAccountIds } } });
    if (packageId) await prisma.package.deleteMany({ where: { id: packageId } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
    if (originalMidtransKey !== undefined) process.env.MIDTRANS_SERVER_KEY = originalMidtransKey;
    if (originalMidtransEnvironment !== undefined) process.env.MIDTRANS_ENVIRONMENT = originalMidtransEnvironment;
    vi.unstubAllGlobals();
  });

  it("loads all configured package tiers and reports price readiness from database values", () => {
    const packageNames = new Set(catalogPackages.map((item) => item.name));
    expect([...packageNames]).toEqual(expect.arrayContaining(["BASIC", "PREMIUM", "EXCLUSIVE"]));
    for (const item of catalogPackages) {
      expect(item.priceConfigured).toBe(Number(item.price) > 0 && item.currency === "IDR");
    }
  });

  it("restricts order lookup by organizer ownership and preserves the price snapshot", async () => {
    const order = await createScenario("Snapshot event");
    expect(await getOrganizerOrder(order.id, "not-the-owner")).toBeNull();
    const before = await getOrganizerOrder(order.id, ownerId);
    expect(before?.packageSnapshot).toMatchObject({ price: "25000", storageLimitBytes: "123456789" });

    await prisma.package.update({ where: { id: packageId }, data: { price: 50000 } });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.amount.toNumber()).toBe(25000);
    expect(after.packageSnapshot).toMatchObject({ price: "25000", storageLimitBytes: "123456789" });
    packageRecord = await prisma.package.update({ where: { id: packageId }, data: { price: 25000 } });
  });

  it("creates and reuses a persisted Midtrans checkout link without duplicate payment rows", async () => {
    const order = await createScenario("Checkout event");
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return Response.json({
        token: "sandbox-token",
        redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/sandbox-token",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all([
      createCheckoutForOrder(order.id, ownerId),
      createCheckoutForOrder(order.id, ownerId),
    ]);

    expect(results).toEqual([
      "https://app.sandbox.midtrans.com/snap/v2/vtweb/sandbox-token",
      "https://app.sandbox.midtrans.com/snap/v2/vtweb/sandbox-token",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.payment.count({ where: { orderId: order.id, provider: "MIDTRANS" } })).toBe(1);

    stubStatusResponse(order.orderNumber, "pending");
    expect(await createCheckoutForOrder(order.id, ownerId))
      .toBe("https://app.sandbox.midtrans.com/snap/v2/vtweb/sandbox-token");
  });

  it("rejects an invalid webhook signature without changing order or event", async () => {
    const order = await createScenario("Invalid signature event");
    const fetchMock = stubStatusResponse(order.orderNumber, "settlement");
    const invalid = await sendNotification(order.orderNumber, "settlement", "accept", true);
    expect(invalid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: order.eventId! } })).status).toBe("DRAFT");
  });

  it("keeps pending payments inactive and activates only after verified settlement, idempotently", async () => {
    const order = await createScenario("Settlement event");
    stubStatusResponse(order.orderNumber, "pending");
    expect((await sendNotification(order.orderNumber, "pending")).status).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: order.eventId! } })).status).toBe("DRAFT");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: order.eventId! },
      select: { slug: true },
    });

    it("counts a verified partner payment once and never lowers the earned tier after a refund", async () => {
      const account = await prisma.partnerAccount.create({
        data: {
          userId: ownerId,
          businessName: `Partner ${suffix}`,
          status: "ACTIVE",
        },
      });
      partnerAccountIds.push(account.id);
      const order = await createScenario("Partner settlement event");
      await prisma.order.update({
        where: { id: order.id },
        data: { partnerAccountId: account.id, clientName: "Integration client" },
      });

      stubStatusResponse(order.orderNumber, "settlement");
      expect((await sendNotification(order.orderNumber, "settlement")).status).toBe(200);
      expect((await sendNotification(order.orderNumber, "settlement")).status).toBe(200);
      let [paidOrder, paidPartner] = await Promise.all([
        prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
        prisma.partnerAccount.findUniqueOrThrow({ where: { id: account.id } }),
      ]);
      expect(paidPartner.paidOrderCount).toBe(1);
      expect(paidOrder.tierCountedAt).not.toBeNull();

      stubStatusResponse(order.orderNumber, "refund");
      expect((await sendNotification(order.orderNumber, "refund")).status).toBe(200);
      [paidOrder, paidPartner] = await Promise.all([
        prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
        prisma.partnerAccount.findUniqueOrThrow({ where: { id: account.id } }),
      ]);
      expect(paidOrder.status).toBe("REFUNDED");
      expect(paidPartner.paidOrderCount).toBe(1);
    });
    const guestSessionResponse = await createGuestSession(
      new Request(`http://localhost/api/events/${event.slug}/guest-session`, { method: "POST" }),
      { params: Promise.resolve({ slug: event.slug }) },
    );
    const uploadResponse = await uploadGuestMemory(
      new Request(`http://localhost/api/events/${event.slug}/memories`, { method: "POST" }),
      { params: Promise.resolve({ slug: event.slug }) },
    );
    expect(guestSessionResponse.status).toBe(404);
    expect(uploadResponse.status).toBe(404);

    stubStatusResponse(order.orderNumber, "settlement");
    expect((await sendNotification(order.orderNumber, "settlement")).status).toBe(200);
    expect((await sendNotification(order.orderNumber, "settlement")).status).toBe(200);
    const [paidOrder, activeEvent, payment, storage] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.event.findUniqueOrThrow({ where: { id: order.eventId! } }),
      prisma.payment.findUniqueOrThrow({ where: { orderId_provider: { orderId: order.id, provider: "MIDTRANS" } } }),
      prisma.storageUsage.findUnique({ where: { eventId: order.eventId! } }),
    ]);
    expect(paidOrder.status).toBe("PAID");
    expect(payment.status).toBe("PAID");
    expect(payment.providerRef).toBe(`midtrans-${order.orderNumber}`);
    expect(activeEvent.status).toBe("UPCOMING");
    expect(storage?.quotaBytes).toBe(123456789n);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);

    stubStatusResponse(order.orderNumber, "pending");
    await sendNotification(order.orderNumber, "pending");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
  });

  it.each([
    ["capture", "accept", "PAID", "UPCOMING"],
    ["capture", "challenge", "PENDING", "DRAFT"],
    ["deny", "accept", "FAILED", "DRAFT"],
    ["expire", "accept", "EXPIRED", "DRAFT"],
    ["cancel", "accept", "CANCELLED", "DRAFT"],
  ])("maps Midtrans %s/%s without activating an unpaid event", async (transactionStatus, fraudStatus, orderStatus, eventStatus) => {
    const order = await createScenario(`Status ${transactionStatus} ${fraudStatus}`);
    stubStatusResponse(order.orderNumber, transactionStatus, fraudStatus);
    const response = await sendNotification(order.orderNumber, transactionStatus, fraudStatus);
    expect(response.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(orderStatus);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: order.eventId! } })).status).toBe(eventStatus);
  });
});
