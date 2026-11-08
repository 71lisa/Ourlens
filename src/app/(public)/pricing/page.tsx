import { getActivePackages } from "@/server/packages/catalog";
import { PricingClient } from "./pricing-client";

export default async function PricingPage() {
  const packages = await getActivePackages();
  return <PricingClient packages={packages} />;
}
