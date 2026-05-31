# Plan C — Mock Email Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require email confirmation at registration (mocked — no real email): registration creates an unverified account and shows a confirmation link on screen; login is blocked until confirmed; a `/confirm` page activates the account.

**Architecture:** `User` gets `emailVerified` + `verificationToken`. Backend `register` stops auto-login and returns `{ email, confirmToken }`; a public `POST /auth/confirm` verifies; `login` rejects unverified users (403). Frontend register shows a "confirm your email" screen with the mock link; `/confirm` posts the token; middleware makes `/confirm` public. Existing seed users are marked verified.

**Tech Stack:** NestJS 11 + Prisma 6; Next.js 15 + TS + UI kit.

> **Tests out of scope.** Verification = build, boot, `curl`, manual.

> **Env note:** Node not on default PATH — `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Backend dir `/Users/.../backend`; frontend `/Users/.../frontend`; free :5000/:3000 before boot; Postgres must run. Turbopack CSS Modules require pure selectors.

> **Spec:** `docs/superpowers/specs/2026-06-01-mock-email-confirmation-design.md` (subproject C).

---

## File Structure

```
backend/prisma/schema.prisma              # MODIFY: User.emailVerified + verificationToken
backend/prisma/seed.ts                    # MODIFY: emailVerified: true on seeded users
backend/src/modules/auth/
  dto/confirm.dto.ts                       # new
  auth.service.ts                          # MODIFY: register/confirm/login
  auth.controller.ts                       # MODIFY: register (no cookie), confirm route
frontend/src/
  middleware.ts                            # MODIFY: allow /confirm
  app/(auth)/RegisterForm.tsx              # MODIFY: confirm-screen, no auto sign-in
  app/(auth)/LoginForm.tsx                 # MODIFY: error hint
  app/(auth)/confirm/page.tsx              # new
  app/(auth)/confirm/ConfirmView.tsx       # new
```

---

## Task 1: Prisma — emailVerified + verificationToken (with existing users verified)

**Files:** Modify `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`; migrate

- [ ] **Step 1: Add fields to `model User`** in `backend/prisma/schema.prisma` (after the `role` line):

```prisma
  emailVerified     Boolean  @default(false)
  verificationToken String?  @unique
```

- [ ] **Step 2: Create the migration WITHOUT applying it yet** (so we can add the "verify existing users" SQL):

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npx prisma migrate dev --create-only --name add-email-verification
```
This creates `prisma/migrations/<timestamp>_add_email_verification/migration.sql` but does not run it.

- [ ] **Step 3: Append the verify-existing-users statement** to that new `migration.sql` (so already-registered accounts stay able to log in). Add this line at the END of the file:

```sql
UPDATE "User" SET "emailVerified" = true;
```

- [ ] **Step 4: Apply the migration**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npx prisma migrate dev
```
Expected: the pending migration applies; "Your database is now in sync"; client regenerated.

- [ ] **Step 5: Mark seeded users verified** in `backend/prisma/seed.ts` — add `emailVerified: true,` to each of the three `prisma.user.create({ data: { ... } })` calls (teacher, student1, student2), e.g.:

```typescript
    data: {
      email: 'teacher@example.com',
      password: passwordHash,
      role: 'TEACHER',
      emailVerified: true,
      profile: { create: { firstName: 'Tessa', lastName: 'Teacher' } },
    },
```
(do the same for student1 and student2).

- [ ] **Step 6: Verify existing rows are verified (DB check)**

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc 'select count(*) from "User" where "emailVerified" = false;'
```
Expected: `0` (all existing users verified by the migration).

- [ ] **Step 7: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed.ts
git commit -m "feat(backend): add User.emailVerified + verificationToken (existing users verified)"
```

---

## Task 2: Backend — register/confirm/login + controller + dto

**Files:** Create `backend/src/modules/auth/dto/confirm.dto.ts`; Modify `auth.service.ts`, `auth.controller.ts`

- [ ] **Step 1: `dto/confirm.dto.ts`**

```typescript
import { IsString } from 'class-validator';

export class ConfirmDto {
  @IsString()
  token: string;
}
```

- [ ] **Step 2: `auth.service.ts`** — (a) add `ForbiddenException` to the `@nestjs/common` import; (b) replace `register`; (c) add `confirm`; (d) add the verified check in `login`.

(a) Ensure the top import includes `ForbiddenException`:
```typescript
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
```

(b) Replace the `register` method:
```typescript
  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) {
      throw new BadRequestException('User already exists');
    }
    const confirmToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.create({
      data: {
        email: dto.email,
        password: await bcrypt.hash(dto.password, 10),
        role: dto.role === 'TEACHER' ? 'TEACHER' : 'STUDENT',
        emailVerified: false,
        verificationToken: confirmToken,
        profile: { create: {} },
      },
    });
    return { email: dto.email, confirmToken };
  }
```

(c) Add a `confirm` method (e.g. right after `register`):
```typescript
  async confirm(token: string) {
    if (!token) {
      throw new BadRequestException('Invalid or used confirmation link');
    }
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });
    if (!user) {
      throw new BadRequestException('Invalid or used confirmation link');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });
    return { ok: true };
  }
```

(d) In the `login` method, after the password-valid check (`if (!valid) throw ...`) and before `return this.createAuthResponse(user);`, add:
```typescript
    if (!user.emailVerified) {
      throw new ForbiddenException('Email not confirmed');
    }
```

- [ ] **Step 3: `auth.controller.ts`** — register no longer sets a cookie (no auto-login); add the confirm route.

Replace the `register` handler with (no `@Res`, no cookie — returns `{ email, confirmToken }`):
```typescript
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
```

Add the `confirm` handler (public — AuthController has no class-level guard; only `me` is guarded) and import `ConfirmDto`:
```typescript
  @Post('confirm')
  @HttpCode(200)
  confirm(@Body() dto: ConfirmDto) {
    return this.auth.confirm(dto.token);
  }
```
Add the import near the other dto imports:
```typescript
import { ConfirmDto } from './dto/confirm.dto';
```
(`HttpCode` is already imported in this controller.)

- [ ] **Step 4: Build + boot + curl verify**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest-confirm.log 2>&1 & ) ; sleep 11
grep -E "successfully started|ERROR|Mapped \{/api/auth/confirm" /tmp/nest-confirm.log | head
B=http://localhost:5000/api
EMAIL="confirm$(date +%s)@example.com"
echo "1) register (returns confirmToken, no tokens):"; REG=$(curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\",\"role\":\"STUDENT\"}"); echo "$REG" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({email:j.email, hasToken:!!j.confirmToken, hasAccess:!!j.accessToken})'
TOK=$(echo "$REG" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).confirmToken')
echo -n "2) login before confirm (expect 403): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"
echo "3) confirm:"; curl -s -X POST $B/auth/confirm -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}"
echo ""; echo -n "4) login after confirm (expect 200): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"
echo -n "5) reuse token (expect 400): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/auth/confirm -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}"
echo -n "6) seed user still logs in (expect 200): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123"}'
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; true
```
Expected: `Mapped {/api/auth/confirm, POST}`; (1) `{email:"…", hasToken:true, hasAccess:false}`; (2) `403`; (3) `{"ok":true}`; (4) `200`; (5) `400`; (6) `200`.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/auth
git commit -m "feat(backend): email confirmation (register w/o auto-login, confirm endpoint, login gate)"
```

---

## Task 3: Frontend — register confirm-screen, /confirm page, login hint, middleware

**Files:** Modify `frontend/src/middleware.ts`, `app/(auth)/RegisterForm.tsx`, `app/(auth)/LoginForm.tsx`; Create `app/(auth)/confirm/page.tsx`, `ConfirmView.tsx`

- [ ] **Step 1: Allow `/confirm` in `middleware.ts`** — change the `publicPage` line to include `/confirm`:

```typescript
  const publicPage =
    authPages ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/confirm');
```
(Keep the rest of the file as is.)

- [ ] **Step 2: Replace `app/(auth)/RegisterForm.tsx`** (no auto sign-in; show confirm screen with the mock link)

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmLink, setConfirmLink] = useState<string | null>(null);
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
    const data = (await res.json()) as { email: string; confirmToken: string };
    setConfirmLink(`/confirm?token=${data.confirmToken}`);
  });

  if (confirmLink) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.form}>
          <h1>Confirm your email</h1>
          <p style={{ textAlign: 'center', fontSize: 14 }}>
            We&apos;ve &quot;sent&quot; a confirmation link. In a real product it
            would arrive by email — here it is:
          </p>
          <Link
            href={confirmLink}
            className={styles.button}
            style={{ textAlign: 'center', textDecoration: 'none' }}
          >
            Confirm email
          </Link>
          <p className={styles.switch}>
            Already confirmed? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

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

- [ ] **Step 3: Create `app/(auth)/confirm/ConfirmView.tsx`** (client; posts the token)

```typescript
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../auth-form.module.scss';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export function ConfirmView() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    fetch(`${API}/auth/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => setState(r.ok ? 'ok' : 'error'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.form}>
        {state === 'loading' && <h1>Confirming…</h1>}
        {state === 'ok' && (
          <>
            <h1>Email confirmed ✓</h1>
            <p style={{ textAlign: 'center', fontSize: 14 }}>
              Your account is now active.
            </p>
            <Link
              href="/login"
              className={styles.button}
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              Sign in
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <h1>Link invalid</h1>
            <p className={styles.error}>
              This confirmation link is invalid or already used.
            </p>
            <p className={styles.switch}>
              <Link href="/register">Register again</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `app/(auth)/confirm/page.tsx`** (Suspense wrapper for `useSearchParams`)

```typescript
import { Suspense } from 'react';
import { ConfirmView } from './ConfirmView';

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmView />
    </Suspense>
  );
}
```

- [ ] **Step 5: Tweak the login error hint in `LoginForm.tsx`** — change the `setServerError('Invalid email or password');` line to:

```typescript
      setServerError('Invalid credentials — and make sure your email is confirmed');
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
rm -rf .next
npm run build
```
Expected: clean; `/confirm` in the route table. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/middleware.ts "frontend/src/app/(auth)"
git commit -m "feat(frontend): registration confirm screen + /confirm page + login hint"
```

---

## Task 4: Verification

**Files:** none (runtime).

- [ ] **Step 1: Start servers**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest.log 2>&1 & ) ; sleep 10
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; sleep 1
( npm run dev > /tmp/next.log 2>&1 & ) ; sleep 8
grep -iE "ready|error" /tmp/next.log | head -2
```

- [ ] **Step 2: API flow + page checks**

```bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
B=http://localhost:5000/api
EMAIL="ui$(date +%s)@example.com"
REG=$(curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\",\"role\":\"STUDENT\"}")
TOK=$(echo "$REG" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).confirmToken')
echo -n "login before confirm: "; curl -s -o /dev/null -w "%{http_code} (expect 403)\n" -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"
echo -n "confirm page renders: "; curl -s "http://localhost:3000/confirm?token=$TOK" -o /dev/null -w "%{http_code} (expect 200, public)\n"
echo -n "confirm via API: "; curl -s -X POST $B/auth/confirm -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}"
echo ""; echo -n "login after confirm: "; curl -s -o /dev/null -w "%{http_code} (expect 200)\n" -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"
echo -n "register page public: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/register
echo -n "seed teacher login: "; curl -s -o /dev/null -w "%{http_code} (expect 200)\n" -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123"}'
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; true
```
Expected: login-before `403`; confirm page `200` (public, no auth); confirm `{"ok":true}`; login-after `200`; register page `200`; seed teacher `200`.

- [ ] **Step 3: MANUAL browser check** — Register a new account → "Confirm your email" screen appears with a link → click it → "Email confirmed ✓" → "Sign in" → log in successfully. Try logging in with a brand-new unconfirmed account → fails. Existing accounts (`teacher@example.com`) still log in.

- [ ] **Step 4: Stop servers**

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null
true
```

No commit.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** `User.emailVerified` + `verificationToken`, existing users verified (Task 1 migration + seed); `register` returns `{email,confirmToken}` w/o auto-login, `POST /auth/confirm`, `login` 403 if unverified (Task 2); register confirm-screen with mock link, `/confirm` page (Suspense), login hint, middleware allows `/confirm` (Task 3). Matches spec §3–5. ✓
- **Existing-users safety:** migration runs `UPDATE "User" SET "emailVerified" = true;` so current accounts keep logging in; seed sets it for fresh DBs. ✓
- **Placeholder scan:** none. **Type consistency:** `confirmToken` field name consistent between backend `register` return, `RegisterForm`, and the `/confirm?token=` link → `confirm({token})`; `ConfirmDto.token` matches. ✓
- **Public routing:** `/confirm` is in the `(auth)` group and added to middleware `publicPage`; `useSearchParams` is wrapped in `<Suspense>`. ✓
- **Completes subproject C — and the whole Kwiga-like upgrade.**
