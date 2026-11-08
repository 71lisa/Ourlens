import { createGuestToken, hashGuestToken } from "@/lib/guest-token";

export type GuestSessionRecord = {
  id: string;
  expiresAt: Date;
  displayName: string | null;
};

export type GuestSessionStore = {
  findValid(
    eventId: string,
    tokenHash: string,
    now: Date,
  ): Promise<GuestSessionRecord | null>;
  updateDisplayName?(
    sessionId: string,
    displayName: string,
  ): Promise<GuestSessionRecord>;
  create(
    eventId: string,
    tokenHash: string,
    expiresAt: Date,
    displayName: string,
    guestCapacity?: number | null,
  ): Promise<GuestSessionRecord | null>;
};

export class GuestSessionCapacityError extends Error {
  constructor() {
    super("The event has reached its guest capacity.");
    this.name = "GuestSessionCapacityError";
  }
}

export class GuestSessionNameRequiredError extends Error {
  constructor() {
    super("A guest name is required before creating a session.");
    this.name = "GuestSessionNameRequiredError";
  }
}

export async function getOrCreateGuestSession(
  input: {
    eventId: string;
    existingToken?: string;
    displayName?: string;
    store: GuestSessionStore;
    guestCapacity?: number | null;
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
      if (!session.displayName && input.displayName) {
        const updated = await input.store.updateDisplayName?.(
          session.id,
          input.displayName,
        );
        if (updated) {
          return { session: updated, token: input.existingToken, reused: true };
        }
        return {
          session: { ...session, displayName: input.displayName },
          token: input.existingToken,
          reused: true,
        };
      }
      return { session, token: input.existingToken, reused: true };
    }
  }

  const displayName = input.displayName?.trim();
  if (!displayName) throw new GuestSessionNameRequiredError();
  const token = createGuestToken();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const session = await input.store.create(
    input.eventId,
    hashGuestToken(token),
    expiresAt,
    displayName,
    input.guestCapacity,
  );
  if (!session) throw new GuestSessionCapacityError();
  return { session, token, reused: false };
}