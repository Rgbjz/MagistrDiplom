import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
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

async function refreshAccessToken(token: {
  accessToken: string;
  refreshToken: string;
  accessTokenExpires: number;
  id: number;
  email: string;
  role: Role;
}) {
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refreshToken=${token.refreshToken}` },
    });
    if (!res.ok) throw new Error('refresh failed');
    const data = (await res.json()) as { accessToken: string };
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [];
    const newRefresh = parseRefreshCookie(setCookies) ?? token.refreshToken;
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
        token.id = Number(user.id);
        token.email = user.email;
        token.role = user.role;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = user.accessTokenExpires;
        return token;
      }
      if (Date.now() < token.accessTokenExpires - 5000) {
        return token;
      }
      return refreshAccessToken(token);
    },
    session({ session, token }) {
      session.user = { id: token.id, email: token.email, role: token.role };
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
