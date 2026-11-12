import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import type { Role } from './lib/types';
import { API_URL } from './lib/env';

const API = API_URL;

// Login failures the UI needs to tell apart; `code` reaches signIn()'s result.
class EmailNotConfirmed extends CredentialsSignin {
  code = 'email_not_confirmed';
}
class AccountBlocked extends CredentialsSignin {
  code = 'account_blocked';
}
class AccountLocked extends CredentialsSignin {
  code = 'account_locked';
}
class RateLimited extends CredentialsSignin {
  code = 'rate_limited';
}

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
      async authorize(credentials, request) {
        // Login runs on the Next server, so forward the browser's identity
        // for the "active sessions" list.
        const userAgent = request?.headers?.get('user-agent');
        const forwardedFor = request?.headers?.get('x-forwarded-for');
        const res = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(userAgent ? { 'x-client-user-agent': userAgent } : {}),
            ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
          },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password,
          }),
        });
        if (res.status === 423) throw new AccountLocked();
        if (res.status === 429) throw new RateLimited();
        if (res.status === 403) {
          const body = await res.text();
          if (/blocked/i.test(body)) throw new AccountBlocked();
          throw new EmailNotConfirmed();
        }
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
  events: {
    // signOut() only clears the NextAuth cookie; also revoke the backend
    // session so the stored refresh token can't be used again.
    async signOut(message) {
      const token = 'token' in message ? message.token : null;
      const refreshToken = token?.refreshToken as string | undefined;
      if (!refreshToken) return;
      try {
        await fetch(`${API}/auth/logout`, {
          method: 'POST',
          headers: { Cookie: `refreshToken=${refreshToken}` },
        });
      } catch {
        // The backend may be asleep; the session still expires on its own.
      }
    },
  },
});
