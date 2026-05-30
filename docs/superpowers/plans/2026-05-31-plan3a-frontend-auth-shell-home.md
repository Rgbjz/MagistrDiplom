# Plan 3a — Frontend Foundation: Auth.js + Shell + Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js frontend foundation — Auth.js authentication integrated with the NestJS backend, the typed API layer, providers, the app shell (Header/Footer/Layout), Login/Register pages, and the Home course list with enroll. End state: register/login in the browser, see courses, enroll.

**Architecture:** Next.js 15 App Router + TypeScript. Auth.js (NextAuth v5) Credentials provider calls NestJS `POST /api/auth/login` server-side, stores the backend access+refresh tokens inside the encrypted session JWT, and auto-refreshes via `POST /api/auth/refresh`. Server Components fetch via a server API helper (token from `auth()`); client components use TanStack Query via a client API helper (token from the session). SCSS modules port the legacy look.

**Tech Stack:** Next.js 15, TypeScript, NextAuth v5 (`next-auth@beta`), TanStack Query, react-hook-form + zod, sass.

> **Tests out of scope.** Verification: build, dev-server boot, route-protection redirect, login page render, plus a manual browser login check (Auth.js CSRF makes full curl login impractical).

> **Env note:** Node not on default PATH — prepend `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. The backend must be running on :5000 for live checks (`cd backend && npm run start:dev`, after `lsof -ti tcp:5000 | xargs kill -9`). Frontend runs on :3000 (backend CORS already allows it). Frontend dir: `/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend`.

> **Backend contract used:** `POST /api/auth/login {email,password}` → `{user:{id,email,role}, accessToken}` + Set-Cookie `refreshToken`. `POST /api/auth/refresh` (Cookie `refreshToken`) → `{accessToken}` + rotated Set-Cookie. `POST /api/auth/register {email,password,role}`. `GET /api/courses` (Bearer) → course list (students get `enrollmentStatus`). `POST /api/courses/:id/enroll` (STUDENT).

---

## File Structure (created by this plan)

```
frontend/
  .env.local                       # MODIFY: add AUTH_SECRET (generated)
  .env.example                     # MODIFY: document vars
  src/
    auth.ts                        # NextAuth config (providers, callbacks, refresh)
    middleware.ts                  # route protection
    types/next-auth.d.ts           # session/jwt augmentation
    app/
      api/auth/[...nextauth]/route.ts
      layout.tsx                   # MODIFY: root layout + providers
      providers.tsx                # SessionProvider + QueryClientProvider
      globals.scss                 # global reset + palette (replaces globals.css)
      (auth)/
        login/page.tsx
        register/page.tsx
        auth-form.module.scss
        LoginForm.tsx
        RegisterForm.tsx
      (app)/
        layout.tsx                 # Header + main + Footer (protected shell)
        page.tsx                   # Home (course list, RSC)
        home.module.scss
    components/
      Header.tsx  Header.module.scss
      Footer.tsx  Footer.module.scss
      CourseCard.tsx  CourseCard.module.scss
    lib/
      api/server.ts                # serverApi() — RSC/server, token via auth()
      api/client.ts                # clientApi() — client, token via session
      types.ts                     # shared TS types (Role, Course, ...)
```

> Delete the scaffold's `src/app/page.tsx`, `src/app/page.module.css`, and `src/app/globals.css` (replaced).

---

## Task 1: Install deps, env, cleanup scaffold

**Files:** `frontend/package.json`, `frontend/.env.local`, `frontend/.env.example`; delete scaffold home files

- [ ] **Step 1: Install**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm install next-auth@beta @tanstack/react-query react-hook-form @hookform/resolvers zod
```

- [ ] **Step 2: Generate AUTH_SECRET into `.env.local`** (and ensure API URL present). Append/replace these keys in `frontend/.env.local`:

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
cat > .env.local <<EOF
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
AUTH_SECRET="$SECRET"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"
EOF
```

- [ ] **Step 3: Update `frontend/.env.example`** to document the vars (no real secret):

```
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
AUTH_SECRET="generate-with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"
```

- [ ] **Step 4: Remove scaffold home files** (replaced by this plan)

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
rm -f src/app/page.tsx src/app/page.module.css src/app/globals.css
```

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/package.json frontend/package-lock.json frontend/.env.example
git commit -m "chore(frontend): add auth/query/form deps; env"
```

---

## Task 2: Shared types + API helpers

**Files:** Create `frontend/src/lib/types.ts`, `frontend/src/lib/api/server.ts`, `frontend/src/lib/api/client.ts`

- [ ] **Step 1: `src/lib/types.ts`**

```typescript
export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type EnrollmentStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'COMPLETED';

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
}

export interface CourseListItem {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  teacherId: number;
  enrollmentStatus?: EnrollmentStatus | null;
}
```

- [ ] **Step 2: `src/lib/api/server.ts`** (server-only fetch with bearer token from the session)

```typescript
import { auth } from '../../auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export async function serverApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await auth();
  const token = session?.accessToken;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 3: `src/lib/api/client.ts`** (client fetch; token from the session via next-auth/react)

```typescript
'use client';

import { getSession } from 'next-auth/react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export async function clientApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await getSession();
  const token = session?.accessToken;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/lib
git commit -m "feat(frontend): add shared types and server/client API helpers"
```

---

## Task 3: Auth.js config + types + route handler + middleware

**Files:** Create `frontend/src/auth.ts`, `frontend/src/types/next-auth.d.ts`, `frontend/src/app/api/auth/[...nextauth]/route.ts`, `frontend/src/middleware.ts`

- [ ] **Step 1: `src/types/next-auth.d.ts`** (augment session + JWT)

> **next-auth v5 typing note:** v5's `JWT`/`User`/`Session` have an index signature and a non-optional default `email`. Redeclaring `email` (stricter) or fully replacing `Session.user` collapses fields to `never`. Fix: intersect `Session.user` with `DefaultSession['user']`, do NOT redeclare `email`, and in callbacks write token/session fields through casts (below).

```typescript
import type { DefaultSession } from 'next-auth';
import type { Role } from '../lib/types';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
    user: {
      id: number;
      role: Role;
    } & DefaultSession['user'];
  }

  // Extend the default user (which already has id/email/name/image)
  interface User {
    role: Role;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: number;
    role: Role;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    error?: string;
  }
}
```

- [ ] **Step 2: `src/auth.ts`** (Credentials provider → NestJS login; jwt refresh)

```typescript
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
```

- [ ] **Step 3: `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '../../../../auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 4: `src/middleware.ts`** (redirect unauthenticated users to /login)

```typescript
import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith('/login') || pathname.startsWith('/register');
  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (req.auth && isPublic) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg).*)',
  ],
};
```

- [ ] **Step 5: Build to typecheck**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: build may warn about no pages yet, but must compile `auth.ts`/middleware with no TS errors. If errors, STOP and report. (If build fails only because there is no `app/page.tsx` yet, that is resolved in Task 5 — but a type error in auth.ts/middleware is a real failure to report.)

- [ ] **Step 6: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/auth.ts frontend/src/types frontend/src/app/api frontend/src/middleware.ts
git commit -m "feat(frontend): add Auth.js (credentials + refresh), middleware, route handler"
```

---

## Task 4: Providers, root layout, global styles

**Files:** Create `frontend/src/app/providers.tsx`, `frontend/src/app/globals.scss`; replace `frontend/src/app/layout.tsx`

- [ ] **Step 1: `src/app/globals.scss`**

```scss
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background: #f8fafc;
  color: #0f172a;
}

a {
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 2: `src/app/providers.tsx`**

```typescript
'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 3: Replace `src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import './globals.scss';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Learning Platform',
  description: 'LMS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/app/providers.tsx frontend/src/app/globals.scss frontend/src/app/layout.tsx
git commit -m "feat(frontend): add providers (session + query) and root layout"
```

---

## Task 5: Login + Register pages

**Files:** Create `frontend/src/app/(auth)/auth-form.module.scss`, `LoginForm.tsx`, `login/page.tsx`, `RegisterForm.tsx`, `register/page.tsx`

- [ ] **Step 1: `src/app/(auth)/auth-form.module.scss`**

```scss
.wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f6fa;
  padding: 16px;
}

.form {
  width: 100%;
  max-width: 380px;
  background: #fff;
  padding: 32px;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;

  h1 {
    text-align: center;
    font-size: 22px;
    margin-bottom: 4px;
  }
}

.input,
.select {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #dcdde1;
  border-radius: 8px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #4c6ef5;
  }
}

.button {
  width: 100%;
  padding: 12px;
  background: #4c6ef5;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;

  &:hover {
    background: #4263eb;
  }

  &:disabled {
    background: #a5b4fc;
    cursor: not-allowed;
  }
}

.error {
  color: #e03131;
  text-align: center;
  font-size: 14px;
}

.fieldError {
  color: #e03131;
  font-size: 12px;
  margin-top: -8px;
}

.switch {
  text-align: center;
  font-size: 14px;

  a {
    color: #4c6ef5;
  }
}
```

- [ ] **Step 2: `src/app/(auth)/LoginForm.tsx`**

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import styles from './auth-form.module.scss';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await signIn('credentials', {
      ...values,
      redirect: false,
    });
    if (res?.error) {
      setServerError('Invalid email or password');
      return;
    }
    router.push('/');
    router.refresh();
  });

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={onSubmit}>
        <h1>Sign in</h1>
        <input
          className={styles.input}
          placeholder="Email"
          {...register('email')}
        />
        {errors.email && (
          <span className={styles.fieldError}>{errors.email.message}</span>
        )}
        <input
          className={styles.input}
          type="password"
          placeholder="Password"
          {...register('password')}
        />
        {errors.password && (
          <span className={styles.fieldError}>{errors.password.message}</span>
        )}
        {serverError && <p className={styles.error}>{serverError}</p>}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className={styles.switch}>
          No account? <Link href="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: `src/app/(auth)/login/page.tsx`**

```typescript
import { LoginForm } from '../LoginForm';

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 4: `src/app/(auth)/RegisterForm.tsx`**

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import styles from './auth-form.module.scss';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 characters'),
  role: z.enum(['STUDENT', 'TEACHER']),
});

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'STUDENT' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setServerError('Registration failed (email may be taken)');
      return;
    }
    const login = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (login?.error) {
      setServerError('Registered, but auto sign-in failed. Try logging in.');
      return;
    }
    router.push('/');
    router.refresh();
  });

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={onSubmit}>
        <h1>Create account</h1>
        <input
          className={styles.input}
          placeholder="Email"
          {...register('email')}
        />
        {errors.email && (
          <span className={styles.fieldError}>{errors.email.message}</span>
        )}
        <input
          className={styles.input}
          type="password"
          placeholder="Password"
          {...register('password')}
        />
        {errors.password && (
          <span className={styles.fieldError}>{errors.password.message}</span>
        )}
        <select className={styles.select} {...register('role')}>
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
        </select>
        {serverError && <p className={styles.error}>{serverError}</p>}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Register'}
        </button>
        <p className={styles.switch}>
          Have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: `src/app/(auth)/register/page.tsx`**

```typescript
import { RegisterForm } from '../RegisterForm';

export default function RegisterPage() {
  return <RegisterForm />;
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add "frontend/src/app/(auth)"
git commit -m "feat(frontend): add login and register pages (react-hook-form + zod + Auth.js)"
```

---

## Task 6: App shell (Header, Footer) + Home + CourseCard

**Files:** Create `frontend/src/components/Header.tsx` + `.module.scss`, `Footer.tsx` + `.module.scss`, `CourseCard.tsx` + `.module.scss`; `frontend/src/app/(app)/layout.tsx`, `page.tsx`, `home.module.scss`

- [ ] **Step 1: `src/components/Footer.tsx` + `Footer.module.scss`**

```typescript
import styles from './Footer.module.scss';

export function Footer() {
  return (
    <footer className={styles.footer}>
      © {new Date().getFullYear()} Learning Platform
    </footer>
  );
}
```

```scss
.footer {
  height: 48px;
  background: #f1f5f9;
  color: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
```

- [ ] **Step 2: `src/components/Header.tsx` + `Header.module.scss`** (client; uses session + signOut)

```typescript
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import styles from './Header.module.scss';

export function Header() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return <header className={styles.header} />;

  const email = user.email ?? '';
  const initial = (email || '?').charAt(0).toUpperCase();

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link href="/">Courses</Link>
        {user.role === 'TEACHER' && (
          <Link href="/teacher/courses/new">Create course</Link>
        )}
        <Link href="/profile">Profile</Link>
      </nav>
      <div className={styles.user}>
        <span className={styles.avatar}>{initial}</span>
        <span className={styles.name}>{email}</span>
        <button onClick={() => signOut({ callbackUrl: '/login' })}>
          Logout
        </button>
      </div>
    </header>
  );
}
```

```scss
.header {
  height: 64px;
  background: #1e293b;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.nav {
  display: flex;
  gap: 24px;

  a {
    color: #fff;
    font-size: 15px;

    &:hover {
      color: #cbd5e1;
    }
  }
}

.user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.name {
  font-size: 14px;
  white-space: nowrap;
}

button {
  background: transparent;
  color: #fff;
  border: 1px solid #fff;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;

  &:hover {
    background: #fff;
    color: #1e293b;
  }
}
```

- [ ] **Step 3: `src/components/CourseCard.tsx` + `CourseCard.module.scss`** (client; enroll mutation)

```typescript
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientApi } from '../lib/api/client';
import type { CourseListItem, SessionUser } from '../lib/types';
import styles from './CourseCard.module.scss';

const ASSET_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
).replace(/\/api$/, '');

export function CourseCard({
  course,
  user,
}: {
  course: CourseListItem;
  user: SessionUser;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const imageSrc = course.imageUrl
    ? course.imageUrl.startsWith('/public')
      ? `${ASSET_BASE}${course.imageUrl}`
      : course.imageUrl
    : null;

  async function enroll() {
    setBusy(true);
    try {
      await clientApi(`/courses/${course.id}/enroll`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.image}>
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={course.title} />
        ) : (
          <div className={styles.placeholder} />
        )}
      </div>
      <div className={styles.content}>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <div className={styles.actions}>{renderActions()}</div>
      </div>
    </div>
  );

  function renderActions() {
    if (user.role === 'STUDENT') {
      if (course.enrollmentStatus === 'ACTIVE') {
        return (
          <Link
            className={`${styles.btn} ${styles.btnPrimary}`}
            href={`/courses/${course.id}`}
          >
            Open
          </Link>
        );
      }
      if (course.enrollmentStatus === 'PENDING') {
        return (
          <button className={`${styles.btn} ${styles.btnDisabled}`} disabled>
            Pending
          </button>
        );
      }
      return (
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={enroll}
          disabled={busy}
        >
          {busy ? '…' : 'Enroll'}
        </button>
      );
    }
    // TEACHER / ADMIN
    const canEdit =
      user.role === 'ADMIN' || user.id === course.teacherId;
    return (
      <>
        <Link
          className={`${styles.btn} ${styles.btnOutline}`}
          href={`/courses/${course.id}`}
        >
          View
        </Link>
        {canEdit && (
          <Link
            className={`${styles.btn} ${styles.btnOutline}`}
            href={`/teacher/courses/${course.id}/builder`}
          >
            Edit
          </Link>
        )}
      </>
    );
  }
}
```

```scss
.card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: transform 0.15s;

  &:hover {
    transform: translateY(-4px);
  }
}

.image {
  height: 160px;
  background: #e5e7eb;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.placeholder {
  width: 100%;
  height: 100%;
}

.content {
  padding: 16px;

  h3 {
    font-size: 17px;
    margin-bottom: 6px;
  }

  p {
    font-size: 14px;
    color: #475569;
    margin-bottom: 14px;
    min-height: 20px;
  }
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  border: none;
  text-align: center;
}

.btnPrimary {
  background: #3b82f6;
  color: #fff;

  &:hover {
    background: #2563eb;
  }
}

.btnOutline {
  border: 1px solid #2563eb;
  color: #2563eb;
  background: transparent;

  &:hover {
    background: #e3f2fd;
  }
}

.btnDisabled {
  opacity: 0.55;
  pointer-events: none;
  background: #94a3b8;
  color: #fff;
}
```

- [ ] **Step 4: `src/app/(app)/layout.tsx`** (protected shell)

```typescript
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <Header />
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 5: `src/app/(app)/home.module.scss`**

```scss
.page {
  h1 {
    margin-bottom: 20px;
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
}
```

- [ ] **Step 6: `src/app/(app)/page.tsx`** (Home — RSC course list)

```typescript
import { auth } from '../../auth';
import { serverApi } from '../../lib/api/server';
import { CourseCard } from '../../components/CourseCard';
import type { CourseListItem, SessionUser } from '../../lib/types';
import styles from './home.module.scss';

export default async function HomePage() {
  const session = await auth();
  const user = session!.user as SessionUser;
  const courses = await serverApi<CourseListItem[]>('/courses');

  return (
    <div className={styles.page}>
      <h1>Dashboard</h1>
      {courses.length === 0 ? (
        <p>No courses yet.</p>
      ) : (
        <div className={styles.grid}>
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Build**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: `✓ Compiled successfully`, no type/lint errors. If errors, STOP and report exact error.

- [ ] **Step 8: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components "frontend/src/app/(app)"
git commit -m "feat(frontend): add app shell (header/footer), home course list, course card"
```

---

## Task 7: Verification

**Files:** none (runtime).

- [ ] **Step 1: Start backend (if not running) and frontend**

```bash
# backend
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest.log 2>&1 & ) ; sleep 10
grep -E "successfully started" /tmp/nest.log | head -1
# frontend
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; sleep 1
( npm run dev > /tmp/next.log 2>&1 & ) ; sleep 8
grep -E "Ready|started server|Local:" /tmp/next.log | head -3
```
Expected: backend started; Next dev server ready on :3000.

- [ ] **Step 2: Unauthenticated root redirects to /login**

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/
```
Expected: `307` (or `302`) redirecting to `.../login`.

- [ ] **Step 3: Login page renders**

```bash
curl -s http://localhost:3000/login | grep -o 'Sign in' | head -1
```
Expected: prints `Sign in`.

- [ ] **Step 4: NextAuth providers endpoint works (Auth.js mounted)**

```bash
curl -s http://localhost:3000/api/auth/providers
```
Expected: JSON containing a `credentials` provider.

- [ ] **Step 5: MANUAL browser check** (record the result)

Open http://localhost:3000 in a browser:
1. You are redirected to `/login`.
2. Log in with `teacher@example.com` / `password123` → lands on Dashboard, Header shows the email + "Create course" link.
3. The seeded course "Intro to TypeScript" appears as a card with View/Edit.
4. Log out → back to `/login`.
5. Register a new STUDENT (any email, password ≥6) → auto signed in → Dashboard shows the course with an "Enroll" button; clicking it switches to "Pending".

Record pass/fail for each. (This manual step is the real proof; the curl checks confirm the app is wired.)

- [ ] **Step 6: Stop dev servers**

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null
true
```

No commit (verification only).

---

## Self-Review (author checklist — completed)

- **Spec coverage:** Auth.js Credentials → NestJS login with refresh-token capture from Set-Cookie and auto-refresh in the jwt callback (Task 3); server + client API helpers attaching the bearer token (Task 2); SessionProvider + QueryClientProvider foundation (Task 4); Login/Register via react-hook-form + zod calling `signIn` (Task 5); shell + Home RSC course list + enroll client mutation, SCSS ported from legacy palette (Task 6). ✓
- **Intentional improvements over legacy:** tokens live in the encrypted Auth.js session (no `localStorage`); the legacy `loggedOut` flag and axios interceptor are replaced by Auth.js; the `startLesson` missing-return bug is noted for Plan 3b. ✓
- **Auth flow correctness:** authorize parses `refreshToken` from Set-Cookie (Node `getSetCookie`), stores access+refresh+exp in the JWT; refresh sends `Cookie: refreshToken=...` to `/auth/refresh` and rotates. Access expiry decoded from the JWT `exp`. ✓
- **Routing:** `(auth)` group is public (middleware allows `/login`,`/register`); `(app)` group is protected; authenticated users hitting `/login` are bounced to `/`. ✓
- **Placeholder scan:** none. **Type consistency:** `Role`, `SessionUser`, `CourseListItem` defined in `lib/types.ts` and reused; session augmentation matches `auth.ts` callbacks. ✓
- **Deferred to 3b/3c:** Profile (3b), student CoursePage with StructurePanel/LessonViewer/TestViewer + test-taking session (3b), teacher CreateCourse/CourseBuilder/CourseManagement (3c).
