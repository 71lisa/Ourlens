import { createHash, randomBytes } from "node:crypto";

export function createGuestToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function shouldUseSecureGuestCookie(request: Request): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return new URL(request.url).protocol === "https:" || forwardedProtocol === "https";
}

export function readGuestToken(request: Request, slug: string): string | undefined {
  const cookieName = `ourlens_guest_${slug}`;
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);

  return value && /^[a-f0-9]{64}$/i.test(value) ? value : undefined;
}
