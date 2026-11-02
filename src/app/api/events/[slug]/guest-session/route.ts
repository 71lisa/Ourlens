import { NextResponse } from "next/server";
import { consumeRateLimit, getRateLimitClientKey } from "@/lib/rate-limit";
import { readGuestToken } from "@/lib/guest-token";
import { prisma } from "@/server/db/prisma";
import { canAcceptGuestContributions } from "@/server/authorization/policies";
import { getOrCreateGuestSession } from "@/server/guests/session";
import { prismaGuestSessionStore } from "@/server/guests/prisma-session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Request could not be verified." }, { status: 403 });
  }

  const { slug } = await params;
  const sessionLimit = consumeRateLimit(
    `guest-session:${slug}:${getRateLimitClientKey(request)}`,
    30,
    60 * 1000,
  );
  if (!sessionLimit.allowed) {
    return NextResponse.json(
      { error: "Too many guest sessions. Please wait before trying again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(sessionLimit.retryAfterMs / 1000)) },
      },
    );
  }

  const token = readGuestToken(request, slug);
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      privacyMode: true,
      status: true,
      expiresAt: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
    },
  });
  const guestAccessEvent = event ? { ...event, isPaid: event.orders.length > 0 } : null;
  const now = new Date();
  if (!event || !guestAccessEvent || !canAcceptGuestContributions(guestAccessEvent, now)) {
    return NextResponse.json({ error: "This event is not available." }, { status: 404 });
  }

  const cookieName = `ourlens_guest_${slug}`;
  const session = await getOrCreateGuestSession({
    eventId: event.id,
    existingToken: token,
    store: prismaGuestSessionStore,
  });

  const response = NextResponse.json({ ready: true });
  if (!session.reused) {
    response.cookies.set(cookieName, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: `/api/events/${slug}`,
      expires: session.session.expiresAt,
    });
  }
  return response;
}