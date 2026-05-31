# Plan B2 — Pricing + Purchase Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public course landing page with a smart CTA, a mock checkout, course price inputs (create + builder), a purchase-history page reachable from the profile, and price badges on course cards.

**Architecture:** Public landing `/c/[id]` is a server component fetching `GET /api/public/courses/:id` (no auth) with a client CTA that branches on `useSession` + `my-status`. Mock checkout `/checkout/[id]` posts to `/api/courses/:id/purchase`. Middleware allows `/c/` publicly. Built on the Plan A1 UI kit + B1 backend.

**Tech Stack:** Next.js 15 + TS + TanStack Query + UI kit + lucide.

> **Tests out of scope.** Verification = build, boot, `curl` (page renders) + manual.

> **Env note:** Node not on default PATH — `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Frontend dir `/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend`; backend on :5000; Turbopack CSS Modules require pure selectors.

> **Spec:** `docs/superpowers/specs/2026-05-31-landing-pricing-purchase-design.md` (subproject B). Backend is Plan B1 (done): `GET /api/public/courses/:id`, `GET /api/courses/:id/my-status`, `POST /api/courses/:id/purchase`, `GET /api/me/purchases`, `Course.price`.

---

## File Structure

```
frontend/src/
  lib/types.ts                              # MODIFY: price on CourseListItem/CourseDetail; PublicCourse/Purchase/MyStatus
  middleware.ts                             # MODIFY: allow /c/ public
  app/c/[id]/page.tsx                       # public landing (server)
  app/c/[id]/landing.module.scss
  components/store/LandingCTA.tsx           # client CTA
  app/(app)/checkout/[id]/page.tsx          # mock checkout (client)
  app/(app)/checkout/[id]/checkout.module.scss
  app/(app)/purchases/page.tsx              # purchase history (client)
  app/(app)/purchases/purchases.module.scss
  components/CourseCard.tsx                  # MODIFY: price badge + buy link
  app/(app)/teacher/courses/new/CreateCourseForm.tsx   # MODIFY: price input
  components/teacher/BuilderStructurePanel.tsx          # MODIFY: price input
  app/(app)/profile/ProfileForm.tsx          # MODIFY: "My purchases" button
```

---

## Task 1: Types + middleware

**Files:** Modify `frontend/src/lib/types.ts`, `frontend/src/middleware.ts`

- [ ] **Step 1: Edit `lib/types.ts`** — add `price` to `CourseListItem` and `CourseDetail`, and append new types.

In `interface CourseListItem`, add a field:
```typescript
  price: number;
```
In `interface CourseDetail`, add a field:
```typescript
  price: number;
```
Append at the end of the file:
```typescript
export interface PublicCourseLesson {
  title: string;
  hasTest: boolean;
}

export interface PublicCourseSection {
  title: string;
  lessons: PublicCourseLesson[];
}

export interface PublicCourse {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  teacher: { name: string };
  sections: PublicCourseSection[];
}

export interface MyStatus {
  enrollmentStatus: EnrollmentStatus | null;
}

export interface Purchase {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  course: { id: number; title: string; imageUrl: string | null };
}
```

- [ ] **Step 2: Replace `frontend/src/middleware.ts`** (allow `/c/` for everyone; only auth pages bounce logged-in users)

```typescript
import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const authPages =
    pathname.startsWith('/login') || pathname.startsWith('/register');
  const publicPage = authPages || pathname.startsWith('/c/');

  if (!req.auth && !publicPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (req.auth && authPages) {
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

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/lib/types.ts frontend/src/middleware.ts
git commit -m "feat(frontend): price types + public /c/ route in middleware"
```

---

## Task 2: Public landing page + CTA

**Files:** Create `frontend/src/components/store/LandingCTA.tsx`, `frontend/src/app/c/[id]/page.tsx`, `frontend/src/app/c/[id]/landing.module.scss`

- [ ] **Step 1: `components/store/LandingCTA.tsx`** (client; branches on session + my-status)

```typescript
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../lib/api/client';
import { useToast, Button } from '../ui';
import type { MyStatus } from '../../lib/types';

export function LandingCTA({
  courseId,
  price,
}: {
  courseId: number;
  price: number;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data: my } = useQuery<MyStatus>({
    queryKey: ['my-status', courseId],
    queryFn: () => clientApi<MyStatus>(`/courses/${courseId}/my-status`),
    enabled: status === 'authenticated',
  });

  if (status === 'loading') return null;

  if (!session) {
    return (
      <Link href="/login">
        <Button variant="primary">Log in to continue</Button>
      </Link>
    );
  }

  const enrollment = my?.enrollmentStatus ?? null;

  if (enrollment === 'ACTIVE') {
    return (
      <Link href={`/courses/${courseId}`}>
        <Button variant="primary">Go to course</Button>
      </Link>
    );
  }
  if (enrollment === 'PENDING') {
    return (
      <Button variant="ghost" disabled>
        Request pending
      </Button>
    );
  }

  if (price > 0) {
    return (
      <Button
        variant="primary"
        onClick={() => router.push(`/checkout/${courseId}`)}
      >
        Buy for ${price}
      </Button>
    );
  }

  // free → request enrollment
  async function enroll() {
    setBusy(true);
    try {
      await clientApi(`/courses/${courseId}/enroll`, { method: 'POST' });
      toast('Enrollment request sent', 'success');
      router.refresh();
    } catch {
      toast('Could not enroll', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="primary" onClick={enroll} loading={busy}>
      Enroll
    </Button>
  );
}
```

- [ ] **Step 2: `app/c/[id]/landing.module.scss`**

```scss
.page {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.topbar {
  height: 56px;
  background: var(--color-header);
  color: var(--color-header-text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-5);
  font-weight: 700;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-5);
}

.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--space-6);
  align-items: start;
}

.category {
  display: inline-block;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--fs-xs);
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  margin-bottom: var(--space-3);
}

.title {
  font-size: var(--fs-2xl);
  font-weight: 800;
}

.lead {
  color: var(--color-text-muted);
  margin-top: var(--space-3);
  line-height: 1.6;
}

.teacher {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.priceCard {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.cover {
  height: 120px;
  background: linear-gradient(135deg, var(--color-primary), #7c3aed);
}

.priceBody {
  padding: var(--space-4);
}

.price {
  font-size: var(--fs-2xl);
  font-weight: 800;
}

.priceNote {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
}

.section {
  margin-top: var(--space-6);
}

.sectionTitle {
  font-size: var(--fs-lg);
  font-weight: 700;
  margin-bottom: var(--space-3);
}

.program {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.progHead {
  padding: var(--space-3) var(--space-4);
  font-weight: 600;
  background: var(--color-surface-2);
  display: flex;
  justify-content: space-between;
}

.progItem {
  padding: var(--space-2) var(--space-5);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--fs-sm);
}
```

- [ ] **Step 3: `app/c/[id]/page.tsx`** (server component; public fetch)

```typescript
import { Lock, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { serverApi } from '../../../lib/api/server';
import type { PublicCourse } from '../../../lib/types';
import { LandingCTA } from '../../../components/store/LandingCTA';
import styles from './landing.module.scss';

export default async function CourseLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const courseId = Number(id);
  let course: PublicCourse;
  try {
    course = await serverApi<PublicCourse>(`/public/courses/${courseId}`);
  } catch {
    return (
      <div className={styles.container}>
        <p>Course not found.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <span>Learning Platform</span>
        <Link href="/login" style={{ color: 'inherit', fontSize: 14 }}>
          Log in
        </Link>
      </div>
      <div className={styles.container}>
        <div className={styles.hero}>
          <div>
            <span className={styles.category}>Course</span>
            <h1 className={styles.title}>{course.title}</h1>
            <p className={styles.lead}>{course.description}</p>
            <div className={styles.teacher}>
              <GraduationCap size={16} /> Instructor: <b>{course.teacher.name}</b>
            </div>
          </div>
          <div className={styles.priceCard}>
            <div className={styles.cover} />
            <div className={styles.priceBody}>
              <div className={styles.price}>
                {course.price > 0 ? `$ ${course.price}` : 'Free'}
              </div>
              <div className={styles.priceNote}>
                {course.price > 0 ? 'one-time · full access' : 'request to enroll'}
              </div>
              <LandingCTA courseId={course.id} price={course.price} />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>About</h2>
          <p className={styles.lead}>{course.description}</p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Program</h2>
          {course.sections.map((s, i) => (
            <div key={i} className={styles.program} style={{ marginBottom: 12 }}>
              <div className={styles.progHead}>
                <span>{s.title}</span>
                <span style={{ opacity: 0.6 }}>{s.lessons.length} lessons</span>
              </div>
              {s.lessons.map((l, j) => (
                <div key={j} className={styles.progItem}>
                  <Lock size={14} /> {l.title}
                  {l.hasTest && ' · 📝 test'}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean, `/c/[id]` in route table. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/store frontend/src/app/c
git commit -m "feat(frontend): public course landing page + smart CTA"
```

---

## Task 3: Mock checkout

**Files:** Create `frontend/src/app/(app)/checkout/[id]/page.tsx`, `checkout.module.scss`

- [ ] **Step 1: `checkout.module.scss`**

```scss
.page {
  max-width: 480px;
  margin: 0 auto;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.row {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-md);
}

.total {
  font-size: var(--fs-xl);
  font-weight: 800;
  color: var(--color-primary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  label {
    font-size: var(--fs-xs);
    color: var(--color-text-muted);
  }
}

.split {
  display: flex;
  gap: var(--space-3);
}

.note {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  text-align: center;
}
```

- [ ] **Step 2: `app/(app)/checkout/[id]/page.tsx`** (client; fake card form → purchase)

```typescript
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../../../lib/api/client';
import { Button, Card, Input, useToast } from '../../../../components/ui';
import type { PublicCourse } from '../../../../lib/types';
import styles from './checkout.module.scss';

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const toast = useToast();
  const [card, setCard] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: course } = useQuery<PublicCourse>({
    queryKey: ['public-course', id],
    queryFn: () => clientApi<PublicCourse>(`/public/courses/${id}`),
  });

  async function pay() {
    setBusy(true);
    try {
      await clientApi(`/courses/${id}/purchase`, { method: 'POST' });
      toast('Payment successful 🎉', 'success');
      router.push(`/courses/${id}`);
    } catch {
      toast('Payment failed', 'error');
      setBusy(false);
    }
  }

  if (!course) return <p>Loading…</p>;

  return (
    <div className={styles.page}>
      <h1>Checkout</h1>
      <Card className={styles.card}>
        <div className={styles.row}>
          <span>{course.title}</span>
          <span className={styles.total}>${course.price}</span>
        </div>
        <div className={styles.field}>
          <label>Card number (any value — mock)</label>
          <Input
            value={card}
            onChange={(e) => setCard(e.target.value)}
            placeholder="4242 4242 4242 4242"
          />
        </div>
        <div className={styles.split}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label>Expiry</label>
            <Input
              value={exp}
              onChange={(e) => setExp(e.target.value)}
              placeholder="12/29"
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label>CVC</label>
            <Input
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              placeholder="123"
            />
          </div>
        </div>
        <Button variant="primary" onClick={pay} loading={busy}>
          Pay ${course.price}
        </Button>
        <p className={styles.note}>Mock payment — no real charge.</p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add "frontend/src/app/(app)/checkout"
git commit -m "feat(frontend): mock checkout page"
```

---

## Task 4: Price inputs (create form + builder)

**Files:** Modify `frontend/src/app/(app)/teacher/courses/new/CreateCourseForm.tsx`, `frontend/src/components/teacher/BuilderStructurePanel.tsx`

- [ ] **Step 1: Add a price field to `CreateCourseForm.tsx`.** Add a `price` state and include it in the FormData. Make these three edits:

After the `const [image, setImage] = useState<File | null>(null);` line, add:
```typescript
  const [price, setPrice] = useState('0');
```

In the `submit` function, after `fd.append('description', description);`, add:
```typescript
    fd.append('price', String(Number(price) || 0));
```

In the JSX, after the Description `.field` block (the `<textarea>` one) and before the Image `.field` block, add a new field:
```typescript
        <div className={styles.field}>
          <label>Price ($, 0 = free)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
```

- [ ] **Step 2: Add a price control to `BuilderStructurePanel.tsx`.** It receives `course: CourseDetail` (which now has `price`). Add a price mutation and a small input under the course title.

Add this mutation near the other `useMutation` calls (after `delCourse`):
```typescript
  const savePrice = useMutation({
    mutationFn: (price: number) =>
      clientApi(`/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      }),
    onSuccess: invalidate,
  });
```

In the JSX, right after the `</div>` that closes `styles.header` (the block with the course title + Manage button), add a price row:
```typescript
      <div className={styles.priceRow}>
        <label>Price $</label>
        <input
          type="number"
          min={0}
          defaultValue={course.price}
          onBlur={(e) => savePrice.mutate(Number(e.target.value) || 0)}
        />
      </div>
```

And append a `.priceRow` rule to `frontend/src/components/teacher/BuilderStructurePanel.module.scss`:
```scss
.priceRow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  font-size: var(--fs-sm);

  input {
    width: 90px;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add "frontend/src/app/(app)/teacher/courses/new/CreateCourseForm.tsx" frontend/src/components/teacher/BuilderStructurePanel.tsx frontend/src/components/teacher/BuilderStructurePanel.module.scss
git commit -m "feat(frontend): course price inputs (create + builder)"
```

---

## Task 5: CourseCard price badge + buy; purchases page + profile button

**Files:** Modify `frontend/src/components/CourseCard.tsx`, `frontend/src/app/(app)/profile/ProfileForm.tsx`; Create `frontend/src/app/(app)/purchases/page.tsx`, `purchases.module.scss`

- [ ] **Step 1: Update `CourseCard.tsx`** — show a price badge and, for paid courses a student hasn't joined, link to the landing instead of free enroll. Replace the file:

```typescript
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientApi } from '../lib/api/client';
import type { CourseListItem, SessionUser } from '../lib/types';
import { Button, Badge } from './ui';
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
          <div className={styles.gradient}>{course.title.charAt(0)}</div>
        )}
        <span className={styles.statusBadge}>
          <Badge tone={course.price > 0 ? 'primary' : 'neutral'}>
            {course.price > 0 ? `$${course.price}` : 'Free'}
          </Badge>
        </span>
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
          <Link href={`/courses/${course.id}`}>
            <Button variant="primary">Open</Button>
          </Link>
        );
      }
      if (course.enrollmentStatus === 'PENDING') {
        return (
          <Button variant="ghost" disabled>
            Pending
          </Button>
        );
      }
      if (course.price > 0) {
        return (
          <Link href={`/c/${course.id}`}>
            <Button variant="primary">Buy ${course.price}</Button>
          </Link>
        );
      }
      return (
        <Button variant="primary" onClick={enroll} loading={busy}>
          Enroll
        </Button>
      );
    }
    const canEdit = user.role === 'ADMIN' || user.id === course.teacherId;
    return (
      <>
        <Link href={`/courses/${course.id}`}>
          <Button variant="outline">View</Button>
        </Link>
        {canEdit && (
          <Link href={`/teacher/courses/${course.id}/builder`}>
            <Button variant="outline">Edit</Button>
          </Link>
        )}
      </>
    );
  }
}
```

- [ ] **Step 2: `app/(app)/purchases/purchases.module.scss`**

```scss
.page {
  max-width: 700px;
  margin: 0 auto;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.title {
  font-weight: 600;
}

.meta {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}

.amount {
  font-weight: 700;
  color: var(--color-primary);
}
```

- [ ] **Step 3: `app/(app)/purchases/page.tsx`** (client; history)

```typescript
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../../../lib/api/client';
import type { Purchase } from '../../../lib/types';
import { EmptyState } from '../../../components/ui';
import styles from './purchases.module.scss';

export default function PurchasesPage() {
  const { data: purchases } = useQuery<Purchase[]>({
    queryKey: ['purchases'],
    queryFn: () => clientApi<Purchase[]>('/me/purchases'),
  });

  return (
    <div className={styles.page}>
      <h1>My purchases</h1>
      {!purchases ? (
        <p>Loading…</p>
      ) : purchases.length === 0 ? (
        <EmptyState title="No purchases yet" />
      ) : (
        <div className={styles.list}>
          {purchases.map((p) => (
            <Link key={p.id} href={`/courses/${p.course.id}`}>
              <div className={styles.item}>
                <div>
                  <div className={styles.title}>{p.course.title}</div>
                  <div className={styles.meta}>
                    {new Date(p.createdAt).toLocaleDateString()} · {p.status}
                  </div>
                </div>
                <div className={styles.amount}>${p.amount}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add a "My purchases" button to `ProfileForm.tsx`.** Add the import near the top:
```typescript
import Link from 'next/link';
```
Then, inside the returned JSX, right after `<h1>Profile</h1>`, add:
```typescript
      <Link href="/purchases">
        <button type="button" className={styles.button} style={{ width: 'auto', marginBottom: 'var(--space-4)' }}>
          My purchases
        </button>
      </Link>
```

- [ ] **Step 5: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean, `/purchases` in route table. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/CourseCard.tsx "frontend/src/app/(app)/purchases" "frontend/src/app/(app)/profile/ProfileForm.tsx"
git commit -m "feat(frontend): course price badge + buy link, purchases page + profile button"
```

---

## Task 6: Verification

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

- [ ] **Step 2: Public landing renders without auth; protected pages load with a student session**

```bash
echo -n "public landing /c/1 (no auth) HTTP: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/c/1
echo -n "landing shows title: "; curl -s http://localhost:3000/c/1 | grep -o 'Intro to TypeScript' | head -1
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
JAR=/tmp/bjar.txt; rm -f $JAR
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).csrfToken')
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials -H 'Content-Type: application/x-www-form-urlencoded' -H 'X-Auth-Return-Redirect: 1' --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=student1@example.com" --data-urlencode "password=password123" >/dev/null
for p in "/checkout/1" "/purchases" "/"; do echo -n "$p HTTP: "; curl -s -b $JAR -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"; done
```
Expected: `/c/1` `200` and shows the title (public, no auth); `/checkout/1`, `/purchases`, `/` all `200` with the session.

- [ ] **Step 3: MANUAL browser check** — as a teacher: set a price on a course in the builder. As a fresh/another student: open the catalog → paid course shows "Buy $X" → landing `/c/:id` → "Buy" → checkout → "Pay" → lands in the course (now ACTIVE); Profile → "My purchases" shows the order. Free course still shows "Enroll" → Pending.

- [ ] **Step 4: Stop servers**

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null
true
```

No commit.

---

## Self-Review (author checklist — completed)

- **Spec coverage (§5):** public landing `/c/[id]` (server) + CTA branching (login/buy/enroll/continue/pending) — Task 2; mock checkout — Task 3; price inputs in create + builder — Task 4; price badge + buy link on CourseCard, purchases page + profile button — Task 5; `price` on types + middleware `/c/` public — Task 1. ✓
- **Public access:** `/c/` is outside the `(app)` group (no app shell) and allowed in middleware for everyone; the landing fetches the public endpoint via `serverApi` (anon → no token → public route). Authenticated users are NOT bounced off `/c/`. ✓
- **Placeholder scan:** none. **Type consistency:** `PublicCourse`/`MyStatus`/`Purchase` and `price` on `CourseListItem`/`CourseDetail` defined in `lib/types.ts` and consumed by landing/CTA/checkout/card/purchases/builder. ✓
- **Turbopack purity:** new SCSS nests element selectors under classes (`.field input`, `.priceRow input`, `.resultsTable`-style). ✓
- **Completes subproject B.** Next: subproject C (mock email confirmation on registration).
