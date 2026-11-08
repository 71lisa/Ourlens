import { describe, expect, it } from "vitest";
import { getRateLimitClientKey } from "../src/lib/rate-limit";

describe("getRateLimitClientKey", () => {
  it("uses the trusted real IP header before forwarded values", () => {
    const request = new Request("https://example.test", {
      headers: {
        "x-real-ip": "203.0.113.8",
        "x-forwarded-for": "198.51.100.1, 203.0.113.9",
      },
    });

    expect(getRateLimitClientKey(request)).toBe("203.0.113.8");
  });

  it("uses the last forwarded address when no real IP header is available", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.9" },
    });

    expect(getRateLimitClientKey(request)).toBe("203.0.113.9");
  });
});
