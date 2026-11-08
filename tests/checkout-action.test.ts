import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createCheckoutForOrder: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({
  publicEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://192.168.1.8:3000" }),
}));
vi.mock("@/server/orders/service", () => ({
  createCheckoutForOrder: mocks.createCheckoutForOrder,
}));

import { continueCheckoutAction } from "@/features/orders/actions";

describe("checkout action redirects", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    "http://192.168.1.8:3000/api/payments/mock?orderNumber=OL-test",
    "http://localhost:3000/api/payments/mock?orderNumber=OL-test",
  ])("keeps local mock checkout on the browser's current origin for %s", async (checkoutUrl) => {
    mocks.auth.mockResolvedValue({ user: { id: "organizer-1", role: "ORGANIZER" } });
    mocks.createCheckoutForOrder.mockResolvedValue(checkoutUrl);
    const formData = new FormData();
    formData.set("orderId", "order-1");

    await expect(continueCheckoutAction({}, formData)).resolves.toEqual({
      checkoutUrl: "/api/payments/mock?orderNumber=OL-test",
    });
  });

  it("preserves external payment provider checkout URLs", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "organizer-1", role: "ORGANIZER" } });
    mocks.createCheckoutForOrder.mockResolvedValue("https://payments.example/checkout/session-1");
    const formData = new FormData();
    formData.set("orderId", "order-1");

    await expect(continueCheckoutAction({}, formData)).resolves.toEqual({
      checkoutUrl: "https://payments.example/checkout/session-1",
    });
  });
});
