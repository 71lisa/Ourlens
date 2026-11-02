import { createGuestToken, hashGuestToken } from "@/lib/guest-token";

export type GuestSessionRecord = {
  id: string;
  expiresAt: Date;
};

export type GuestSessionStore = {
  findValid(
    eventId: string,
    tokenHash: string,
    now: Date,
  ): Promise<GuestSessionRecord | null>;
  create(eventId: string, tokenHash: string, expiresAt: Date): Promise<GuestSessionRecord>;
};

export async function getOrCreateGuestSession(
  input: {
    eventId: string;
    existingToken?: string;
    store: GuestSessionStore;
    now?: Date;
  },
): Promise<{ session: GuestSessionRecord; token: string; reused: boolean }> {
  const now = input.now ?? new Date();

  if (input.existingToken) {
    const session = await input.store.findValid(
      input.eventId,
      hashGuestToken(input.existingToken),
      now,
    );
    if (session) {
      return { session, token: input.existingToken, reused: true };
    }
  }

  const token = createGuestToken();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const session = await input.store.create(input.eventId, hashGuestToken(token), expiresAt);
  return { session, token, reused: false };
}