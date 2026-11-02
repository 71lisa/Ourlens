import { prisma } from "@/server/db/prisma";
import type { GuestSessionStore } from "./session";

export const prismaGuestSessionStore: GuestSessionStore = {
  async findValid(eventId, tokenHash, now) {
    return prisma.guestSession.findFirst({
      where: { eventId, tokenHash, expiresAt: { gt: now } },
      select: { id: true, expiresAt: true },
    });
  },
  async create(eventId, tokenHash, expiresAt) {
    return prisma.guestSession.create({
      data: { eventId, tokenHash, expiresAt },
      select: { id: true, expiresAt: true },
    });
  },
};