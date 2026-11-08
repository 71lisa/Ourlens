import { describe, expect, it } from "vitest";
import {
  getSafeAuthRedirect,
  getSafePostLoginRedirect,
  getSignInRedirect,
} from "@/lib/auth-redirect";

describe("authentication redirects", () => {
  it("uses the configured app host instead of the internal Next.js host", () => {
    const response = getSignInRedirect("http://0.0.0.0:3000/dashboard/transactions/order-1?created=1");
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.origin).toBe(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/dashboard/transactions/order-1?created=1");
  });

  it("preserves safe partner and dashboard destinations after login", () => {
    expect(getSafePostLoginRedirect("/")).toBe("/");
    expect(getSafePostLoginRedirect("/dashboard/events/create?draft=1"))
      .toBe("/dashboard/events/create?draft=1");
    expect(getSafePostLoginRedirect("/dashboard")).toBe("/dashboard");
    expect(getSafePostLoginRedirect("/partner/orders/new?retry=1")).toBe("/partner/orders/new?retry=1");
    expect(getSafePostLoginRedirect(null, "/partner")).toBe("/partner");
    expect(getSafePostLoginRedirect("/", "/partner", "PARTNER")).toBe("/partner");
  });

  it("sends admins to the admin dashboard and only allows admin destinations", () => {
    expect(getSafePostLoginRedirect(null, "/admin", "ADMIN")).toBe("/admin");
    expect(getSafePostLoginRedirect("/admin/partner-management", "/admin", "ADMIN"))
      .toBe("/admin/partner-management");
    expect(getSafePostLoginRedirect("/dashboard", "/admin", "ADMIN")).toBe("/admin");
    expect(getSafePostLoginRedirect("/admin", "/", "ORGANIZER")).toBe("/");
  });

  it("normalizes same-app auth redirects to the configured browser host", () => {
    expect(getSafeAuthRedirect(
      "http://0.0.0.0:3000/dashboard/transactions/order-1",
      "http://0.0.0.0:3000",
    )).toBe("http://localhost:3000/dashboard/transactions/order-1");
    expect(getSafeAuthRedirect(
      "https://attacker.example",
      "http://0.0.0.0:3000",
    )).toBe("http://localhost:3000");
  });

  it("rejects external or disallowed login destinations", () => {
    expect(getSafePostLoginRedirect("https://attacker.example")).toBe("/");
    expect(getSafePostLoginRedirect("//attacker.example")).toBe("/");
    expect(getSafePostLoginRedirect("/admin")).toBe("/");
    expect(getSafePostLoginRedirect("/partner-private")).toBe("/");
    expect(getSafePostLoginRedirect(null)).toBe("/");
  });
});
