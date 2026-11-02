export type CreateCheckoutInput = {
  orderNumber: string;
  amount: number;
  currency: string;
  packageName: string;
  eventName: string;
  customerEmail: string;
  customerName: string | null;
  finishUrl: string;
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
  providerToken: string;
};

export type VerifiedPaymentNotification = {
  orderNumber: string;
  transactionId: string;
  amount: string;
  transactionStatus: string;
  fraudStatus?: string;
};

export interface PaymentService {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyWebhook(payload: unknown): Promise<VerifiedPaymentNotification>;
  getTransactionStatus(orderNumber: string): Promise<VerifiedPaymentNotification>;
}
