# Plan 3b — Profile + Student CoursePage (lessons + test-taking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the student-facing course experience — Profile editing, the CoursePage (structure tree + lesson viewer + test taking with timer and results) — using TanStack Query + local state (no Redux). Fix the legacy bugs along the way.

**Architecture:** Client components with TanStack Query against the NestJS API via `clientApi`. `GET /api/courses/:id` returns course + nested sections/lessons/tests + `enrollmentStatus` + `progress` in one query. Lesson completion and test submission invalidate the course query so the structure progress updates. The test session (questions, answers map, countdown, result) is local React state in `TestViewer`.

**Tech Stack:** Next.js 15, TypeScript, TanStack Query, react-hook-form + zod, sass. Builds on Plan 3a (auth, `clientApi`, providers, shell).

> **Tests out of scope.** Verification: build, dev-server boot, plus a programmatic logged-in API check and a manual browser walkthrough.

> **Env note:** Node not on default PATH — prepend `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Backend on :5000 (`lsof -ti tcp:5000 | xargs kill -9` first), frontend on :3000. Frontend dir: `/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend`.

> **Carried gotchas:** Turbopack CSS Modules require pure selectors (no bare element selectors at top level — wrap in a class or nest under one). next-auth typing handled in Plan 3a. `clientApi` with a `FormData` body must NOT set `Content-Type` (let the browser set the multipart boundary) — it already only sets `Authorization`.

> **Backend responses used:**
> - `GET /api/users/me` → `{id,email,role,profile:{id,firstName,lastName,avatarUrl,bio,userId}}`
> - `PUT /api/users/me/profile` (FormData: firstName,lastName,bio,avatar?) → updated profile
> - `GET /api/courses/:id` → `{id,title,description,imageUrl,teacherId,sections:[{id,title,order,lessons:[{id,title,content,videoUrl,order,sectionId,test:{id,lessonId,title,timeLimit,passingScore}|null}]}],enrollmentStatus,progress:{percent,total,completed,lessons:number[],tests:number[]}|null}`
> - `POST /api/courseProgress/lessons/:id/start` and `/complete`
> - `GET /api/tests/:id` → full test `{id,lessonId,title,timeLimit,passingScore,questions:[{id,testId,text,type,difficulty,answers:[{id,questionId,text,isCorrect}]}]}`
> - `POST /api/tests/:id/start` → `{testResultId,attempt,timeLimit,startedAt,questions:[{id,testId,text,type,difficulty,answers:[{id,text}]}]}`
> - `POST /api/tests/:testResultId/submit` body `{answers:{[questionId]:answerId[]}}` → `{score,passed,correct,total,finishedAt}`
> - `GET /api/tests/:testId/my-result` → `{id,score,passed,finishedAt,details:[{questionId,correctAnswerIds:number[],userAnswerIds:number[]}]}|null`

---

## File Structure (created by this plan)

```
frontend/src/
  lib/types.ts                          # MODIFY: add course/test/profile types
  app/(app)/profile/
    page.tsx
    ProfileForm.tsx
    profile.module.scss
  app/(app)/courses/[id]/
    page.tsx                            # CoursePage (client)
    course.module.scss
  components/course/
    StructurePanel.tsx  StructurePanel.module.scss
    ViewerPanel.tsx
    LessonViewer.tsx    LessonViewer.module.scss
    TestViewer.tsx      TestViewer.module.scss
    ProgressBar.tsx     ProgressBar.module.scss
    ProgressIcon.tsx    ProgressIcon.module.scss
```

---

## Task 1: Extend shared types

**Files:** Modify `frontend/src/lib/types.ts`

- [ ] **Step 1: Append these types to `src/lib/types.ts`** (keep existing `Role`, `EnrollmentStatus`, `SessionUser`, `CourseListItem`)

```typescript
export type QuestionType = 'SINGLE' | 'MULTIPLE';

export interface UserProfile {
  id: number;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  userId: number;
}

export interface Me {
  id: number;
  email: string;
  role: Role;
  profile: UserProfile | null;
}

export interface TestLite {
  id: number;
  lessonId: number;
  title: string;
  timeLimit: number;
  passingScore: number;
}

export interface Lesson {
  id: number;
  title: string;
  content: string | null;
  videoUrl: string | null;
  order: number;
  sectionId: number;
  test: TestLite | null;
}

export interface Section {
  id: number;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface CourseProgress {
  percent: number;
  total: number;
  completed: number;
  lessons: number[];
  tests: number[];
}

export interface CourseDetail {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  teacherId: number;
  sections: Section[];
  enrollmentStatus: EnrollmentStatus | null;
  progress: CourseProgress | null;
}

export type ActiveItem =
  | { type: 'SECTION'; id: number }
  | { type: 'LESSON'; id: number }
  | { type: 'TEST'; id: number }
  | null;

export interface Answer {
  id: number;
  questionId: number;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: number;
  testId: number;
  text: string;
  type: QuestionType;
  difficulty: number;
  answers: Answer[];
}

export interface TestFull {
  id: number;
  lessonId: number;
  title: string;
  timeLimit: number;
  passingScore: number;
  questions: Question[];
}

export interface SessionAnswer {
  id: number;
  text: string;
}

export interface SessionQuestion {
  id: number;
  testId: number;
  text: string;
  type: QuestionType;
  difficulty: number;
  answers: SessionAnswer[];
}

export interface TestStartResponse {
  testResultId: number;
  attempt: number;
  timeLimit: number;
  startedAt: string;
  questions: SessionQuestion[];
}

export interface SubmitResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  finishedAt: string;
}

export interface MyTestResultDetail {
  questionId: number;
  correctAnswerIds: number[];
  userAnswerIds: number[];
}

export interface MyTestResult {
  id: number;
  score: number;
  passed: boolean;
  finishedAt: string;
  details: MyTestResultDetail[];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/lib/types.ts
git commit -m "feat(frontend): add course/test/profile shared types"
```

---

## Task 2: Profile page

**Files:** Create `frontend/src/app/(app)/profile/profile.module.scss`, `ProfileForm.tsx`, `page.tsx`

- [ ] **Step 1: `profile.module.scss`**

```scss
.profile {
  max-width: 600px;
  margin: 0 auto;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 14px;
    font-weight: 500;
  }

  input,
  textarea {
    padding: 10px 12px;
    border: 1px solid #dcdde1;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;

    &:focus {
      outline: none;
      border-color: #4c6ef5;
    }

    &:disabled {
      background: #f1f5f9;
      color: #64748b;
    }
  }
}

.avatarBlock {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  background: #3b82f6;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.button {
  background: #3b82f6;
  color: #fff;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;

  &:hover {
    background: #2563eb;
  }

  &:disabled {
    background: #93c5fd;
  }
}

.error {
  color: #e03131;
  font-size: 12px;
}

.saved {
  color: #16a34a;
  font-size: 14px;
}
```

- [ ] **Step 2: `ProfileForm.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../../lib/api/client';
import type { Me, UserProfile } from '../../../lib/types';
import styles from './profile.module.scss';

const ASSET_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
).replace(/\/api$/, '');

const MAX = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const schema = z.object({
  firstName: z.string().max(50, 'Too long').optional(),
  lastName: z.string().max(50, 'Too long').optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  avatar: z
    .instanceof(File)
    .optional()
    .refine((f) => !f || f.size <= MAX, 'Max size 2MB')
    .refine((f) => !f || TYPES.includes(f.type), 'Unsupported format'),
});

type FormValues = z.infer<typeof schema>;

export function ProfileForm() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });

  const [preview, setPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (me?.profile) {
      reset({
        firstName: me.profile.firstName ?? '',
        lastName: me.profile.lastName ?? '',
        bio: me.profile.bio ?? '',
      });
    }
  }, [me, reset]);

  const mutation = useMutation({
    mutationFn: (fd: FormData) =>
      clientApi<UserProfile>('/users/me/profile', {
        method: 'PUT',
        body: fd,
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const onSubmit = handleSubmit((values) => {
    setSaved(false);
    const fd = new FormData();
    fd.append('firstName', values.firstName ?? '');
    fd.append('lastName', values.lastName ?? '');
    fd.append('bio', values.bio ?? '');
    if (values.avatar) fd.append('avatar', values.avatar);
    mutation.mutate(fd);
  });

  if (!me) return <p>Loading…</p>;

  const currentAvatar = me.profile?.avatarUrl
    ? `${ASSET_BASE}${me.profile.avatarUrl}`
    : null;
  const shown = preview ?? currentAvatar;
  const initial = me.email.charAt(0).toUpperCase();

  return (
    <div className={styles.profile}>
      <h1>Profile</h1>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.avatarBlock}>
          <div className={styles.avatar}>
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt="avatar" />
            ) : (
              initial
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) {
                setValue('avatar', file, { shouldValidate: true });
                setPreview(URL.createObjectURL(file));
              }
            }}
          />
        </div>
        {errors.avatar && (
          <span className={styles.error}>{errors.avatar.message}</span>
        )}

        <div className={styles.field}>
          <label>Email</label>
          <input value={me.email} disabled />
        </div>
        <div className={styles.field}>
          <label>First name</label>
          <input {...register('firstName')} />
          {errors.firstName && (
            <span className={styles.error}>{errors.firstName.message}</span>
          )}
        </div>
        <div className={styles.field}>
          <label>Last name</label>
          <input {...register('lastName')} />
          {errors.lastName && (
            <span className={styles.error}>{errors.lastName.message}</span>
          )}
        </div>
        <div className={styles.field}>
          <label>Bio</label>
          <textarea rows={4} {...register('bio')} />
          {errors.bio && (
            <span className={styles.error}>{errors.bio.message}</span>
          )}
        </div>

        {saved && <span className={styles.saved}>Saved ✓</span>}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```typescript
import { ProfileForm } from './ProfileForm';

export default function ProfilePage() {
  return <ProfileForm />;
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add "frontend/src/app/(app)/profile"
git commit -m "feat(frontend): add profile page (rhf + zod, avatar upload + preview)"
```

---

## Task 3: Progress components

**Files:** Create `frontend/src/components/course/ProgressBar.tsx` + `.module.scss`, `ProgressIcon.tsx` + `.module.scss`

- [ ] **Step 1: `ProgressBar.tsx`**

```typescript
import styles from './ProgressBar.module.scss';

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        Progress: <strong>{value}%</strong>
      </div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `ProgressBar.module.scss`**

```scss
.wrapper {
  margin: 12px 0 20px;
}

.label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 6px;
}

.bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: #22c55e;
  transition: width 0.3s ease;
}
```

- [ ] **Step 3: `ProgressIcon.tsx`**

```typescript
import styles from './ProgressIcon.module.scss';

export function ProgressIcon({ completed }: { completed: boolean }) {
  return (
    <span
      className={`${styles.icon} ${completed ? styles.done : styles.pending}`}
    >
      ✓
    </span>
  );
}
```

- [ ] **Step 4: `ProgressIcon.module.scss`**

```scss
.icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  border: 2px solid;
  font-size: 11px;
}

.pending {
  color: #9ca3af;
  border-color: #9ca3af;
}

.done {
  color: #22c55e;
  border-color: #22c55e;
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/course/ProgressBar.tsx frontend/src/components/course/ProgressBar.module.scss frontend/src/components/course/ProgressIcon.tsx frontend/src/components/course/ProgressIcon.module.scss
git commit -m "feat(frontend): add ProgressBar and ProgressIcon"
```

---

## Task 4: CoursePage + StructurePanel + ViewerPanel

**Files:** Create `frontend/src/app/(app)/courses/[id]/page.tsx` + `course.module.scss`, `frontend/src/components/course/StructurePanel.tsx` + `.module.scss`, `ViewerPanel.tsx`

- [ ] **Step 1: `components/course/StructurePanel.tsx`**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import type {
  ActiveItem,
  CourseDetail,
  SessionUser,
} from '../../lib/types';
import { ProgressBar } from './ProgressBar';
import { ProgressIcon } from './ProgressIcon';
import styles from './StructurePanel.module.scss';

export function StructurePanel({
  course,
  user,
  active,
  onSelect,
}: {
  course: CourseDetail;
  user: SessionUser;
  active: ActiveItem;
  onSelect: (item: ActiveItem) => void;
}) {
  const router = useRouter();
  const isStudent = user.role === 'STUDENT';
  const isOwner = user.id === course.teacherId || user.role === 'ADMIN';
  const progress = course.progress;
  const lessonDone = (id: number) => !!progress?.lessons.includes(id);
  const testDone = (id: number) => !!progress?.tests.includes(id);

  const isActive = (type: string, id: number) =>
    active?.type === type && active.id === id;

  return (
    <aside className={styles.left}>
      <div className={styles.courseHeader}>
        <h3 className={styles.courseTitle}>{course.title}</h3>
        {isOwner && (
          <button
            className={styles.manageBtn}
            onClick={() => router.push(`/courses/${course.id}/manage`)}
          >
            ⚙ Manage
          </button>
        )}
      </div>

      {isStudent && progress && <ProgressBar value={progress.percent} />}

      <ul className={styles.tree}>
        {course.sections.map((section) => (
          <li key={section.id} className={styles.section}>
            <div className={styles.row}>
              <span
                className={`${styles.item} ${
                  isActive('SECTION', section.id) ? styles.active : ''
                }`}
                onClick={() => onSelect({ type: 'SECTION', id: section.id })}
              >
                {section.title}
              </span>
            </div>
            <ul className={styles.sublist}>
              {section.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <div className={styles.row}>
                    <span
                      className={`${styles.item} ${
                        isActive('LESSON', lesson.id) ? styles.active : ''
                      }`}
                      onClick={() =>
                        onSelect({ type: 'LESSON', id: lesson.id })
                      }
                    >
                      {isStudent && (
                        <ProgressIcon completed={lessonDone(lesson.id)} />
                      )}
                      {lesson.title}
                    </span>
                  </div>
                  {lesson.test && (
                    <div className={`${styles.row} ${styles.sublist}`}>
                      <span
                        className={`${styles.item} ${styles.test} ${
                          isActive('TEST', lesson.test.id) ? styles.active : ''
                        }`}
                        onClick={() =>
                          onSelect({ type: 'TEST', id: lesson.test!.id })
                        }
                      >
                        {isStudent && (
                          <ProgressIcon completed={testDone(lesson.test.id)} />
                        )}
                        📝 {lesson.test.title}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 2: `components/course/StructurePanel.module.scss`**

```scss
.left {
  background: #f6f7fb;
  padding: 16px;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
}

.courseHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.courseTitle {
  font-size: 17px;
}

.manageBtn {
  background: #e2e8f0;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: #cbd5e1;
  }
}

.tree {
  list-style: none;
  padding: 0;
  margin: 0;
}

.section {
  margin-bottom: 16px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;

  &:hover {
    background: rgba(37, 99, 235, 0.08);
  }
}

.active {
  background: #2563eb;
  color: #fff;

  &:hover {
    background: #2563eb;
  }
}

.sublist {
  padding-left: 16px;
  margin-top: 6px;
  list-style: none;
}

.test {
  font-size: 13px;
  background: rgba(37, 99, 235, 0.06);
}
```

- [ ] **Step 3: `components/course/ViewerPanel.tsx`**

```typescript
'use client';

import type { ActiveItem, CourseDetail, SessionUser } from '../../lib/types';
import { LessonViewer } from './LessonViewer';
import { TestViewer } from './TestViewer';

export function ViewerPanel({
  active,
  course,
  user,
}: {
  active: ActiveItem;
  course: CourseDetail;
  user: SessionUser;
}) {
  if (!active) {
    return <p style={{ color: '#6b7280' }}>Select a lesson or test on the left 👈</p>;
  }
  if (active.type === 'SECTION') {
    return <p style={{ color: '#6b7280' }}>📚 A section groups lessons.</p>;
  }
  if (active.type === 'LESSON') {
    const lesson = course.sections
      .flatMap((s) => s.lessons)
      .find((l) => l.id === active.id);
    if (!lesson) return <p>Lesson not found.</p>;
    return <LessonViewer lesson={lesson} courseId={course.id} user={user} />;
  }
  return <TestViewer testId={active.id} courseId={course.id} user={user} />;
}
```

- [ ] **Step 4: `app/(app)/courses/[id]/course.module.scss`**

```scss
.page {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 0;
  min-height: calc(100vh - 64px - 48px - 48px);
}

.content {
  padding: 24px;
  overflow-y: auto;
}

.header {
  margin-bottom: 16px;

  h1 {
    font-size: 22px;
  }

  p {
    color: #475569;
    font-size: 14px;
  }
}

.state {
  padding: 24px;
}
```

- [ ] **Step 5: `app/(app)/courses/[id]/page.tsx`**

```typescript
'use client';

import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../../../lib/api/client';
import type { ActiveItem, CourseDetail, SessionUser } from '../../../../lib/types';
import { StructurePanel } from '../../../../components/course/StructurePanel';
import { ViewerPanel } from '../../../../components/course/ViewerPanel';
import styles from './course.module.scss';

export default function CoursePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: session } = useSession();
  const [active, setActive] = useState<ActiveItem>(null);

  const { data: course, isLoading, isError, error } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });

  if (!session) return null;
  const user = session.user as SessionUser;

  if (isLoading) return <p className={styles.state}>Loading…</p>;
  if (isError)
    return (
      <p className={styles.state}>
        {String((error as Error).message).includes('403')
          ? 'You are not enrolled in this course.'
          : 'Failed to load course.'}
      </p>
    );
  if (!course) return null;

  return (
    <div className={styles.page}>
      <StructurePanel
        course={course}
        user={user}
        active={active}
        onSelect={setActive}
      />
      <div className={styles.content}>
        <div className={styles.header}>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
        </div>
        <ViewerPanel active={active} course={course} user={user} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/course/StructurePanel.tsx frontend/src/components/course/StructurePanel.module.scss frontend/src/components/course/ViewerPanel.tsx "frontend/src/app/(app)/courses"
git commit -m "feat(frontend): add CoursePage, StructurePanel (view), ViewerPanel"
```

---

## Task 5: LessonViewer

**Files:** Create `frontend/src/components/course/LessonViewer.tsx` + `.module.scss`

Fixes the legacy bugs: returns the start call, destroys the YT player on lesson change, and adds a manual "Mark complete" button (for lessons without video).

- [ ] **Step 1: `LessonViewer.tsx`**

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { Lesson, SessionUser } from '../../lib/types';
import styles from './LessonViewer.module.scss';

declare global {
  interface Window {
    YT?: {
      Player: new (el: string, opts: unknown) => { destroy: () => void };
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function youtubeId(url: string | null): string | null {
  if (!url || !url.includes('youtube')) return null;
  try {
    return new URL(url).searchParams.get('v');
  } catch {
    return null;
  }
}

export function LessonViewer({
  lesson,
  courseId,
  user,
}: {
  lesson: Lesson;
  courseId: number;
  user: SessionUser;
}) {
  const queryClient = useQueryClient();
  const isStudent = user.role === 'STUDENT';
  const ytId = youtubeId(lesson.videoUrl);
  const playerRef = useRef<{ destroy: () => void } | null>(null);

  const startMutation = useMutation({
    mutationFn: () =>
      clientApi(`/courseProgress/lessons/${lesson.id}/start`, {
        method: 'POST',
      }),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      clientApi(`/courseProgress/lessons/${lesson.id}/complete`, {
        method: 'POST',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
  });

  // Start the lesson once when a student opens it.
  useEffect(() => {
    if (isStudent) startMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // YouTube IFrame API + auto-complete on ENDED.
  useEffect(() => {
    if (!ytId || !isStudent) return;

    const initPlayer = () => {
      if (!window.YT) return;
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: ytId,
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === window.YT!.PlayerState.ENDED) {
              completeMutation.mutate();
            }
          },
        },
      });
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      window.onYouTubeIframeAPIReady = initPlayer;
      document.body.appendChild(tag);
    } else {
      initPlayer();
    }

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, lesson.id]);

  return (
    <div className={styles.lesson}>
      <h2 className={styles.title}>{lesson.title}</h2>

      {ytId ? (
        <div className={styles.videoWrapper}>
          <div id="yt-player" />
        </div>
      ) : lesson.videoUrl ? (
        <div className={styles.videoWrapper}>
          <iframe
            src={lesson.videoUrl}
            title={lesson.title}
            allowFullScreen
          />
        </div>
      ) : null}

      <div
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: lesson.content ?? '' }}
      />

      {isStudent && (
        <button
          className={styles.completeBtn}
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? 'Saving…' : 'Mark as complete'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `LessonViewer.module.scss`**

```scss
.lesson {
  max-width: 900px;
}

.title {
  font-size: 24px;
  margin-bottom: 16px;
}

.videoWrapper {
  position: relative;
  padding-bottom: 56.25%;
  height: 0;
  margin-bottom: 16px;

  iframe,
  :global(#yt-player) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 8px;
  }
}

.content {
  font-size: 15px;
  line-height: 1.6;
}

.completeBtn {
  margin-top: 20px;
  background: #22c55e;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: #16a34a;
  }

  &:disabled {
    background: #86efac;
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/course/LessonViewer.tsx frontend/src/components/course/LessonViewer.module.scss
git commit -m "feat(frontend): add LessonViewer (YouTube embed, start/complete, fixes)"
```

---

## Task 6: TestViewer (test taking)

**Files:** Create `frontend/src/components/course/TestViewer.tsx` + `.module.scss`

Local state for the session (questions, answers, countdown, result). Fixes the legacy dropped-result bug by keeping the submit response in state.

- [ ] **Step 1: `TestViewer.tsx`**

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type {
  MyTestResult,
  SessionUser,
  SubmitResult,
  TestFull,
  TestStartResponse,
} from '../../lib/types';
import styles from './TestViewer.module.scss';

export function TestViewer({
  testId,
  courseId,
  user,
}: {
  testId: number;
  courseId: number;
  user: SessionUser;
}) {
  const queryClient = useQueryClient();
  const isStudent = user.role === 'STUDENT';

  const { data: test } = useQuery<TestFull>({
    queryKey: ['test', testId],
    queryFn: () => clientApi<TestFull>(`/tests/${testId}`),
  });

  const { data: myResult } = useQuery<MyTestResult | null>({
    queryKey: ['myTestResult', testId],
    queryFn: () => clientApi<MyTestResult | null>(`/tests/${testId}/my-result`),
    enabled: isStudent,
  });

  const [session, setSession] = useState<TestStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const submittingRef = useRef(false);

  const startMutation = useMutation({
    mutationFn: () =>
      clientApi<TestStartResponse>(`/tests/${testId}/start`, { method: 'POST' }),
    onSuccess: (data) => {
      setSession(data);
      setAnswers({});
      setSubmitted(null);
      setTimeLeft(data.timeLimit * 60);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (resultId: number) =>
      clientApi<SubmitResult>(`/tests/${resultId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      }),
    onSuccess: (data) => {
      setSubmitted(data);
      setSession(null);
      setTimeLeft(null);
      queryClient.invalidateQueries({ queryKey: ['myTestResult', testId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    },
  });

  function doSubmit() {
    if (!session || submittingRef.current) return;
    submittingRef.current = true;
    submitMutation.mutate(session.testResultId);
  }

  // Countdown.
  useEffect(() => {
    if (!session || timeLeft === null) return;
    if (timeLeft <= 0) {
      doSubmit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => (v ?? 0) - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, session]);

  if (!test) return <p>Loading…</p>;

  // ===== Teacher: results table =====
  if (!isStudent) {
    return <TeacherResults testId={testId} />;
  }

  // ===== In progress =====
  if (session) {
    const mins = Math.floor((timeLeft ?? 0) / 60);
    const secs = ((timeLeft ?? 0) % 60).toString().padStart(2, '0');

    function toggle(qId: number, aId: number, type: string) {
      setAnswers((prev) => {
        const cur = prev[qId] ?? [];
        const next =
          type === 'SINGLE'
            ? [aId]
            : cur.includes(aId)
              ? cur.filter((x) => x !== aId)
              : [...cur, aId];
        return { ...prev, [qId]: next };
      });
    }

    return (
      <div className={styles.card}>
        <div className={styles.timer}>
          ⏱ {mins}:{secs}
        </div>
        {session.questions.map((q) => (
          <div key={q.id} className={styles.detailQuestion}>
            <p>
              <strong>{q.text}</strong>
            </p>
            {q.answers.map((a) => (
              <label key={a.id} className={styles.answerRow}>
                <input
                  type={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                  name={`q-${q.id}`}
                  checked={(answers[q.id] ?? []).includes(a.id)}
                  onChange={() => toggle(q.id, a.id, q.type)}
                />
                {a.text}
              </label>
            ))}
          </div>
        ))}
        <button
          className={styles.submitBtn}
          onClick={doSubmit}
          disabled={submitMutation.isPending}
        >
          Submit
        </button>
      </div>
    );
  }

  // ===== Result =====
  const finalResult = submitted
    ? { score: submitted.score, passed: submitted.passed }
    : myResult
      ? { score: myResult.score, passed: myResult.passed }
      : null;

  if (finalResult) {
    const isPerfect = finalResult.score === 100;
    return (
      <div className={styles.resultCard}>
        <div className={styles.resultLayout}>
          <aside className={styles.resultSide}>
            <div className={styles.score}>{finalResult.score}%</div>
            <p className={finalResult.passed ? styles.passed : styles.failed}>
              {finalResult.passed ? 'Passed' : 'Failed'}
            </p>
            <p>Passing score: {test.passingScore}%</p>
            {!isPerfect && (
              <button
                className={styles.startBtn}
                onClick={() => startMutation.mutate()}
              >
                Retry
              </button>
            )}
          </aside>
          <div className={styles.resultMain}>
            <div className={styles.details}>
              {test.questions.map((q) => {
                const d = myResult?.details.find((x) => x.questionId === q.id);
                return (
                  <div key={q.id} className={styles.detailQuestion}>
                    <p>
                      <strong>{q.text}</strong>
                    </p>
                    {q.answers.map((a) => {
                      const picked = d?.userAnswerIds.includes(a.id);
                      const correct = d?.correctAnswerIds.includes(a.id);
                      return (
                        <div
                          key={a.id}
                          className={`${styles.answerRow} ${
                            correct ? styles.correct : ''
                          } ${picked && !correct ? styles.wrong : ''}`}
                        >
                          {correct ? '✔' : picked ? '✖' : ''} {a.text}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Preview / start =====
  return (
    <div className={styles.card}>
      <h2>{test.title}</h2>
      <div className={styles.meta}>
        <span className={styles.metaBox}>⏱ {test.timeLimit} min</span>
        <span className={styles.metaBox}>Pass: {test.passingScore}%</span>
        <span className={styles.metaBox}>
          {test.questions.length} questions
        </span>
      </div>
      <button
        className={styles.startBtn}
        onClick={() => startMutation.mutate()}
        disabled={startMutation.isPending}
      >
        Start test
      </button>
    </div>
  );
}

function TeacherResults({ testId }: { testId: number }) {
  const { data: rows } = useQuery<
    {
      userId: number;
      userName: string;
      email: string;
      attempt: number;
      score: number | null;
      passed: boolean | null;
      finishedAt: string | null;
    }[]
  >({
    queryKey: ['testResults', testId],
    queryFn: () => clientApi(`/tests/${testId}/results`),
  });

  if (!rows) return <p>Loading…</p>;
  return (
    <table className={styles.resultsTable}>
      <thead>
        <tr>
          <th>Student</th>
          <th>Email</th>
          <th>Attempt</th>
          <th>Score</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.userId}>
            <td>{r.userName}</td>
            <td>{r.email}</td>
            <td>{r.attempt}</td>
            <td>{r.score}%</td>
            <td className={r.passed ? styles.passed : styles.failed}>
              {r.passed ? 'Passed' : 'Failed'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: `TestViewer.module.scss`**

```scss
.card,
.resultCard {
  max-width: 1200px;
  margin: 0 auto;
}

.meta {
  display: flex;
  gap: 16px;
  font-size: 14px;
  margin: 16px 0;
}

.metaBox {
  background: #eef2ff;
  padding: 10px 12px;
  border-radius: 8px;
}

.timer {
  margin-bottom: 16px;
  font-weight: 600;
  font-size: 18px;
}

.detailQuestion {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
  margin-bottom: 14px;
}

.answerRow {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.correct {
  background: #ecfdf5;
  color: #166534;
}

.wrong {
  background: #fef2f2;
  color: #991b1b;
}

.startBtn,
.submitBtn {
  background: #2563eb;
  color: #fff;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
  margin-top: 12px;

  &:hover {
    background: #1d4ed8;
  }

  &:disabled {
    background: #93c5fd;
  }
}

.resultLayout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
}

.resultSide {
  position: sticky;
  top: 24px;
  align-self: start;
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
}

.resultMain {
  min-width: 0;
}

.details {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.score {
  font-size: 48px;
  font-weight: 800;
}

.passed {
  color: #16a34a;
  font-weight: 600;
}

.failed {
  color: #dc2626;
  font-weight: 600;
}

.resultsTable {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    border: 1px solid #e5e7eb;
    padding: 8px 12px;
    text-align: left;
    font-size: 14px;
  }

  th {
    background: #f1f5f9;
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/course/TestViewer.tsx frontend/src/components/course/TestViewer.module.scss
git commit -m "feat(frontend): add TestViewer (taking, timer, scoring result, teacher table)"
```

---

## Task 7: Build + verification

**Files:** none (runtime).

- [ ] **Step 1: Build**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
rm -rf .next
npm run build
```
Expected: `✓ Compiled successfully` with routes `/`, `/login`, `/register`, `/profile`, `/courses/[id]`. If a type/lint error, STOP and report exact error.

- [ ] **Step 2: Start servers (backend + frontend dev)**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest.log 2>&1 & ) ; sleep 10
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; sleep 1
( npm run dev > /tmp/next.log 2>&1 & ) ; sleep 8
grep -iE "ready|error" /tmp/next.log | head -3
```

- [ ] **Step 3: Logged-in API smoke (student) via the NextAuth CSRF flow**

```bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
JAR=/tmp/s1jar.txt; rm -f $JAR
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).csrfToken')
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials \
  -H 'Content-Type: application/x-www-form-urlencoded' -H 'X-Auth-Return-Redirect: 1' \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=student1@example.com" --data-urlencode "password=password123" >/dev/null
# session present?
curl -s -b $JAR http://localhost:3000/api/auth/session | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({email:j.user.email, role:j.user.role})'
# course page renders server shell (the data loads client-side)
curl -s -b $JAR -o /dev/null -w "course page HTTP %{http_code}\n" http://localhost:3000/courses/1
curl -s -b $JAR -o /dev/null -w "profile page HTTP %{http_code}\n" http://localhost:3000/profile
```
Expected: session `{email:student1@example.com, role:STUDENT}`; both pages return `200`.

- [ ] **Step 4: MANUAL browser walkthrough** (record results)

Log in as `student1@example.com` / `password123`:
1. Open the seeded course → CoursePage shows the structure tree with progress bar.
2. Click the lesson → content renders; click "Mark as complete" → the lesson's progress check turns green and the progress bar rises.
3. Click the test → "Start test" → answer the question → Submit → score 100%, passed, per-answer green highlight; the test check turns green and progress reaches 100%.
4. Open Profile → change first/last name, pick an avatar (preview shows) → Save → reload shows persisted values/avatar.

- [ ] **Step 5: Stop servers**

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null
true
```

No commit (verification only).

---

## Self-Review (author checklist — completed)

- **Coverage:** Profile (rhf+zod, avatar upload + live preview, Task 2); CoursePage single-query data + StructurePanel view tree with per-item ProgressIcon + ProgressBar (Tasks 3–4); LessonViewer with YouTube embed + start/complete (Task 5); TestViewer full taking flow — preview → timed session (SINGLE/MULTIPLE) → submit scoring → result with per-answer correct/wrong highlight + retry, plus teacher results table (Task 6). ✓
- **Legacy bugs fixed (documented):** `startLesson` now actually fires via a mutation; YT player destroyed on lesson change (cleanup); submit response kept in local state (no dropped result); avatar live preview added; progress read from backend `lessons[]`/`tests[]` id-arrays (not status objects). ✓
- **Turbopack purity:** all element selectors are nested under classes (`.field input`, `.resultsTable th`); `:global(#yt-player)` used for the YT mount. ✓
- **Type consistency:** new types (`CourseDetail`, `Section`, `Lesson`, `TestFull`, `TestStartResponse`, `SubmitResult`, `MyTestResult`, `ActiveItem`, `Me`) defined in `lib/types.ts` and used across components. ✓
- **Deferred to Plan 3c:** teacher CreateCoursePage, CourseBuilder (edit-mode StructurePanel + LessonEditor + TestEditor), CourseManagementPage (enroll requests + student progress table). The `/courses/:id/manage` and `/teacher/...` links exist but their pages come in 3c.
