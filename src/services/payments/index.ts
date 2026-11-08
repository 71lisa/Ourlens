import { LocalMockPaymentService } from "./mock";
import { MidtransPaymentService } from "./midtrans";

export function getPaymentService() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (serverKey) {
    return new MidtransPaymentService();
  }
  return new LocalMockPaymentService();
}

export { LocalMockPaymentService, MidtransPaymentService };
