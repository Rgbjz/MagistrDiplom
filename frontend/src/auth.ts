import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import type { Role } from './lib/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

// Decode a JWT's `exp` (seconds) into epoch milliseconds; fallback +15m.
function accessTokenExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'),
    ) as { exp?: number };
    if (payload.exp) return payload.exp * 1000;
  } catch {
    // ignore
  }
  return Date.now() + 15 * 60 * 1000;
}

// Pull the `refreshToken` value out of an array of Set-Cookie header strings.
function parseRefreshCookie(setCookies: string[]): string | null {
  for (const c of setCookies) {
    const m = /(?:^|;\s*)refreshToken=([^;]+)/.exec(c);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refreshToken=${token.refreshToken as string}` },
    });
    if (!res.ok) throw new Error('refresh failed');
    const data = (await res.json()) as { accessToken: string };
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [];
    const newRefresh =
      parseRefreshCookie(setCookies) ?? (token.refreshToken as string);
    return {
      ...token,
      accessToken: data.accessToken,
      refreshToken: newRefresh,
      accessTokenExpires: accessTokenExpiry(data.accessToken),
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const res = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password,
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          user: { id: number; email: string; role: Role };
          accessToken: string;
        };
        const setCookies =
          typeof res.headers.getSetCookie === 'function'
            ? res.headers.getSetCookie()
            : [];
        const refreshToken = parseRefreshCookie(setCookies);
        if (!refreshToken) return null;
        return {
          id: String(data.user.id),
          email: data.user.email,
          role: data.user.role,
          accessToken: data.accessToken,
          refreshToken,
          accessTokenExpires: accessTokenExpiry(data.accessToken),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const t = token as Record<string, unknown>;
        t.id = Number(user.id);
        t.email = user.email;
        t.role = user.role;
        t.accessToken = user.accessToken;
        t.refreshToken = user.refreshToken;
        t.accessTokenExpires = user.accessTokenExpires;
        return token;
      }
      if (Date.now() < (token.accessTokenExpires as number) - 5000) {
        return token;
      }
      return refreshAccessToken(token);
    },
    session({ session, token }) {
      const u = session.user as { id: number; role: Role };
      u.id = token.id as number;
      u.role = token.role as Role;
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
});
