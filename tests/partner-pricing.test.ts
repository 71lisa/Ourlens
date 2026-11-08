import { describe, expect, it } from "vitest";
import { calculatePartnerPrice } from "../src/server/partners/pricing";

const tiers = [
  { minPaidOrders: 1, discountPercent: 10 },
  { minPaidOrders: 10, discountPercent: 12 },
  { minPaidOrders: 20, discountPercent: 15 },
  { minPaidOrders: 30, discountPercent: 20 },
];

describe("calculatePartnerPrice", () => {
  it.each([
    [0, 10],
    [1, 10],
    [9, 10],
    [10, 12],
    [19, 12],
    [20, 15],
    [29, 15],
    [30, 20],
    [100, 20],
  ])("applies the highest paid-order tier at count %i", (paidOrderCount, discountPercent) => {
    const result = calculatePartnerPrice({ basePrice: 199000, paidOrderCount, tiers });
    expect(result.discountPercent).toBe(discountPercent);
    expect(result.finalPrice).toBe(Math.round(199000 * (100 - discountPercent) / 100));
  });

  it("applies the entry tier to the first order before it is counted as paid", () => {
    const result = calculatePartnerPrice({
      basePrice: 199000,
      paidOrderCount: 0,
      tiers,
    });

    expect(result).toMatchObject({
      basePrice: 199000,
      finalPrice: 179100,
      discountPercent: 10,
      paidOrdersAtPurchase: 0,
      tierMinPaidOrders: 1,
      customPriceApplied: false,
    });
  });

  it("uses a custom price instead of stacking a tier discount", () => {
    const result = calculatePartnerPrice({
      basePrice: 199000,
      paidOrderCount: 30,
      tiers,
      customPrice: 150000,
    });
    expect(result.finalPrice).toBe(150000);
    expect(result.discountPercent).toBe(0);
    expect(result.customPriceApplied).toBe(true);
  });

  it("never applies a tier above the 20% limit", () => {
    const result = calculatePartnerPrice({
      basePrice: 100000,
      paidOrderCount: 30,
      tiers: [...tiers, { minPaidOrders: 30, discountPercent: 25 }],
    });
    expect(result.discountPercent).toBe(20);
    expect(result.finalPrice).toBe(80000);
  });

  it("rejects invalid prices and counts", () => {
    expect(() => calculatePartnerPrice({ basePrice: 0, paidOrderCount: 0, tiers })).toThrow();
    expect(() => calculatePartnerPrice({ basePrice: 1000, paidOrderCount: -1, tiers })).toThrow();
  });
});
