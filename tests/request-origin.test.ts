import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));

import { hasValidRequestOrigin } from "@/lib/request-origin";

describe("guest request origin validation", () => {
  it("accepts the configured browser origin when Next runs on an internal host", () => {
    const request = new Request("http://0.0.0.0:3000/api/events/event/guest-session", {
      headers: { origin: "http://localhost:3000" },
    });

    expect(hasValidRequestOrigin(request)).toBe(true);
  });

  it("rejects origins that do not match the configured app", () => {
    const request = new Request("http://0.0.0.0:3000/api/events/event/guest-session", {
      headers: { origin: "https://attacker.example" },
    });

    expect(hasValidRequestOrigin(request)).toBe(false);
  });

  it("allows requests without an Origin header", () => {
    const request = new Request("http://0.0.0.0:3000/api/events/event/guest-session");

    expect(hasValidRequestOrigin(request)).toBe(true);
  });

  it("accepts a request whose URL and Origin use the same local origin without an explicit port", () => {
    const request = new Request("http://localhost/api/events/event/guest-session", {
      headers: { origin: "http://localhost" },
    });

    expect(hasValidRequestOrigin(request)).toBe(true);
  });

  it("accepts a LAN IP origin matching the request host when Next uses an internal URL", () => {
    const request = new Request("http://0.0.0.0:3000/api/events/event/guest-session", {
      headers: {
        host: "192.168.1.8:3000",
        origin: "http://192.168.1.8:3000",
      },
    });

    expect(hasValidRequestOrigin(request)).toBe(true);
  });

  it("accepts a forwarded HTTPS origin matching the public proxy host", () => {
    const request = new Request("http://0.0.0.0:3000/api/events/event/guest-session", {
      headers: {
        host: "internal:3000",
        origin: "https://photos.example",
        "x-forwarded-host": "photos.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(hasValidRequestOrigin(request)).toBe(true);
  });

  it("rejects a foreign origin even when the request uses the LAN host", () => {
    const request = new Request("http://0.0.0.0:3000/api/events/event/guest-session", {
      headers: {
        host: "192.168.1.8:3000",
        origin: "http://attacker.example",
      },
    });

    expect(hasValidRequestOrigin(request)).toBe(false);
  });
});
