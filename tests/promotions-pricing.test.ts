import { describe, expect, it } from "vitest";
import { isPhotoLimitReached } from "@/server/promotions/free-trial";
import { calculateBuyerPromotion } from "@/server/promotions/pricing";
import { shouldIssueReferralReward } from "@/server/promotions/referral";

describe("calculateBuyerPromotion", () => {
  it("applies the 15% first-event discount automatically", () => {
    expect(calculateBuyerPromotion({
      baseAmount: 100_000,
      firstEventEligible: true,
      firstEventActive: true,
      referralActive: true,
    })).toEqual({
      baseAmount: 100_000,
      discountAmount: 15_000,
      finalAmount: 85_000,
      promotionType: "FIRST_EVENT",
    });

  });

  it("does not apply the first-event discount when inactive or ineligible", () => {
    for (const options of [
      { firstEventEligible: false, firstEventActive: true },
      { firstEventEligible: true, firstEventActive: false },
    ]) {
      expect(calculateBuyerPromotion({
        baseAmount: 100_000,
        referralActive: true,
        ...options,
      }).discountAmount).toBe(0);
    }
  });

  it("uses a referral voucher instead of combining promotions", () => {
    expect(calculateBuyerPromotion({
      baseAmount: 100_000,
      firstEventEligible: true,
      firstEventActive: true,
      referralActive: true,
      voucherAmount: 20_000,
    })).toEqual({
      baseAmount: 100_000,
      discountAmount: 20_000,
      finalAmount: 80_000,
      promotionType: "REFERRAL_VOUCHER",
    });
  });

  describe("referral rewards", () => {
    it("issues a reward only for an active referral on the referred organizer's first paid order", () => {
      expect(shouldIssueReferralReward({
        referralEnabled: true,
        isOrdinaryBuyer: true,
        referralPending: true,
        hasPreviousPaidOrder: false,
      })).toBe(true);

      for (const disabledCondition of [
        { referralEnabled: false },
        { isOrdinaryBuyer: false },
        { referralPending: false },
        { hasPreviousPaidOrder: true },
      ]) {
        expect(shouldIssueReferralReward({
          referralEnabled: true,
          isOrdinaryBuyer: true,
          referralPending: true,
          hasPreviousPaidOrder: false,
          ...disabledCondition,
        })).toBe(false);
      }
    });
  });

  describe("free-trial photo limit", () => {
    it("allows up to ten photos and blocks the next upload", () => {
      expect(isPhotoLimitReached(9, 10)).toBe(false);
      expect(isPhotoLimitReached(10, 10)).toBe(true);
      expect(isPhotoLimitReached(0, null)).toBe(false);
    });
  });

  it("does not allow a voucher to make a paid order free", () => {
    expect(() => calculateBuyerPromotion({
      baseAmount: 10_000,
      firstEventEligible: false,
      firstEventActive: true,
      referralActive: true,
      voucherAmount: 20_000,
    })).toThrow();
  });

  it("rejects invalid prices and inactive vouchers", () => {
    expect(() => calculateBuyerPromotion({
      baseAmount: 0,
      firstEventEligible: false,
      firstEventActive: true,
      referralActive: true,
    })).toThrow();
    expect(() => calculateBuyerPromotion({
      baseAmount: 100_000,
      firstEventEligible: true,
      firstEventActive: true,
      referralActive: false,
      voucherAmount: 20_000,
    })).toThrow();
  });
});
