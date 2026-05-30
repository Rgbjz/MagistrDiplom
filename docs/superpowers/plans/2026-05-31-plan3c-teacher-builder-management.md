# Plan 3c — Teacher: Create Course + Builder + Editors + Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the teacher experience — create a course, the course builder (edit-mode structure tree with section/lesson/test CRUD), the LessonEditor and TestEditor (questions/answers CRUD with auto-save), and the CourseManagementPage (enroll requests + student progress). Completes the LMS frontend.

**Architecture:** Client components using TanStack Query. Mutations call the NestJS API via `clientApi` and invalidate `['course', id]` (structure) or `['test', testId]` (test editing). Teacher-only pages gate on `session.user.role`. Fixes the legacy bugs along the way.

**Tech Stack:** Next.js 15, TypeScript, TanStack Query, sass. Builds on 3a/3b (`clientApi`, ProgressBar, types).

> **Tests out of scope.** Verification: build, dev-server boot, teacher login API smoke, manual browser walkthrough.

> **Env note:** Node not on default PATH — `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Backend :5000 (`lsof -ti tcp:5000 | xargs kill -9` first), frontend :3000. Frontend dir: `/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend`.

> **Carried gotchas:** Turbopack CSS Modules require pure selectors (nest element selectors under a class). `clientApi` with a `FormData` body must not set Content-Type.

> **Backend used:** `POST /api/courses` (FormData title,description,image?), `PATCH /api/courses/:id` (FormData), `DELETE /api/courses/:id`; `POST/PATCH/DELETE /api/sections...`, `.../lessons...`; `POST /api/tests/:lessonId`, `PATCH /api/tests/:id`, `DELETE /api/tests/:id`, `GET /api/tests/:id`; `POST /api/tests/:testId/questions`, `PATCH/DELETE /api/tests/questions/:questionId`, `POST /api/tests/questions/:questionId/answers`, `PATCH/DELETE /api/tests/answers/:answerId`; `GET /api/courses/:courseId/enrollments?status=PENDING`, `POST /api/courses/:id/enroll/:userId/approve|reject`, `GET /api/courses/:courseId/students/progress`.

---

## File Structure (created by this plan)

```
frontend/src/
  lib/types.ts                                  # MODIFY: add EnrollRequest, StudentProgress
  components/teacher/
    TeacherGuard.tsx                            # client role gate
    BuilderStructurePanel.tsx  + .module.scss
    BuilderEditorPanel.tsx
    LessonEditor.tsx           + .module.scss
    TestEditor.tsx             + .module.scss
    EnrollRequests.tsx         + .module.scss
  app/(app)/teacher/courses/new/
    page.tsx  CreateCourseForm.tsx  create-course.module.scss
  app/(app)/teacher/courses/[id]/builder/
    page.tsx  builder.module.scss
  app/(app)/courses/[id]/manage/
    page.tsx  ManagementView.tsx  management.module.scss
```

---

## Task 1: Types + TeacherGuard

**Files:** Modify `frontend/src/lib/types.ts`; Create `frontend/src/components/teacher/TeacherGuard.tsx`

- [ ] **Step 1: Append to `src/lib/types.ts`**

```typescript
export interface EnrollRequest {
  id: number;
  userId: number;
  courseId: number;
  status: EnrollmentStatus;
  student: {
    id: number;
    email: string;
    profile: {
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    } | null;
  };
}

export interface StudentProgress {
  userId: number;
  name: string;
  email: string;
  lessons: { completed: number; total: number };
  tests: { completed: number; total: number };
  averageScore: number | null;
}
```

- [ ] **Step 2: `src/components/teacher/TeacherGuard.tsx`** (redirects non-teachers; `allowAdmin` lets ADMIN through)

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function TeacherGuard({
  children,
  allowAdmin = true,
}: {
  children: ReactNode;
  allowAdmin?: boolean;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user.role;
  const ok = role === 'TEACHER' || (allowAdmin && role === 'ADMIN');

  useEffect(() => {
    if (status === 'authenticated' && !ok) router.replace('/');
  }, [status, ok, router]);

  if (status !== 'authenticated') return null;
  if (!ok) return null;
  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/lib/types.ts frontend/src/components/teacher/TeacherGuard.tsx
git commit -m "feat(frontend): add teacher types and TeacherGuard"
```

---

## Task 2: CreateCoursePage

**Files:** Create `frontend/src/app/(app)/teacher/courses/new/create-course.module.scss`, `CreateCourseForm.tsx`, `page.tsx`

- [ ] **Step 1: `create-course.module.scss`**

```scss
.wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;

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
  }
}

.previewImage {
  height: 180px;
  background: #eaeaf0;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.previewContent {
  padding-top: 16px;

  h3 {
    font-size: 18px;
  }

  p {
    color: #475569;
    font-size: 14px;
  }
}

.button {
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 15px;
  cursor: pointer;

  &:disabled {
    background: #93c5fd;
  }
}
```

- [ ] **Step 2: `CreateCourseForm.tsx`** (revokes the object URL; disables button while submitting)

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { clientApi } from '../../../../../lib/api/client';
import type { CourseListItem } from '../../../../../lib/types';
import styles from './create-course.module.scss';

export function CreateCourseForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const mutation = useMutation({
    mutationFn: (fd: FormData) =>
      clientApi<CourseListItem>('/courses', { method: 'POST', body: fd }),
    onSuccess: (course) => {
      router.push(`/teacher/courses/${course.id}/builder`);
    },
  });

  function submit() {
    if (!title.trim()) return;
    const fd = new FormData();
    fd.append('title', title);
    fd.append('description', description);
    if (image) fd.append('image', image);
    mutation.mutate(fd);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Create course</h1>
        <div className={styles.field}>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setImage(file);
              if (preview) URL.revokeObjectURL(preview);
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </div>
        <button
          className={styles.button}
          onClick={submit}
          disabled={mutation.isPending || !title.trim()}
        >
          {mutation.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>

      <div className={styles.card}>
        <h3>Preview</h3>
        <div className={styles.previewImage}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" />
          ) : (
            'No image'
          )}
        </div>
        <div className={styles.previewContent}>
          <h3>{title || 'Course title'}</h3>
          <p>{description || 'Course description'}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```typescript
import { TeacherGuard } from '../../../../../components/teacher/TeacherGuard';
import { CreateCourseForm } from './CreateCourseForm';

export default function CreateCoursePage() {
  return (
    <TeacherGuard allowAdmin={false}>
      <CreateCourseForm />
    </TeacherGuard>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add "frontend/src/app/(app)/teacher/courses/new"
git commit -m "feat(frontend): add CreateCoursePage (form + live preview, FormData)"
```

---

## Task 3: BuilderStructurePanel + BuilderEditorPanel

**Files:** Create `frontend/src/components/teacher/BuilderStructurePanel.tsx` + `.module.scss`, `BuilderEditorPanel.tsx`

- [ ] **Step 1: `BuilderStructurePanel.tsx`** (edit tree: add/delete/rename; mutations invalidate the course query)

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { ActiveItem, CourseDetail } from '../../lib/types';
import styles from './BuilderStructurePanel.module.scss';

type EditTarget = { type: 'SECTION' | 'LESSON' | 'TEST'; id: number } | null;

export function BuilderStructurePanel({
  course,
  active,
  onSelect,
}: {
  course: CourseDetail;
  active: ActiveItem;
  onSelect: (item: ActiveItem) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const courseId = course.id;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['course', courseId] });

  const [editing, setEditing] = useState<EditTarget>(null);
  const [value, setValue] = useState('');

  const addSection = useMutation({
    mutationFn: () =>
      clientApi(`/sections/${courseId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New section' }),
      }),
    onSuccess: invalidate,
  });
  const addLesson = useMutation({
    mutationFn: (sectionId: number) =>
      clientApi(`/lessons/${sectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New lesson' }),
      }),
    onSuccess: invalidate,
  });
  const addTest = useMutation({
    mutationFn: (lessonId: number) =>
      clientApi(`/tests/${lessonId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      }),
    onSuccess: invalidate,
  });
  const delSection = useMutation({
    mutationFn: (id: number) =>
      clientApi(`/sections/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const delLesson = useMutation({
    mutationFn: (id: number) =>
      clientApi(`/lessons/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: ({
      type,
      id,
      title,
    }: {
      type: 'SECTION' | 'LESSON' | 'TEST';
      id: number;
      title: string;
    }) => {
      const path =
        type === 'SECTION'
          ? `/sections/${id}`
          : type === 'LESSON'
            ? `/lessons/${id}`
            : `/tests/${id}`;
      return clientApi(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    },
    onSuccess: invalidate,
  });
  const delCourse = useMutation({
    mutationFn: () => clientApi(`/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess: () => router.push('/'),
  });

  function startEdit(type: 'SECTION' | 'LESSON' | 'TEST', id: number, title: string) {
    setEditing({ type, id });
    setValue(title);
  }
  function commitEdit() {
    if (editing && value.trim()) {
      rename.mutate({ type: editing.type, id: editing.id, title: value.trim() });
    }
    setEditing(null);
  }

  const isActive = (type: string, id: number) =>
    active?.type === type && active.id === id;

  function renameInput() {
    return (
      <input
        className={styles.inlineInput}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitEdit();
          if (e.key === 'Escape') setEditing(null);
        }}
      />
    );
  }

  return (
    <aside className={styles.left}>
      <div className={styles.header}>
        <h3>{course.title}</h3>
        <button
          className={styles.manageBtn}
          onClick={() => router.push(`/courses/${courseId}/manage`)}
        >
          ⚙ Manage
        </button>
      </div>
      <button className={styles.addBtn} onClick={() => addSection.mutate()}>
        + Add section
      </button>

      <ul className={styles.tree}>
        {course.sections.map((section) => (
          <li key={section.id} className={styles.section}>
            <div className={styles.row}>
              {editing?.type === 'SECTION' && editing.id === section.id ? (
                renameInput()
              ) : (
                <span
                  className={`${styles.item} ${isActive('SECTION', section.id) ? styles.active : ''}`}
                  onClick={() => onSelect({ type: 'SECTION', id: section.id })}
                  onDoubleClick={() =>
                    startEdit('SECTION', section.id, section.title)
                  }
                >
                  {section.title}
                </span>
              )}
              <div className={styles.actions}>
                <button onClick={() => addLesson.mutate(section.id)}>＋L</button>
                <button onClick={() => delSection.mutate(section.id)}>🗑</button>
              </div>
            </div>
            <ul className={styles.sublist}>
              {section.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <div className={styles.row}>
                    {editing?.type === 'LESSON' && editing.id === lesson.id ? (
                      renameInput()
                    ) : (
                      <span
                        className={`${styles.item} ${isActive('LESSON', lesson.id) ? styles.active : ''}`}
                        onClick={() => onSelect({ type: 'LESSON', id: lesson.id })}
                        onDoubleClick={() =>
                          startEdit('LESSON', lesson.id, lesson.title)
                        }
                      >
                        {lesson.title}
                      </span>
                    )}
                    <div className={styles.actions}>
                      {!lesson.test && (
                        <button onClick={() => addTest.mutate(lesson.id)}>
                          ＋T
                        </button>
                      )}
                      <button onClick={() => delLesson.mutate(lesson.id)}>
                        🗑
                      </button>
                    </div>
                  </div>
                  {lesson.test && (
                    <div className={`${styles.row} ${styles.sublist}`}>
                      <span
                        className={`${styles.item} ${styles.test} ${isActive('TEST', lesson.test.id) ? styles.active : ''}`}
                        onClick={() => onSelect({ type: 'TEST', id: lesson.test!.id })}
                      >
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

      <button className={styles.deleteCourse} onClick={() => delCourse.mutate()}>
        Delete course
      </button>
    </aside>
  );
}
```

- [ ] **Step 2: `BuilderStructurePanel.module.scss`**

```scss
.left {
  background: #f6f7fb;
  padding: 16px;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;

  h3 {
    font-size: 16px;
  }
}

.manageBtn,
.addBtn,
.deleteCourse {
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.manageBtn {
  background: #e2e8f0;
  padding: 4px 8px;
}

.addBtn {
  background: #3b82f6;
  color: #fff;
  padding: 8px;
  width: 100%;
  margin-bottom: 12px;
}

.deleteCourse {
  background: #fee2e2;
  color: #991b1b;
  padding: 8px;
  margin-top: 16px;
}

.tree {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
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

  &:hover {
    background: rgba(37, 99, 235, 0.08);
  }
}

.active {
  background: #2563eb;
  color: #fff;
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

.actions {
  display: flex;
  gap: 4px;

  button {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.7;

    &:hover {
      opacity: 1;
    }
  }
}

.inlineInput {
  flex: 1;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 14px;
}
```

- [ ] **Step 3: `BuilderEditorPanel.tsx`**

```typescript
'use client';

import type { ActiveItem, CourseDetail } from '../../lib/types';
import { LessonEditor } from './LessonEditor';
import { TestEditor } from './TestEditor';

export function BuilderEditorPanel({
  active,
  course,
  onTestDeleted,
}: {
  active: ActiveItem;
  course: CourseDetail;
  onTestDeleted: () => void;
}) {
  if (!active) {
    return <p style={{ color: '#6b7280' }}>Select an item on the left 👈</p>;
  }
  if (active.type === 'SECTION') {
    return <p style={{ color: '#6b7280' }}>📚 A section groups lessons.</p>;
  }
  if (active.type === 'LESSON') {
    const lesson = course.sections
      .flatMap((s) => s.lessons)
      .find((l) => l.id === active.id);
    if (!lesson) return <p>Lesson not found.</p>;
    return <LessonEditor lesson={lesson} courseId={course.id} />;
  }
  return (
    <TestEditor
      testId={active.id}
      courseId={course.id}
      onDeleted={onTestDeleted}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/teacher/BuilderStructurePanel.tsx frontend/src/components/teacher/BuilderStructurePanel.module.scss frontend/src/components/teacher/BuilderEditorPanel.tsx
git commit -m "feat(frontend): add builder structure panel (CRUD) + editor panel"
```

---

## Task 4: LessonEditor

**Files:** Create `frontend/src/components/teacher/LessonEditor.tsx` + `.module.scss`

Fixes the `youtu.be` query-param bug; memoizes the embed URL.

- [ ] **Step 1: `LessonEditor.tsx`**

```typescript
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { Lesson } from '../../lib/types';
import styles from './LessonEditor.module.scss';

function toEmbedUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (url.includes('youtube.com/watch')) {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.includes('youtu.be/')) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : '';
    }
  } catch {
    return '';
  }
  return '';
}

export function LessonEditor({
  lesson,
  courseId,
}: {
  lesson: Lesson;
  courseId: number;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content ?? '');
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? '');

  useEffect(() => {
    setTitle(lesson.title);
    setContent(lesson.content ?? '');
    setVideoUrl(lesson.videoUrl ?? '');
  }, [lesson.id, lesson.title, lesson.content, lesson.videoUrl]);

  const embed = useMemo(() => toEmbedUrl(videoUrl), [videoUrl]);

  const save = useMutation({
    mutationFn: () =>
      clientApi(`/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, videoUrl }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
  });

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <input
          className={styles.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          className={styles.saveBtn}
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving…' : '💾 Save'}
        </button>
      </div>

      <div className={styles.videoBlock}>
        <label>Video URL (YouTube / Vimeo)</label>
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
        />
        {embed && (
          <div className={styles.video}>
            <iframe src={embed} title="preview" allowFullScreen />
          </div>
        )}
      </div>

      <div className={styles.content}>
        <label>Content (HTML)</label>
        <textarea
          rows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `LessonEditor.module.scss`**

```scss
.editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 900px;
}

.header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.title {
  flex: 1;
  font-size: 20px;
  padding: 8px 12px;
  border: 1px solid #dcdde1;
  border-radius: 8px;
}

.saveBtn {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  cursor: pointer;

  &:disabled {
    background: #93c5fd;
  }
}

.videoBlock {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 13px;
    color: #475569;
  }

  input {
    padding: 8px 12px;
    border: 1px solid #dcdde1;
    border-radius: 8px;
  }
}

.video {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 8px;
  overflow: hidden;

  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
}

.content {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 13px;
    color: #475569;
  }

  textarea {
    padding: 12px;
    border: 1px solid #dcdde1;
    border-radius: 8px;
    font-family: inherit;
    font-size: 14px;
    min-height: 220px;
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/teacher/LessonEditor.tsx frontend/src/components/teacher/LessonEditor.module.scss
git commit -m "feat(frontend): add LessonEditor (manual save, fixed embed helper)"
```

---

## Task 5: TestEditor

**Files:** Create `frontend/src/components/teacher/TestEditor.tsx` + `.module.scss`

Each mutation invalidates `['test', testId]` (and `['course', courseId]` for title/structure changes). Question/answer edits save on blur or toggle.

- [ ] **Step 1: `TestEditor.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { Answer, Question, QuestionType, TestFull } from '../../lib/types';
import styles from './TestEditor.module.scss';

export function TestEditor({
  testId,
  courseId,
  onDeleted,
}: {
  testId: number;
  courseId: number;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidateTest = () =>
    queryClient.invalidateQueries({ queryKey: ['test', testId] });
  const invalidateCourse = () =>
    queryClient.invalidateQueries({ queryKey: ['course', courseId] });

  const { data: test } = useQuery<TestFull>({
    queryKey: ['test', testId],
    queryFn: () => clientApi<TestFull>(`/tests/${testId}`),
  });

  const [title, setTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState(10);
  const [passingScore, setPassingScore] = useState(60);

  useEffect(() => {
    if (test) {
      setTitle(test.title);
      setTimeLimit(test.timeLimit);
      setPassingScore(test.passingScore);
    }
  }, [test]);

  const saveMeta = useMutation({
    mutationFn: () =>
      clientApi(`/tests/${testId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, timeLimit, passingScore }),
      }),
    onSuccess: () => {
      invalidateTest();
      invalidateCourse();
    },
  });

  const addQuestion = useMutation({
    mutationFn: () =>
      clientApi(`/tests/${testId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'New question', type: 'SINGLE' }),
      }),
    onSuccess: invalidateTest,
  });

  const delTest = useMutation({
    mutationFn: () => clientApi(`/tests/${testId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateCourse();
      onDeleted();
    },
  });

  if (!test) return <p className={styles.loading}>Loading…</p>;

  return (
    <div className={styles.editor}>
      <div className={styles.meta}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveMeta.mutate()}
        />
        <div className={styles.row}>
          <label>
            Time limit (min)
            <input
              type="number"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              onBlur={() => saveMeta.mutate()}
            />
          </label>
          <label>
            Passing score (%)
            <input
              type="number"
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              onBlur={() => saveMeta.mutate()}
            />
          </label>
        </div>
        <button className={styles.deleteBtn} onClick={() => delTest.mutate()}>
          Delete test
        </button>
      </div>

      <div className={styles.questions}>
        <div className={styles.questionsHeader}>
          <h3>Questions</h3>
          <button onClick={() => addQuestion.mutate()}>+ Add question</button>
        </div>
        {test.questions.map((q) => (
          <QuestionItem key={q.id} question={q} onChanged={invalidateTest} />
        ))}
      </div>
    </div>
  );
}

function QuestionItem({
  question,
  onChanged,
}: {
  question: Question;
  onChanged: () => void;
}) {
  const [text, setText] = useState(question.text);
  const [type, setType] = useState<QuestionType>(question.type);

  useEffect(() => {
    setText(question.text);
    setType(question.type);
  }, [question.id, question.text, question.type]);

  const patchQuestion = useMutation({
    mutationFn: (data: Partial<{ text: string; type: QuestionType }>) =>
      clientApi(`/tests/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: onChanged,
  });
  const delQuestion = useMutation({
    mutationFn: () =>
      clientApi(`/tests/questions/${question.id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });
  const addAnswer = useMutation({
    mutationFn: () =>
      clientApi(`/tests/questions/${question.id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'New answer' }),
      }),
    onSuccess: onChanged,
  });
  const patchAnswer = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<{ text: string; isCorrect: boolean }>;
    }) =>
      clientApi(`/tests/answers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: onChanged,
  });
  const delAnswer = useMutation({
    mutationFn: (id: number) =>
      clientApi(`/tests/answers/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });

  function changeType(newType: QuestionType) {
    if (newType === type) return;
    setType(newType);
    patchQuestion.mutate({ type: newType });
    // Normalize to a single correct answer when switching to SINGLE.
    if (newType === 'SINGLE') {
      const firstCorrect =
        question.answers.find((a) => a.isCorrect) ?? question.answers[0];
      question.answers.forEach((a) => {
        const shouldBe = a.id === firstCorrect?.id;
        if (a.isCorrect !== shouldBe) {
          patchAnswer.mutate({ id: a.id, data: { isCorrect: shouldBe } });
        }
      });
    }
  }

  function toggleCorrect(answer: Answer) {
    if (type === 'SINGLE') {
      question.answers.forEach((a) => {
        const shouldBe = a.id === answer.id;
        if (a.isCorrect !== shouldBe) {
          patchAnswer.mutate({ id: a.id, data: { isCorrect: shouldBe } });
        }
      });
    } else {
      patchAnswer.mutate({
        id: answer.id,
        data: { isCorrect: !answer.isCorrect },
      });
    }
  }

  return (
    <div className={styles.questionCard}>
      <div className={styles.questionTop}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== question.text) patchQuestion.mutate({ text });
          }}
        />
        <select
          value={type}
          onChange={(e) => changeType(e.target.value as QuestionType)}
        >
          <option value="SINGLE">Single</option>
          <option value="MULTIPLE">Multiple</option>
        </select>
        <button onClick={() => delQuestion.mutate()}>🗑</button>
      </div>

      <div className={styles.answers}>
        {question.answers.map((a) => (
          <AnswerRow
            key={a.id}
            answer={a}
            type={type}
            onToggle={() => toggleCorrect(a)}
            onText={(newText) => {
              if (newText !== a.text)
                patchAnswer.mutate({ id: a.id, data: { text: newText } });
            }}
            onDelete={() => delAnswer.mutate(a.id)}
          />
        ))}
        <button className={styles.addAnswer} onClick={() => addAnswer.mutate()}>
          + Add answer
        </button>
      </div>
    </div>
  );
}

function AnswerRow({
  answer,
  type,
  onToggle,
  onText,
  onDelete,
}: {
  answer: Answer;
  type: QuestionType;
  onToggle: () => void;
  onText: (text: string) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(answer.text);
  useEffect(() => {
    setText(answer.text);
  }, [answer.id, answer.text]);

  return (
    <div className={styles.answer}>
      <input
        type={type === 'SINGLE' ? 'radio' : 'checkbox'}
        checked={answer.isCorrect}
        onChange={onToggle}
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onText(text)}
      />
      <button onClick={onDelete}>🗑</button>
    </div>
  );
}
```

- [ ] **Step 2: `TestEditor.module.scss`**

```scss
.editor {
  padding: 8px;
  max-width: 900px;
}

.loading {
  color: #6b7280;
}

.meta {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  input {
    padding: 8px 10px;
    border: 1px solid #dcdde1;
    border-radius: 6px;
  }
}

.row {
  display: flex;
  gap: 16px;

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    color: #475569;
  }

  input {
    width: 120px;
  }
}

.deleteBtn {
  align-self: flex-start;
  background: #fee2e2;
  color: #991b1b;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}

.questionsHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  button {
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
  }
}

.questionCard {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 14px;
  background: #fff;
}

.questionTop {
  display: flex;
  gap: 8px;
  align-items: center;

  input {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid #dcdde1;
    border-radius: 6px;
  }

  select {
    padding: 8px;
    border: 1px solid #dcdde1;
    border-radius: 6px;
  }

  button {
    background: transparent;
    border: none;
    cursor: pointer;
  }
}

.answers {
  padding-left: 12px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.answer {
  display: flex;
  gap: 8px;
  align-items: center;

  input[type='text'],
  input:not([type]) {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #dcdde1;
    border-radius: 6px;
  }

  button {
    background: transparent;
    border: none;
    cursor: pointer;
  }
}

.addAnswer {
  align-self: flex-start;
  background: transparent;
  border: 1px dashed #3b82f6;
  color: #3b82f6;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/teacher/TestEditor.tsx frontend/src/components/teacher/TestEditor.module.scss
git commit -m "feat(frontend): add TestEditor (meta autosave, question/answer CRUD)"
```

---

## Task 6: CourseBuilder page

**Files:** Create `frontend/src/app/(app)/teacher/courses/[id]/builder/builder.module.scss`, `page.tsx`

- [ ] **Step 1: `builder.module.scss`**

```scss
.builder {
  display: grid;
  grid-template-columns: 320px 1fr;
  min-height: calc(100vh - 64px - 48px - 48px);
}

.right {
  padding: 24px;
  overflow-y: auto;
}

.state {
  padding: 24px;
}
```

- [ ] **Step 2: `page.tsx`** (client; one course query; activeItem local state)

```typescript
'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../../../../../lib/api/client';
import type { ActiveItem, CourseDetail } from '../../../../../../lib/types';
import { TeacherGuard } from '../../../../../../components/teacher/TeacherGuard';
import { BuilderStructurePanel } from '../../../../../../components/teacher/BuilderStructurePanel';
import { BuilderEditorPanel } from '../../../../../../components/teacher/BuilderEditorPanel';
import styles from './builder.module.scss';

function Builder() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [active, setActive] = useState<ActiveItem>(null);

  const { data: course, isLoading } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });

  if (isLoading) return <p className={styles.state}>Loading…</p>;
  if (!course) return <p className={styles.state}>Course not found.</p>;

  return (
    <div className={styles.builder}>
      <BuilderStructurePanel
        course={course}
        active={active}
        onSelect={setActive}
      />
      <div className={styles.right}>
        <BuilderEditorPanel
          active={active}
          course={course}
          onTestDeleted={() => setActive(null)}
        />
      </div>
    </div>
  );
}

export default function CourseBuilderPage() {
  return (
    <TeacherGuard>
      <Builder />
    </TeacherGuard>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add "frontend/src/app/(app)/teacher/courses/[id]/builder"
git commit -m "feat(frontend): add CourseBuilder page"
```

---

## Task 7: CourseManagementPage + EnrollRequests

**Files:** Create `frontend/src/components/teacher/EnrollRequests.tsx` + `.module.scss`; `frontend/src/app/(app)/courses/[id]/manage/management.module.scss`, `ManagementView.tsx`, `page.tsx`

- [ ] **Step 1: `EnrollRequests.tsx`** (approve/reject invalidate the pending list + students progress; fixes the reject key bug by re-fetching)

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { EnrollRequest } from '../../lib/types';
import styles from './EnrollRequests.module.scss';

export function EnrollRequests({ courseId }: { courseId: number }) {
  const queryClient = useQueryClient();
  const { data: requests } = useQuery<EnrollRequest[]>({
    queryKey: ['enrollRequests', courseId],
    queryFn: () =>
      clientApi<EnrollRequest[]>(
        `/courses/${courseId}/enrollments?status=PENDING`,
      ),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['enrollRequests', courseId] });
    queryClient.invalidateQueries({ queryKey: ['studentsProgress', courseId] });
  };

  const approve = useMutation({
    mutationFn: (userId: number) =>
      clientApi(`/courses/${courseId}/enroll/${userId}/approve`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (userId: number) =>
      clientApi(`/courses/${courseId}/enroll/${userId}/reject`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  if (!requests) return <p className={styles.muted}>Loading…</p>;
  if (requests.length === 0)
    return <p className={styles.muted}>No pending requests.</p>;

  return (
    <div className={styles.list}>
      {requests.map((r) => {
        const p = r.student.profile;
        const name =
          p && (p.firstName || p.lastName)
            ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
            : r.student.email;
        return (
          <div key={r.id} className={styles.card}>
            <div>
              <div className={styles.name}>{name}</div>
              <div className={styles.email}>{r.student.email}</div>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.approve}
                onClick={() => approve.mutate(r.userId)}
              >
                Approve
              </button>
              <button
                className={styles.reject}
                onClick={() => reject.mutate(r.userId)}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: `EnrollRequests.module.scss`**

```scss
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 16px;
  background: #fff;
}

.name {
  font-weight: 600;
}

.email {
  font-size: 13px;
  color: #6b7280;
}

.actions {
  display: flex;
  gap: 8px;
}

.approve,
.reject {
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
}

.approve {
  background: #dcfce7;
  color: #166534;
}

.reject {
  background: #fee2e2;
  color: #991b1b;
}

.muted {
  color: #6b7280;
  font-size: 14px;
}
```

- [ ] **Step 3: `app/(app)/courses/[id]/manage/management.module.scss`**

```scss
.page {
  max-width: 1000px;
  margin: 0 auto;
}

.title {
  font-size: 26px;
  font-weight: 800;
}

.subtitle {
  color: #4b5563;
  margin-bottom: 8px;
}

.block {
  margin-top: 36px;
}

.blockTitle {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 14px;
}

.noAccess {
  color: #dc2626;
}

.studentsList {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.studentCard {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px;
  background: #fff;
}

.studentHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.studentName {
  font-weight: 600;
  font-size: 16px;
}

.studentEmail {
  font-size: 13px;
  color: #6b7280;
}

.status {
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
}

.completed {
  background: #ecfdf5;
  color: #166534;
}

.inProgress {
  background: #eff6ff;
  color: #1d4ed8;
}

.progress {
  margin-top: 14px;
}

.progressRow {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  margin-bottom: 4px;
}

.progressBar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
  margin-top: 6px;
}

.progressFill {
  height: 100%;
  background: #3b82f6;
}

.progressPercent {
  text-align: right;
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}
```

- [ ] **Step 4: `app/(app)/courses/[id]/manage/ManagementView.tsx`**

```typescript
'use client';

import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../../../../../lib/api/client';
import type {
  CourseDetail,
  SessionUser,
  StudentProgress,
} from '../../../../../lib/types';
import { EnrollRequests } from '../../../../../components/teacher/EnrollRequests';
import styles from './management.module.scss';

export function ManagementView() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: session } = useSession();

  const { data: course } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });
  const { data: students } = useQuery<StudentProgress[]>({
    queryKey: ['studentsProgress', id],
    queryFn: () =>
      clientApi<StudentProgress[]>(`/courses/${id}/students/progress`),
    enabled: !!course,
  });

  if (!session || !course) return <p className={styles.page}>Loading…</p>;
  const user = session.user as SessionUser;
  if (user.id !== course.teacherId && user.role !== 'ADMIN') {
    return <p className={styles.noAccess}>No access</p>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Course management</h1>
      <p className={styles.subtitle}>{course.title}</p>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Enrollment requests</h2>
        <EnrollRequests courseId={id} />
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Students</h2>
        <div className={styles.studentsList}>
          {(students ?? []).map((s) => {
            const total = s.lessons.total + s.tests.total;
            const done = s.lessons.completed + s.tests.completed;
            const percent = total ? Math.round((done / total) * 100) : 0;
            const completed = total > 0 && done === total;
            return (
              <div key={s.userId} className={styles.studentCard}>
                <div className={styles.studentHeader}>
                  <div>
                    <div className={styles.studentName}>{s.name}</div>
                    <div className={styles.studentEmail}>{s.email}</div>
                  </div>
                  <div
                    className={`${styles.status} ${
                      completed ? styles.completed : styles.inProgress
                    }`}
                  >
                    {completed ? 'Completed' : 'In progress'}
                  </div>
                </div>
                <div className={styles.progress}>
                  <div className={styles.progressRow}>
                    <span>Lessons</span>
                    <span>
                      {s.lessons.completed} / {s.lessons.total}
                    </span>
                  </div>
                  <div className={styles.progressRow}>
                    <span>Tests</span>
                    <span>
                      {s.tests.completed} / {s.tests.total}
                    </span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className={styles.progressPercent}>{percent}%</div>
                </div>
              </div>
            );
          })}
          {(students ?? []).length === 0 && (
            <p style={{ color: '#6b7280' }}>No active students yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: `app/(app)/courses/[id]/manage/page.tsx`**

```typescript
import { ManagementView } from './ManagementView';

export default function ManagePage() {
  return <ManagementView />;
}
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
rm -rf .next
npm run build
```
Expected: `✓ Compiled successfully` with routes including `/teacher/courses/new`, `/teacher/courses/[id]/builder`, `/courses/[id]/manage`. If a type/lint error, STOP and report exact error.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/teacher/EnrollRequests.tsx frontend/src/components/teacher/EnrollRequests.module.scss "frontend/src/app/(app)/courses/[id]/manage"
git commit -m "feat(frontend): add CourseManagementPage + EnrollRequests"
```

---

## Task 8: Verification

**Files:** none (runtime).

- [ ] **Step 1: Start backend + frontend**

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

- [ ] **Step 2: Teacher login + teacher pages return 200; student is redirected off teacher pages**

```bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
JAR=/tmp/tjar.txt; rm -f $JAR
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).csrfToken')
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials \
  -H 'Content-Type: application/x-www-form-urlencoded' -H 'X-Auth-Return-Redirect: 1' \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=teacher@example.com" --data-urlencode "password=password123" >/dev/null
echo -n "session role: "; curl -s -b $JAR http://localhost:3000/api/auth/session | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).user.role'
for p in "/teacher/courses/new" "/teacher/courses/1/builder" "/courses/1/manage"; do
  echo -n "$p => "; curl -s -b $JAR -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"
done
```
Expected: `session role: TEACHER`; all three pages `200`. (The TeacherGuard redirect for students happens client-side, so verify that in the browser.)

- [ ] **Step 3: MANUAL browser walkthrough** (teacher@example.com / password123)

1. Header → "Create course" → fill title/description, pick image (preview updates) → Create → lands in the builder.
2. In the builder: "+ Add section", "+L" to add a lesson, open the lesson, set a title + a YouTube URL (preview iframe) + content, Save.
3. "+T" to add a test, open it, set time limit/passing score (blur saves), "+ Add question", set text, add answers, mark a correct one, switch SINGLE/MULTIPLE.
4. Open `/courses/1/manage` (or via the ⚙ button): see the student progress cards; if there is a pending enroll request, Approve it and confirm it disappears.
5. As `student2@example.com` (PENDING on course 1): confirm visiting `/teacher/courses/new` redirects to `/`.

- [ ] **Step 4: Stop servers**

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null
true
```

No commit (verification only).

---

## Self-Review (author checklist — completed)

- **Coverage:** CreateCoursePage (form + preview + FormData, Task 2); CourseBuilder page (Task 6) with BuilderStructurePanel (section/lesson/test add-delete-rename, Task 3) + BuilderEditorPanel; LessonEditor (manual save + embed preview, Task 4); TestEditor (meta autosave + question/answer CRUD with SINGLE/MULTIPLE normalization, Task 5); CourseManagementPage + EnrollRequests (Task 7). All teacher routes referenced by the Header/CourseCard now exist. ✓
- **Bugs fixed (documented):** `youtu.be` embed now strips query params via `URL.pathname`; embed memoized; CreateCourse revokes object URL + disables button while pending; reject/approve invalidate (re-fetch) the pending list instead of relying on the buggy client-side filter; management access guard checks owner/ADMIN; `BuilderStructurePanel` ⚙ button is styled. ✓
- **Mutations → invalidation:** structure edits invalidate `['course', id]`; test edits invalidate `['test', testId]` (+ `['course']` for title/structure); enroll actions invalidate `['enrollRequests', id]` + `['studentsProgress', id]`. ✓
- **Turbopack purity:** all element selectors nested under classes (`.field input`, `.actions button`, `.answer input`). ✓
- **Type consistency:** `EnrollRequest`, `StudentProgress`, `CourseDetail`, `Answer`, `Question`, `QuestionType` reused from `lib/types.ts`. ✓
- **This completes the frontend.** Remaining: Plan 4 — chat (Socket.io gateway on the backend + `/chat` UI). Then the migration is feature-complete vs the legacy app (plus chat as a new feature).
