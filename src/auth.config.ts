import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types/domain";
import { getSafeAuthRedirect, getSignInRedirect } from "@/lib/auth-redirect";

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    redirect({ url, baseUrl }) {
      return getSafeAuthRedirect(url, baseUrl);
    },
    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      const role = (auth?.user as { role?: UserRole } | undefined)?.role;

      if (pathname.startsWith("/admin")) {
        return role === "ADMIN" || getSignInRedirect(request.url);
      }

      if (pathname.startsWith("/dashboard")) {
        return role === "ADMIN" || role === "ORGANIZER" || role === "PARTNER" ||
          getSignInRedirect(request.url);
      }

      if (pathname === "/partner/apply") {
        return true;
      }

      if (pathname.startsWith("/partner")) {
        return Boolean(auth?.user) || getSignInRedirect(request.url);
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: UserRole }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
