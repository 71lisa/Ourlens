import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types/domain";

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
    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      const role = (auth?.user as { role?: UserRole } | undefined)?.role;

      if (pathname.startsWith("/admin")) {
        return role === "ADMIN";
      }

      if (pathname.startsWith("/dashboard")) {
        return role === "ADMIN" || role === "ORGANIZER" || role === "PARTNER";
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
