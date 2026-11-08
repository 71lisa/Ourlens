export type PartnerDiscountTier = {
  minPaidOrders: number;
  discountPercent: number;
};

export type PartnerPriceResult = {
  basePrice: number;
  finalPrice: number;
  discountPercent: number;
  paidOrdersAtPurchase: number;
  tierMinPaidOrders: number | null;
  customPriceApplied: boolean;
};

export function getPartnerDiscountTier(
  paidOrderCount: number,
  tiers: PartnerDiscountTier[],
): PartnerDiscountTier | null {
  if (!Number.isSafeInteger(paidOrderCount) || paidOrderCount < 0) {
    throw new Error("The paid order count is invalid.");
  }
  const orderedTiers = [...tiers]
    .filter((item) =>
      Number.isSafeInteger(item.minPaidOrders) &&
      item.minPaidOrders > 0 &&
      Number.isSafeInteger(item.discountPercent) &&
      item.discountPercent >= 0 &&
      item.discountPercent <= 20)
    .sort((left, right) => left.minPaidOrders - right.minPaidOrders);

  if (paidOrderCount === 0) {
    return orderedTiers[0] ?? null;
  }

  return orderedTiers.filter((item) => item.minPaidOrders <= paidOrderCount).at(-1) ?? null;
}

export function calculatePartnerPrice(input: {
  basePrice: number;
  paidOrderCount: number;
  tiers: PartnerDiscountTier[];
  customPrice?: number | null;
}): PartnerPriceResult {
  if (!Number.isSafeInteger(input.basePrice) || input.basePrice <= 0) {
    throw new Error("The package price must be a positive whole IDR amount.");
  }
  const tier = getPartnerDiscountTier(input.paidOrderCount, input.tiers);
  const customPrice = input.customPrice ?? null;
  if (customPrice !== null && (!Number.isSafeInteger(customPrice) || customPrice <= 0)) {
    throw new Error("The custom package price must be a positive whole IDR amount.");
  }

  const discountPercent = tier?.discountPercent ?? 0;
  return {
    basePrice: input.basePrice,
    finalPrice: customPrice ?? Math.round(input.basePrice * (100 - discountPercent) / 100),
    discountPercent: customPrice === null ? discountPercent : 0,
    paidOrdersAtPurchase: input.paidOrderCount,
    tierMinPaidOrders: customPrice === null ? tier?.minPaidOrders ?? null : null,
    customPriceApplied: customPrice !== null,
  };
}
