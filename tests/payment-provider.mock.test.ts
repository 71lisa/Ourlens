import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaymentService } from "@/services/payments";

describe("local payment fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a local mock provider when Midtrans credentials are not configured", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "");
    vi.stubEnv("MIDTRANS_ENVIRONMENT", "sandbox");

    const service = getPaymentService();
    const checkout = await service.createCheckout({
      orderNumber: "OL-local-dev",
      amount: 19000,
      currency: "IDR",
      packageName: "5 tamu",
      eventName: "Demo event",
      customerEmail: "demo@example.com",
      customerName: "Demo Org",
      finishUrl: "http://localhost:3000/dashboard/transactions/demo?return=1",
    });

    expect(service.constructor.name).toBe("LocalMockPaymentService");
    expect(checkout.checkoutUrl).toContain("/api/payments/mock");
    expect(checkout.checkoutUrl).toContain("OL-local-dev");
  });
});
