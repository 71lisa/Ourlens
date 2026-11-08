import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(),
  findPayment: vi.fn(),
  applyNotification: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    order: { findUnique: mocks.findOrder },
    payment: { findUnique: mocks.findPayment },
  },
}));
vi.mock("@/server/orders/service", () => ({
  applyMidtransNotification: mocks.applyNotification,
}));

import { GET as mockPayment } from "@/app/api/payments/mock/route";

describe("mock payment return redirect", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns to the configured browser host, not the internal request host", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      orderNumber: "OL-test",
      amount: "19000",
      status: "PENDING",
      eventId: "event-1",
    });
    mocks.findPayment.mockResolvedValue({ amount: "19000" });

    const response = await mockPayment(new Request(
      "http://0.0.0.0:3000/api/payments/mock?orderNumber=OL-test",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location"))
      .toBe("http://localhost:3000/dashboard/transactions/order-1?return=1");
    expect(mocks.applyNotification).toHaveBeenCalledOnce();
  });

  it("returns to the same LAN origin when checkout began there", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      orderNumber: "OL-test",
      amount: "19000",
      status: "PENDING",
      eventId: "event-1",
    });
    mocks.findPayment.mockResolvedValue({ amount: "19000" });

    const response = await mockPayment(new Request(
      "http://0.0.0.0:3000/api/payments/mock?orderNumber=OL-test",
      {
        headers: {
          host: "192.168.1.8:3000",
          referer: "http://192.168.1.8:3000/dashboard/transactions/order-1",
        },
      },
    ));

    expect(response.headers.get("location"))
      .toBe("http://192.168.1.8:3000/dashboard/transactions/order-1?return=1");
  });

  it("does not use a foreign referrer as the payment return origin", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      orderNumber: "OL-test",
      amount: "19000",
      status: "PAID",
      eventId: "event-1",
    });

    const response = await mockPayment(new Request(
      "http://0.0.0.0:3000/api/payments/mock?orderNumber=OL-test",
      {
        headers: {
          host: "192.168.1.8:3000",
          referer: "https://attacker.example/",
        },
      },
    ));

    expect(response.headers.get("location"))
      .toBe("http://localhost:3000/dashboard/transactions/order-1?return=1");
  });

  it("uses the same canonical host when the order is already paid", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      orderNumber: "OL-test",
      amount: "19000",
      status: "PAID",
      eventId: "event-1",
    });

    const response = await mockPayment(new Request(
      "http://0.0.0.0:3000/api/payments/mock?orderNumber=OL-test",
    ));

    expect(response.headers.get("location"))
      .toBe("http://localhost:3000/dashboard/transactions/order-1?return=1");
    expect(mocks.applyNotification).not.toHaveBeenCalled();
  });
});
