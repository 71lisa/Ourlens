export type BuyerPromotionQuote = {
  baseAmount: number;
  discountAmount: number;
  finalAmount: number;
  promotionType: "FIRST_EVENT" | "REFERRAL_VOUCHER" | null;
};

export function calculateBuyerPromotion({
  baseAmount,
  firstEventEligible,
  firstEventActive,
  referralActive,
  voucherAmount,
}: {
  baseAmount: number;
  firstEventEligible: boolean;
  firstEventActive: boolean;
  referralActive: boolean;
  voucherAmount?: number;
}): BuyerPromotionQuote {
  if (!Number.isSafeInteger(baseAmount) || baseAmount <= 0) {
    throw new Error("The package price must be a positive whole number.");
  }

  if (voucherAmount !== undefined) {
    if (
      !referralActive ||
      !Number.isSafeInteger(voucherAmount) ||
      voucherAmount <= 0 ||
      voucherAmount >= baseAmount
    ) {
      throw new Error("The referral voucher is invalid or inactive.");
    }
    const discountAmount = voucherAmount;
    return {
      baseAmount,
      discountAmount,
      finalAmount: baseAmount - discountAmount,
      promotionType: "REFERRAL_VOUCHER",
    };
  }

  const discountAmount = firstEventEligible && firstEventActive
    ? Math.round(baseAmount * 0.15)
    : 0;
  return {
    baseAmount,
    discountAmount,
    finalAmount: baseAmount - discountAmount,
    promotionType: discountAmount > 0 ? "FIRST_EVENT" : null,
  };
}