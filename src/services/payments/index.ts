import { MidtransPaymentService } from "./midtrans";

export function getPaymentService() {
  return new MidtransPaymentService();
}

export { MidtransPaymentService };
