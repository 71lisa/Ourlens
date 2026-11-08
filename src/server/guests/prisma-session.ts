import { prisma } from "@/server/db/prisma";
import type { GuestSessionStore } from "./session";

export const prismaGuestSessionStore: GuestSessionStore = {
  async findValid(eventId, tokenHash, now) {
    return prisma.guestSession.findFirst({
      where: { eventId, tokenHash, expiresAt: { gt: now } },
      select: { id: true, expiresAt: true, displayName: true },
    });
  },
  async updateDisplayName(sessionId, displayName) {
    return prisma.guestSession.update({
      where: { id: sessionId },
      data: { displayName },
      select: { id: true, expiresAt: true, displayName: true },
    });
  },
  async create(eventId, tokenHash, expiresAt, displayName, guestCapacity) {
    if (guestCapacity !== undefined && guestCapacity !== null) {
      return prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
        const guestCount = await transaction.guestSession.count({ where: { eventId } });
        if (guestCount >= guestCapacity) return null;

        return transaction.guestSession.create({
          data: { eventId, tokenHash, expiresAt, displayName },
          select: { id: true, expiresAt: true, displayName: true },
        });
      });
    }

    return prisma.guestSession.create({
      data: { eventId, tokenHash, expiresAt, displayName },
      select: { id: true, expiresAt: true, displayName: true },
    });
  },
};