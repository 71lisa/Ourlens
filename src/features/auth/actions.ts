"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/server/db/prisma";
import { logError, toUserError } from "@/lib/errors";
import { getSafePostLoginRedirect } from "@/lib/auth-redirect";
import { loginSchema, registerSchema } from "./schemas";

export type AuthActionState = {
  error?: string;
  success?: boolean;
};

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Silakan periksa data Anda." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { role: true },
    });
    const defaultRedirect = user?.role === "ADMIN"
      ? "/admin"
      : user?.role === "PARTNER"
        ? "/partner"
        : "/";
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: getSafePostLoginRedirect(formData.get("callbackUrl"), defaultRedirect, user?.role),
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email atau kata sandi tidak valid." };
    }
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    logError(error, "login");
    return { error: toUserError(error) };
  }
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Silakan periksa data Anda." };
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { error: "Akun dengan email ini sudah ada." };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const referralCode = formData.get("referralCode");
    const enteredReferralCode = typeof referralCode === "string"
      ? referralCode.trim().toUpperCase()
      : "";
    await prisma.$transaction(async (transaction) => {
      const newUser = await transaction.user.create({
        data: {
          email,
          name: parsed.data.name,
          passwordHash,
          role: "ORGANIZER",
          referralCode: `OL-${randomBytes(12).toString("hex").toUpperCase()}`,
        },
        select: { id: true },
      });
      if (!/^OL-[A-F0-9]{24}$/.test(enteredReferralCode)) return;
      const [settings, referrer] = await Promise.all([
        transaction.promotionSettings.findUnique({
          where: { id: "global" },
          select: { referralActive: true },
        }),
        transaction.user.findUnique({
          where: { referralCode: enteredReferralCode },
          select: { id: true, role: true },
        }),
      ]);
      if (
        settings?.referralActive &&
        referrer &&
        referrer.id !== newUser.id &&
        referrer.role === "ORGANIZER"
      ) {
        await transaction.referral.create({
          data: {
            referralCode: enteredReferralCode,
            referrerId: referrer.id,
            referredUserId: newUser.id,
          },
        });
      }
    });

    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Akun berhasil dibuat, tetapi masuk gagal. Silakan masuk." };
    }
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    logError(error, "register");
    return { error: toUserError(error) };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
