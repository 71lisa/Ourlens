export function shouldIssueReferralReward({
  referralEnabled,
  isOrdinaryBuyer,
  referralPending,
  hasPreviousPaidOrder,
}: {
  referralEnabled: boolean;
  isOrdinaryBuyer: boolean;
  referralPending: boolean;
  hasPreviousPaidOrder: boolean;
}): boolean {
  return referralEnabled && isOrdinaryBuyer && referralPending && !hasPreviousPaidOrder;
}
