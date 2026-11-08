import { publicEnv } from "@/lib/env";

function getOrigin(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getTrustedRequestOrigin(request: Request): string {
  const configuredOrigin = new URL(publicEnv().NEXT_PUBLIC_APP_URL).origin;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin === configuredOrigin) return configuredOrigin;

  const referringOrigin = getOrigin(request.headers.get("origin"))
    ?? getOrigin(request.headers.get("referer"));
  if (!referringOrigin) return configuredOrigin;

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocols = new Set([requestUrl.protocol]);
  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    protocols.add(`${forwardedProtocol}:`);
  }
  const hosts = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
  ].filter((host): host is string => Boolean(host));

  for (const protocol of protocols) {
    for (const host of hosts) {
      try {
        const candidateOrigin = new URL(`${protocol}//${host}`).origin;
        if (candidateOrigin === referringOrigin) return candidateOrigin;
      } catch {
        continue;
      }
    }
  }

  return configuredOrigin;
}

export function hasValidRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const requestUrl = new URL(request.url);
    const configuredOrigin = new URL(publicEnv().NEXT_PUBLIC_APP_URL).origin;
    const supplied = new URL(origin);
    if (supplied.protocol !== "http:" && supplied.protocol !== "https:") return false;
    if (supplied.origin === configuredOrigin || supplied.origin === requestUrl.origin) return true;

    const protocols = new Set([requestUrl.protocol]);
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedProtocol === "http" || forwardedProtocol === "https") {
      protocols.add(`${forwardedProtocol}:`);
    }

    const hosts = [
      request.headers.get("host"),
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
    ].filter((host): host is string => Boolean(host));
    return [...protocols].some((protocol) =>
      hosts.some((host) => {
        try {
          return new URL(`${protocol}//${host}`).origin === supplied.origin;
        } catch {
          return false;
        }
      }),
    );
  } catch {
    return false;
  }
}
