const FALLBACK_APP_URL = "http://localhost:3000";

function getAppOrigin(): string {
  return new URL(process.env.NEXT_PUBLIC_APP_URL || FALLBACK_APP_URL).origin;
}

export function getSignInRedirect(requestUrl: string): Response {
  const request = new URL(requestUrl);
  const loginUrl = new URL("/login", getAppOrigin());
  loginUrl.searchParams.set("callbackUrl", `${request.pathname}${request.search}`);
  return Response.redirect(loginUrl);
}

export function getSafeAuthRedirect(url: string, baseUrl: string): string {
  const appOrigin = getAppOrigin();
  try {
    const destination = new URL(url, appOrigin);
    const baseOrigin = new URL(baseUrl).origin;
    if (destination.origin === appOrigin || destination.origin === baseOrigin) {
      return `${appOrigin}${destination.pathname}${destination.search}${destination.hash}`;
    }
  } catch {
    return appOrigin;
  }
  return appOrigin;
}

export function getSafePostLoginRedirect(
  value: FormDataEntryValue | null,
  fallback = "/",
  role?: string,
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  const destination = new URL(value, FALLBACK_APP_URL);
  const isAdminPath =
    destination.pathname === "/admin" || destination.pathname.startsWith("/admin/");
  const isDashboardPath =
    destination.pathname === "/dashboard" || destination.pathname.startsWith("/dashboard/");
  const isPartnerPath =
    destination.pathname === "/partner" || destination.pathname.startsWith("/partner/");
  const isAllowedPath = role === "ADMIN"
    ? isAdminPath
    : role === "PARTNER"
      ? isPartnerPath
      : !isAdminPath &&
        (destination.pathname === "/" || isDashboardPath || (role === undefined && isPartnerPath));
  if (
    destination.origin !== FALLBACK_APP_URL ||
    !isAllowedPath
  ) {
    return fallback;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
