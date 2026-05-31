# Plan A2 — Student Cabinet (Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Home route into a role-aware dashboard (student: stats + continue-learning + searchable catalog + recent chats; teacher: my courses + create + catalog + chats), backed by a new `GET /api/dashboard` endpoint and a `?search=` param on the course list.

**Architecture:** Backend `DashboardModule` (`DashboardService` + `DashboardController`) reuses `ProgressService` (course progress) and `ChatService` (recent conversations) via module imports. Frontend Home (`/`) becomes a client dashboard using TanStack Query: one `['dashboard']` query plus a `['courses', search]` query for the catalog. Built on the Plan A1 UI kit + tokens.

**Tech Stack:** NestJS 11 + Prisma 6; Next.js 15 + TS + TanStack Query + UI kit.

> **Tests out of scope.** Verification = build, boot, `curl`, manual.

> **Env note:** Node not on default PATH — prepend `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Backend :5000 (free port first), frontend :3000. Postgres must run. Turbopack CSS Modules require pure selectors.

> **Spec:** `docs/superpowers/specs/2026-05-31-design-system-and-student-cabinet-design.md` (§6–7). Depends on Plan A1 (UI kit at `frontend/src/components/ui`).

---

## File Structure

```
backend/src/modules/
  dashboard/dashboard.service.ts
  dashboard/dashboard.controller.ts
  dashboard/dashboard.module.ts
  chat/chat.module.ts            # MODIFY: export ChatService
  courses/courses.service.ts     # MODIFY: add search param
  courses/courses.controller.ts  # MODIFY: pass ?search=
  ../app.module.ts               # MODIFY: register DashboardModule

frontend/src/
  lib/types.ts                                  # MODIFY: dashboard types
  app/(app)/page.tsx                            # REPLACE: dashboard (client)
  app/(app)/dashboard.module.scss
  components/dashboard/StatCards.tsx
  components/dashboard/ContinueLearning.tsx
  components/dashboard/Catalog.tsx
  components/dashboard/RecentChats.tsx
```

---

## Task 1: Backend — export ChatService + course search

**Files:** Modify `backend/src/modules/chat/chat.module.ts`, `courses/courses.service.ts`, `courses/courses.controller.ts`

- [ ] **Step 1: Export `ChatService` from ChatModule.** Replace `backend/src/modules/chat/chat.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
```

- [ ] **Step 2: Add a search param to `CoursesService.getCoursesForUser`.** In `backend/src/modules/courses/courses.service.ts`, replace the `getCoursesForUser` method with:

```typescript
  async getCoursesForUser(user: AuthUser, search?: string) {
    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            {
              description: { contains: search, mode: 'insensitive' as const },
            },
          ],
        }
      : {};
    const courses = await this.prisma.course.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        teacherId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (user.role !== 'STUDENT') {
      return courses;
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.id },
    });
    const map: Record<number, string> = Object.fromEntries(
      enrollments.map((e) => [e.courseId, e.status]),
    );
    return courses.map((course) => ({
      ...course,
      enrollmentStatus: map[course.id] ?? null,
    }));
  }
```

- [ ] **Step 3: Pass `?search=` in `CoursesController`.** In `backend/src/modules/courses/courses.controller.ts`, replace the `list` handler with (keep `@Query` imported — it already is):

```typescript
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.courses.getCoursesForUser(user, search);
  }
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/chat/chat.module.ts backend/src/modules/courses/courses.service.ts backend/src/modules/courses/courses.controller.ts
git commit -m "feat(backend): course catalog search param + export ChatService"
```

---

## Task 2: Backend — DashboardModule

**Files:** Create `backend/src/modules/dashboard/dashboard.service.ts`, `dashboard.controller.ts`, `dashboard.module.ts`; Modify `backend/src/app.module.ts`

- [ ] **Step 1: `dashboard.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { ChatService } from '../chat/chat.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
    private chat: ChatService,
  ) {}

  async getDashboard(user: AuthUser) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { firstName: true },
    });
    const name = profile?.firstName ?? null;
    const recentConversations = (
      await this.chat.listConversations(user.id)
    ).slice(0, 5);

    if (user.role !== 'STUDENT') {
      const teachingCourses = await this.prisma.course.findMany({
        where: { teacherId: user.id },
        select: { id: true, title: true, imageUrl: true },
        orderBy: { createdAt: 'desc' },
      });
      return { role: 'TEACHER', name, teachingCourses, recentConversations };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: {
        course: { select: { id: true, title: true, imageUrl: true } },
      },
    });

    let completed = 0;
    const continueLearning: {
      id: number;
      title: string;
      imageUrl: string | null;
      percent: number;
    }[] = [];
    for (const e of enrollments) {
      const p = await this.progress.getProgress(e.courseId, user.id);
      if (p.percent >= 100) {
        completed++;
      } else {
        continueLearning.push({
          id: e.course.id,
          title: e.course.title,
          imageUrl: e.course.imageUrl,
          percent: p.percent,
        });
      }
    }

    const lessonsCompleted = await this.prisma.lessonProgress.count({
      where: { userId: user.id, status: 'COMPLETED' },
    });
    const passedTests = await this.prisma.testResult.findMany({
      where: { userId: user.id, passed: true },
      distinct: ['testId'],
      select: { testId: true },
    });
    const agg = await this.prisma.testResult.aggregate({
      where: { userId: user.id, finishedAt: { not: null } },
      _avg: { score: true },
    });
    const avgScore =
      agg._avg.score === null ? null : Math.round(agg._avg.score);

    return {
      role: 'STUDENT',
      name,
      stats: {
        enrolled: enrollments.length,
        completed,
        lessonsCompleted,
        testsPassed: passedTests.length,
        avgScore,
      },
      continueLearning,
      recentConversations,
    };
  }
}
```

- [ ] **Step 2: `dashboard.controller.ts`**

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.dashboard.getDashboard(user);
  }
}
```

- [ ] **Step 3: `dashboard.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ProgressModule } from '../progress/progress.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ProgressModule, ChatModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

- [ ] **Step 4: Register in `backend/src/app.module.ts`** — add `import { DashboardModule } from './modules/dashboard/dashboard.module';` and append `DashboardModule` to the `imports` array (last).

- [ ] **Step 5: Build + boot check**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest-dash.log 2>&1 & ) ; sleep 11
grep -E "successfully started|ERROR|Mapped \{/api/dashboard" /tmp/nest-dash.log | head
# student dashboard
TT=$(curl -s -X POST http://localhost:5000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"student1@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
curl -s http://localhost:5000/api/dashboard -H "Authorization: Bearer $TT"
echo ""
# search
curl -s "http://localhost:5000/api/courses?search=type" -H "Authorization: Bearer $TT" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).map(c=>c.title))'
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; true
```
Expected: started; `Mapped {/api/dashboard, GET}`; dashboard JSON with `role:"STUDENT"`, `stats`, `continueLearning`, `recentConversations`; search returns `["Intro to TypeScript"]`. If it crashes, report.

- [ ] **Step 6: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/dashboard backend/src/app.module.ts
git commit -m "feat(backend): add dashboard module (stats, continue-learning, recent chats)"
```

---

## Task 3: Frontend — dashboard types + block components

**Files:** Modify `frontend/src/lib/types.ts`; Create `frontend/src/components/dashboard/StatCards.tsx`, `ContinueLearning.tsx`, `Catalog.tsx`, `RecentChats.tsx`

- [ ] **Step 1: Append dashboard types to `frontend/src/lib/types.ts`**

```typescript
export interface DashboardStats {
  enrolled: number;
  completed: number;
  lessonsCompleted: number;
  testsPassed: number;
  avgScore: number | null;
}

export interface ContinueCourse {
  id: number;
  title: string;
  imageUrl: string | null;
  percent: number;
}

export interface TeachingCourse {
  id: number;
  title: string;
  imageUrl: string | null;
}

export interface DashboardData {
  role: Role;
  name: string | null;
  stats?: DashboardStats;
  continueLearning?: ContinueCourse[];
  teachingCourses?: TeachingCourse[];
  recentConversations: Conversation[];
}
```

- [ ] **Step 2: `components/dashboard/StatCards.tsx`**

```typescript
import { Card } from '../ui';
import type { DashboardStats } from '../../lib/types';
import styles from '../../app/(app)/dashboard.module.scss';

export function StatCards({ stats }: { stats: DashboardStats }) {
  const items = [
    { label: 'Enrolled', value: stats.enrolled },
    { label: 'Completed', value: stats.completed },
    { label: 'Lessons done', value: stats.lessonsCompleted },
    {
      label: 'Avg score',
      value: stats.avgScore === null ? '—' : `${stats.avgScore}%`,
    },
  ];
  return (
    <div className={styles.stats}>
      {items.map((it) => (
        <Card key={it.label} className={styles.stat}>
          <div className={styles.statValue}>{it.value}</div>
          <div className={styles.statLabel}>{it.label}</div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `components/dashboard/ContinueLearning.tsx`**

```typescript
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Card, Button, EmptyState } from '../ui';
import type { ContinueCourse } from '../../lib/types';
import styles from '../../app/(app)/dashboard.module.scss';

export function ContinueLearning({ courses }: { courses: ContinueCourse[] }) {
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap size={28} />}
        title="No courses in progress yet"
      >
        <span>Enroll in a course below to get started.</span>
      </EmptyState>
    );
  }
  return (
    <div className={styles.continueGrid}>
      {courses.map((c) => (
        <Card key={c.id} className={styles.continueCard}>
          <div className={styles.continueTitle}>{c.title}</div>
          <div className={styles.bar}>
            <div className={styles.barFill} style={{ width: `${c.percent}%` }} />
          </div>
          <div className={styles.continueRow}>
            <span className={styles.percent}>{c.percent}%</span>
            <Link href={`/courses/${c.id}`}>
              <Button variant="primary">Continue</Button>
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `components/dashboard/Catalog.tsx`** (search + grid, reuses CourseCard)

```typescript
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import type { CourseListItem, SessionUser } from '../../lib/types';
import { CourseCard } from '../CourseCard';
import { Skeleton, EmptyState } from '../ui';
import styles from '../../app/(app)/dashboard.module.scss';

export function Catalog({ user }: { user: SessionUser }) {
  const [search, setSearch] = useState('');
  const { data: courses, isLoading } = useQuery<CourseListItem[]>({
    queryKey: ['courses', search],
    queryFn: () =>
      clientApi<CourseListItem[]>(
        `/courses${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  return (
    <div>
      <div className={styles.searchBox}>
        <Search size={18} />
        <input
          placeholder="Search courses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {isLoading ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={220} radius="var(--radius-lg)" />
          ))}
        </div>
      ) : (courses ?? []).length === 0 ? (
        <EmptyState title="No courses found" />
      ) : (
        <div className={styles.grid}>
          {(courses ?? []).map((c) => (
            <CourseCard key={c.id} course={c} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `components/dashboard/RecentChats.tsx`**

```typescript
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Card, EmptyState } from '../ui';
import type { Conversation } from '../../lib/types';
import styles from '../../app/(app)/dashboard.module.scss';

export function RecentChats({
  conversations,
}: {
  conversations: Conversation[];
}) {
  if (conversations.length === 0) {
    return (
      <EmptyState icon={<MessageSquare size={28} />} title="No chats yet" />
    );
  }
  return (
    <div className={styles.chats}>
      {conversations.map((c) => (
        <Link key={c.id} href={`/chat?c=${c.id}`}>
          <Card className={styles.chatItem}>
            <MessageSquare size={18} />
            <div>
              <div className={styles.chatTitle}>{c.title}</div>
              {c.lastMessage && (
                <div className={styles.chatLast}>{c.lastMessage.content}</div>
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Commit** (the shared `dashboard.module.scss` is created in Task 4; commit components together with it there — for now just verify they typecheck after Task 4. Skip a separate build here.)

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/lib/types.ts frontend/src/components/dashboard
git commit -m "feat(frontend): dashboard types + block components"
```

---

## Task 4: Frontend — dashboard page (replace Home) + styles

**Files:** Replace `frontend/src/app/(app)/page.tsx`; Create `frontend/src/app/(app)/dashboard.module.scss`; delete the old `home.module.scss` if unused

- [ ] **Step 1: `frontend/src/app/(app)/dashboard.module.scss`**

```scss
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.greeting {
  font-size: var(--fs-2xl);
  font-weight: 800;
  color: var(--color-text);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sectionTitle {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--color-text);
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
}

.stat {
  padding: var(--space-4);
  text-align: center;
}

.statValue {
  font-size: var(--fs-2xl);
  font-weight: 800;
  color: var(--color-primary);
}

.statLabel {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.continueGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.continueCard {
  padding: var(--space-4);
}

.continueTitle {
  font-weight: 600;
  margin-bottom: var(--space-3);
  color: var(--color-text);
}

.bar {
  height: 8px;
  background: var(--color-surface-2);
  border-radius: 999px;
  overflow: hidden;
}

.barFill {
  height: 100%;
  background: var(--color-success);
}

.continueRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-3);
}

.percent {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.searchBox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
  max-width: 420px;

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font-size: var(--fs-sm);
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-5);
}

.chats {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 520px;
}

.chatItem {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);

  &:hover {
    border-color: var(--color-primary);
  }
}

.chatTitle {
  font-weight: 600;
  font-size: var(--fs-sm);
}

.chatLast {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}

@media (max-width: 720px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 2: Replace `frontend/src/app/(app)/page.tsx`** (client dashboard)

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { clientApi } from '../../lib/api/client';
import type { DashboardData, SessionUser } from '../../lib/types';
import { StatCards } from '../../components/dashboard/StatCards';
import { ContinueLearning } from '../../components/dashboard/ContinueLearning';
import { Catalog } from '../../components/dashboard/Catalog';
import { RecentChats } from '../../components/dashboard/RecentChats';
import { Button, Skeleton } from '../../components/ui';
import styles from './dashboard.module.scss';

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => clientApi<DashboardData>('/dashboard'),
  });

  if (!session) return null;
  const user = session.user as SessionUser;
  const greetingName = data?.name || user.email;

  return (
    <div className={styles.page}>
      <h1 className={styles.greeting}>
        Hi, {greetingName} 👋
      </h1>

      {isLoading || !data ? (
        <Skeleton height={120} radius="var(--radius-lg)" />
      ) : data.role === 'STUDENT' ? (
        <>
          {data.stats && (
            <section className={styles.section}>
              <StatCards stats={data.stats} />
            </section>
          )}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Continue learning</h2>
            <ContinueLearning courses={data.continueLearning ?? []} />
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Catalog</h2>
            <Catalog user={user} />
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent chats</h2>
            <RecentChats conversations={data.recentConversations} />
          </section>
        </>
      ) : (
        <>
          <section className={styles.section}>
            <Link href="/teacher/courses/new">
              <Button variant="primary">+ Create course</Button>
            </Link>
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>My courses</h2>
            <div className={styles.grid}>
              {(data.teachingCourses ?? []).map((c) => (
                <Link key={c.id} href={`/teacher/courses/${c.id}/builder`}>
                  <div className={styles.continueCard} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                    <div className={styles.continueTitle}>{c.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Catalog</h2>
            <Catalog user={user} />
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent chats</h2>
            <RecentChats conversations={data.recentConversations} />
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Remove the now-unused old Home styles**

```bash
rm -f "/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend/src/app/(app)/home.module.scss"
```

- [ ] **Step 4: Build**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
rm -rf .next
npm run build
```
Expected: `✓ Compiled successfully`. If a type/lint/Turbopack error, STOP and report.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add "frontend/src/app/(app)/page.tsx" "frontend/src/app/(app)/dashboard.module.scss"
git rm --cached "frontend/src/app/(app)/home.module.scss" 2>/dev/null || true
git add -A "frontend/src/app/(app)"
git commit -m "feat(frontend): dashboard home (stats, continue, catalog search, recent chats)"
```

---

## Task 5: Verification

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
grep -iE "ready" /tmp/next.log | head -1
```

- [ ] **Step 2: Dashboard API (student + teacher) + home page renders**

```bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
B=http://localhost:5000/api
S1=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"student1@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
echo "student dashboard:"; curl -s $B/dashboard -H "Authorization: Bearer $S1" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({role:j.role, stats:j.stats, continue:(j.continueLearning||[]).length, chats:j.recentConversations.length})'
TT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
echo "teacher dashboard:"; curl -s $B/dashboard -H "Authorization: Bearer $TT" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({role:j.role, teaching:(j.teachingCourses||[]).length})'
echo "search:"; curl -s "$B/courses?search=type" -H "Authorization: Bearer $S1" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).map(c=>c.title))'
# home page (with a student session)
JAR=/tmp/dashjar.txt; rm -f $JAR
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).csrfToken')
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials -H 'Content-Type: application/x-www-form-urlencoded' -H 'X-Auth-Return-Redirect: 1' --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=student1@example.com" --data-urlencode "password=password123" >/dev/null
echo -n "home page HTTP: "; curl -s -b $JAR -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```
Expected: student dashboard `{role:"STUDENT", stats:{...}, continue:>=0, chats:>=0}`; teacher `{role:"TEACHER", teaching:1}`; search `["Intro to TypeScript"]`; home page `200`.

- [ ] **Step 3: MANUAL browser check** — log in as `student1@example.com` / `password123`:
  1. Home is now a dashboard: greeting, 4 stat cards, "Continue learning" (the seeded course with progress), Catalog with a working search box, recent chats.
  2. Type in search → catalog filters.
  3. Toggle dark/light → dashboard themes correctly.
  4. Log in as `teacher@example.com` → dashboard shows "Create course" + "My courses" + catalog + chats.

- [ ] **Step 4: Stop servers**

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null
true
```

No commit.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** `GET /api/dashboard` role-aware with the exact stats (enrolled/completed/lessonsCompleted/testsPassed/avgScore), continueLearning, recentConversations, teachingCourses (Task 2); `?search=` on `/courses` (Task 1); dashboard home with greeting + stats + continue + catalog-search + recent chats for student, and create + my-courses + catalog + chats for teacher (Tasks 3–4), all on the A1 UI kit. Matches spec §6–7. ✓
- **Reuse:** `ProgressService.getProgress` for per-course percent; `ChatService.listConversations` (ChatModule now exports it) for recent chats — no duplicated logic. ✓
- **Placeholder scan:** none. **Type consistency:** `DashboardData`/`DashboardStats`/`ContinueCourse`/`TeachingCourse` defined in `lib/types.ts` and consumed by the page + block components; backend response shape matches. ✓
- **Turbopack purity:** `dashboard.module.scss` nests element selectors under classes (`.searchBox input`, `.greeting` etc.); no bare top-level element selectors. ✓
- **Completes subproject A.** Next: B (landing + pricing + mock purchase), then C (mock email confirmation).
