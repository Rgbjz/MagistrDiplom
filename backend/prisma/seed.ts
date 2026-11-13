/**
 * Demo data seed.
 *
 * Idempotency: the seed owns a fixed set of demo accounts (DEMO_USERS plus a
 * few legacy addresses from older seeds). On every run it first removes those
 * accounts, every course they teach and the direct chats between them — all
 * dependent rows (sections, lessons, tests, enrollments, progress, results,
 * payments, certificates, notifications, messages) go with them through the
 * schema's ON DELETE CASCADE rules — and then recreates everything from
 * scratch. Accounts and courses created by real users are never touched.
 *
 * Run: npm run db:seed
 */
import { Prisma, PrismaClient } from '@prisma/client';
import type { NotificationType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { COURSES, type CourseDef } from './seed-data/courses';
import { HTML_LABS, HTML_TESTS } from './seed-data/html-course-extras';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo1234';
const ADMIN_PASSWORD = 'admin123';

type DemoUser = {
  key: string;
  email: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
  firstName: string;
  lastName: string;
  bio?: string;
};

const DEMO_USERS: DemoUser[] = [
  {
    key: 'admin',
    email: 'admin@lms.local',
    role: 'ADMIN',
    firstName: 'Адмін',
    lastName: 'Системи',
  },
  {
    key: 'teacher1',
    email: 'teacher1@lms.local',
    role: 'TEACHER',
    firstName: 'Ірина',
    lastName: 'Мельник',
    bio: 'Фронтенд-розробниця з 9 роками досвіду, викладаю веб-розробку, бази даних і UX. Люблю, коли складне пояснюється простими прикладами.',
  },
  {
    key: 'teacher2',
    email: 'teacher2@lms.local',
    role: 'TEACHER',
    firstName: 'Андрій',
    lastName: 'Бойко',
    bio: 'Бекенд-інженер і ментор. Веду курси з TypeScript, Git та англійської для розробників.',
  },
  {
    key: 'olena',
    email: 'student@lms.local',
    role: 'STUDENT',
    firstName: 'Олена',
    lastName: 'Коваль',
  },
  {
    key: 's2',
    email: 'student2@lms.local',
    role: 'STUDENT',
    firstName: 'Максим',
    lastName: 'Петренко',
  },
  {
    key: 's3',
    email: 'student3@lms.local',
    role: 'STUDENT',
    firstName: 'Софія',
    lastName: 'Ткаченко',
  },
  {
    key: 's4',
    email: 'student4@lms.local',
    role: 'STUDENT',
    firstName: 'Дмитро',
    lastName: 'Шевченко',
  },
  {
    key: 's5',
    email: 'student5@lms.local',
    role: 'STUDENT',
    firstName: 'Анна',
    lastName: 'Бондаренко',
  },
  {
    key: 's6',
    email: 'student6@lms.local',
    role: 'STUDENT',
    firstName: 'Олег',
    lastName: 'Кравченко',
  },
  {
    key: 's7',
    email: 'student7@lms.local',
    role: 'STUDENT',
    firstName: 'Марія',
    lastName: 'Олійник',
  },
  {
    key: 's8',
    email: 'student8@lms.local',
    role: 'STUDENT',
    firstName: 'Владислав',
    lastName: 'Лисенко',
  },
  {
    key: 's9',
    email: 'student9@lms.local',
    role: 'STUDENT',
    firstName: 'Катерина',
    lastName: 'Мороз',
  },
  {
    key: 's10',
    email: 'student10@lms.local',
    role: 'STUDENT',
    firstName: 'Ігор',
    lastName: 'Савченко',
  },
  {
    key: 's11',
    email: 'student11@lms.local',
    role: 'STUDENT',
    firstName: 'Юлія',
    lastName: 'Руденко',
  },
];

// Accounts created by earlier versions of this seed — cleaned up too.
const LEGACY_EMAILS = [
  'teacher@example.com',
  'student1@example.com',
  'student2@example.com',
];
const LEGACY_COURSE_TITLES = ['Intro to TypeScript'];

// ───────────────────────────── helpers ─────────────────────────────

const NOW = new Date();

/** A moment `days` ago at the given hour (local time). */
function daysAgo(days: number, hour = 12, minute = 0): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d > NOW ? new Date(NOW.getTime() - 60_000) : d;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

type SeededCourse = Awaited<ReturnType<typeof createCourse>>;
type SeededLesson = SeededCourse['sections'][number]['lessons'][number];
type SeededTest = NonNullable<SeededLesson['test']>;

function lessonsOf(course: SeededCourse): SeededLesson[] {
  return course.sections.flatMap((s) => s.lessons);
}

function testsOf(course: SeededCourse): SeededTest[] {
  return lessonsOf(course)
    .map((l) => l.test)
    .filter((t): t is SeededTest => t !== null);
}

// ───────────────────────────── cleanup ─────────────────────────────

async function cleanup() {
  const emails = [...DEMO_USERS.map((u) => u.email), ...LEGACY_EMAILS];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  // Courses have no cascade from their teacher, so they go first.
  await prisma.course.deleteMany({
    where: {
      OR: [{ teacherId: { in: ids } }, { title: { in: LEGACY_COURSE_TITLES } }],
    },
  });
  // Direct chats between demo users (course chats left with the courses).
  await prisma.conversation.deleteMany({
    where: { type: 'DIRECT', participants: { some: { userId: { in: ids } } } },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

// ───────────────────────────── builders ─────────────────────────────

async function createUsers() {
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const byKey: Record<string, { id: number; email: string; name: string }> = {};
  for (const [i, u] of DEMO_USERS.entries()) {
    const created = await prisma.user.create({
      data: {
        email: u.email,
        password: u.role === 'ADMIN' ? adminHash : demoHash,
        role: u.role,
        emailVerified: true,
        // Spread sign-up dates so admin lists look natural.
        createdAt: daysAgo(60 - i * 3, 10),
        profile: {
          create: {
            firstName: u.firstName,
            lastName: u.lastName,
            bio: u.bio ?? null,
            avatarUrl: seedImage('avatars', `${u.key}.png`),
          },
        },
      },
    });
    byKey[u.key] = {
      id: created.id,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`,
    };
  }
  return byKey;
}

async function createCourse(
  def: CourseDef,
  teacherId: number,
  createdAt: Date,
) {
  return prisma.course.create({
    data: {
      title: def.title,
      description: def.description,
      category: def.category,
      level: def.level,
      price: def.price,
      autoApprove: def.autoApprove,
      published: def.published,
      imageUrl: seedImage('courses', `${def.key}.jpg`),
      teacherId,
      createdAt,
      sections: {
        create: def.sections.map((s, si) => ({
          title: s.title,
          order: si + 1,
          lessons: {
            create: s.lessons.map((l, li) => ({
              title: l.title,
              content: l.content,
              videoUrl: l.videoUrl ?? null,
              order: li + 1,
              test: l.test
                ? {
                    create: {
                      title: l.test.title,
                      timeLimit: l.test.timeLimit,
                      passingScore: 60,
                      questions: {
                        create: l.test.questions.map((q, qi) => ({
                          text: q.text,
                          type: q.type,
                          difficulty: qi < 2 ? 1 : 2,
                          answers: {
                            create: q.answers.map(([text, isCorrect]) => ({
                              text,
                              isCorrect,
                            })),
                          },
                        })),
                      },
                    },
                  }
                : undefined,
            })),
          },
        })),
      },
    },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: {
          lessons: {
            orderBy: { order: 'asc' },
            include: {
              test: {
                include: {
                  questions: {
                    orderBy: { id: 'asc' },
                    include: { answers: { orderBy: { id: 'asc' } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

async function enroll(
  userId: number,
  courseId: number,
  status: 'ACTIVE' | 'PENDING' | 'REJECTED',
  at: Date,
) {
  return prisma.enrollment.create({
    data: { userId, courseId, status, enrolledAt: at, createdAt: at },
  });
}

/** Mark lessons COMPLETED (and optionally the next one IN_PROGRESS) at the given times. */
async function completeLessons(
  userId: number,
  lessons: SeededLesson[],
  times: Date[],
  inProgress?: SeededLesson,
) {
  for (const [i, lesson] of lessons.entries()) {
    const completedAt = times[i] ?? times[times.length - 1];
    await prisma.lessonProgress.create({
      data: {
        userId,
        lessonId: lesson.id,
        status: 'COMPLETED',
        startedAt: addMinutes(completedAt, -25),
        completedAt,
      },
    });
  }
  if (inProgress) {
    const startedAt = addMinutes(times[times.length - 1] ?? NOW, 40);
    await prisma.lessonProgress.create({
      data: {
        userId,
        lessonId: inProgress.id,
        status: 'IN_PROGRESS',
        startedAt: startedAt > NOW ? addMinutes(NOW, -30) : startedAt,
      },
    });
  }
}

/**
 * Record a finished attempt: the first `correct` questions are answered right,
 * the rest wrong. Score and pass flag follow the backend's scoring rules.
 */
async function takeTest(
  userId: number,
  test: SeededTest,
  correct: number,
  attempt: number,
  finishedAt: Date,
) {
  const total = test.questions.length;
  const right = Math.min(correct, total);
  const score = Math.round((right / total) * 100);
  const result = await prisma.testResult.create({
    data: {
      userId,
      testId: test.id,
      attempt,
      startedAt: addMinutes(finishedAt, -Math.min(test.timeLimit, 8)),
      finishedAt,
      score,
      passed: score >= test.passingScore,
    },
  });
  const answers = test.questions.flatMap((q, i) => {
    const chosen =
      i < right
        ? q.answers.filter((a) => a.isCorrect)
        : [q.answers.find((a) => !a.isCorrect) ?? q.answers[0]];
    return chosen.map((a) => ({
      userId,
      questionId: q.id,
      answerId: a.id,
      testResultId: result.id,
    }));
  });
  await prisma.userAnswer.createMany({ data: answers });
  return result;
}

async function notify(
  userId: number,
  type: NotificationType,
  title: string,
  body: string | null,
  link: string | null,
  createdAt: Date,
  read: boolean,
) {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      link,
      createdAt,
      readAt: read ? addMinutes(createdAt, 30) : null,
    },
  });
}

async function courseChat(
  courseId: number,
  participantIds: number[],
  messages: { from: number; text: string; at: Date }[],
) {
  const conversation = await prisma.conversation.create({
    data: {
      type: 'COURSE',
      courseId,
      participants: {
        create: [...new Set(participantIds)].map((userId) => ({ userId })),
      },
    },
  });
  for (const m of messages) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: m.from,
        content: m.text,
        createdAt: m.at,
      },
    });
  }
  return conversation;
}

async function issueCertificate(
  userId: number,
  courseId: number,
  issuedAt: Date,
) {
  const agg = await prisma.testResult.aggregate({
    where: {
      userId,
      finishedAt: { not: null },
      test: { lesson: { section: { courseId } } },
    },
    _avg: { score: true },
  });
  const created = await prisma.certificate.create({
    data: {
      userId,
      courseId,
      code: `TMP-${userId}-${courseId}`,
      issuedAt,
      avgScore: agg._avg.score === null ? null : Math.round(agg._avg.score),
    },
  });
  // Same format as CertificatesService: LMS-<year>-<6-digit id>.
  const code = `LMS-${issuedAt.getFullYear()}-${String(created.id).padStart(6, '0')}`;
  await prisma.certificate.update({
    where: { id: created.id },
    data: { code },
  });
  await prisma.enrollment.update({
    where: { userId_courseId: { userId, courseId } },
    data: { completedAt: issuedAt },
  });
  return code;
}

// ───────────────────────────── scenario ─────────────────────────────

// ───────────────────────────── assignments ─────────────────────────────

function lessonByTitle(course: SeededCourse, title: string): SeededLesson {
  const lesson = lessonsOf(course).find((l) => l.title === title);
  if (!lesson)
    throw new Error(`Lesson «${title}» not found in «${course.title}»`);
  return lesson;
}

function daysAhead(days: number, hour = 23, minute = 59): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Writes a small demo file into public/submissions (same place StorageService uses locally). */
/**
 * Copies a generated demo picture (prisma/seed-assets) into public/<folder>,
 * where StorageService keeps local uploads, and returns its public URL.
 * Avatars and covers are original abstract images, not photos.
 */
function seedImage(folder: 'avatars' | 'courses', file: string): string | null {
  const source = join(
    __dirname,
    'seed-assets',
    folder === 'courses' ? 'covers' : folder,
    file,
  );
  if (!existsSync(source)) return null;
  const dir = join(__dirname, '..', 'public', folder);
  mkdirSync(dir, { recursive: true });
  const stored = `seed-${file}`;
  copyFileSync(source, join(dir, stored));
  return `/public/${folder}/${stored}`;
}

function seedFile(name: string, content: string) {
  const dir = join(__dirname, '..', 'public', 'submissions');
  mkdirSync(dir, { recursive: true });
  const stored = `seed-${name.replace(/[^\w.-]/g, '_')}`;
  writeFileSync(join(dir, stored), content, 'utf8');
  return {
    name,
    url: `/public/submissions/${stored}`,
    size: Buffer.byteLength(content, 'utf8'),
    mimeType: name.endsWith('.css') ? 'text/css' : 'text/markdown',
  };
}

async function createAssignment(
  lesson: SeededLesson,
  data: {
    title: string;
    description: string;
    dueAt: Date;
    maxScore?: number;
    maxFiles?: number;
  },
) {
  return prisma.assignment.create({
    data: { lessonId: lesson.id, maxScore: 100, maxFiles: 3, ...data },
  });
}

/** Labs and tests of the YouTube HTML course (same data as on production). */
async function addHtmlCourseExtras(course: SeededCourse) {
  for (const t of HTML_TESTS) {
    const lesson = lessonByTitle(course, t.lessonTitle);
    await prisma.test.create({
      data: {
        lessonId: lesson.id,
        title: t.title,
        timeLimit: t.timeLimit,
        passingScore: 60,
        questions: {
          create: t.questions.map((q, qi) =>
            'answers' in q
              ? {
                  text: q.text,
                  type: q.type,
                  points: q.points ?? 1,
                  difficulty: qi < 2 ? 1 : 2,
                  answers: {
                    create: q.answers.map(([text, isCorrect]) => ({
                      text,
                      isCorrect,
                    })),
                  },
                }
              : {
                  text: q.text,
                  type: q.type,
                  points: q.points ?? 1,
                  partialCredit: q.partialCredit ?? false,
                  difficulty: qi < 2 ? 1 : 2,
                  config: q.config as Prisma.InputJsonValue,
                },
          ),
        },
      },
    });
  }
  for (const a of HTML_LABS) {
    await createAssignment(lessonByTitle(course, a.lessonTitle), {
      title: a.title,
      description: a.description,
      dueAt: daysAhead(a.dueInDays),
      maxScore: a.maxScore,
      maxFiles: a.maxFiles,
    });
  }
}

async function main() {
  await cleanup();
  const u = await createUsers();

  const c: Record<CourseDef['key'], SeededCourse> = {} as Record<
    CourseDef['key'],
    SeededCourse
  >;
  for (const [i, def] of COURSES.entries()) {
    c[def.key] = await createCourse(
      def,
      u[def.teacher].id,
      daysAgo(45 - i * 4, 9),
    );
  }
  const { web, ts, sql, ux, git, english } = c;
  const olena = u.olena.id;
  const t1 = u.teacher1.id;
  const t2 = u.teacher2.id;

  // ── Олена: the main demo account ──

  // Git і GitHub — finished, one failed attempt then a pass, certificate issued.
  await enroll(olena, git.id, 'ACTIVE', daysAgo(30, 18));
  {
    const lessons = lessonsOf(git);
    const tests = testsOf(git);
    await completeLessons(
      olena,
      lessons,
      lessons.map((_, i) => daysAgo(28 - i * 3, 19, 10 + i)),
    );
    await takeTest(olena, tests[0], 4, 1, daysAgo(24, 20));
    await takeTest(olena, tests[1], 2, 1, daysAgo(20, 20)); // 50% — failed
    await takeTest(olena, tests[1], 4, 2, daysAgo(19, 21)); // 100% — passed
    await takeTest(olena, tests[2], 3, 1, daysAgo(12, 20)); // 75% — passed
  }
  const gitCode = await issueCertificate(olena, git.id, daysAgo(12, 20, 30));

  // Основи веб-розробки — sections 1–2 almost done, lesson in progress.
  await enroll(olena, web.id, 'ACTIVE', daysAgo(14, 9));
  {
    const lessons = lessonsOf(web);
    const tests = testsOf(web);
    await completeLessons(
      olena,
      lessons.slice(0, 4),
      [daysAgo(6, 9), daysAgo(5, 19), daysAgo(3, 20), daysAgo(1, 21)],
      lessons[4],
    );
    await takeTest(olena, tests[0], 5, 1, daysAgo(5, 20));
  }

  // TypeScript — bought, just started.
  await prisma.payment.create({
    data: {
      userId: olena,
      courseId: ts.id,
      amount: ts.price,
      status: 'PAID',
      createdAt: daysAgo(6, 13),
    },
  });
  await enroll(olena, ts.id, 'ACTIVE', daysAgo(6, 13));
  await completeLessons(
    olena,
    lessonsOf(ts).slice(0, 1),
    [daysAgo(4, 22)],
    lessonsOf(ts)[1],
  );

  // UI/UX — first section done, the test failed once (to retake).
  await enroll(olena, ux.id, 'ACTIVE', daysAgo(9, 11));
  {
    const lessons = lessonsOf(ux);
    await completeLessons(olena, lessons.slice(0, 2), [
      daysAgo(2, 18),
      daysAgo(2, 19),
    ]);
    await takeTest(olena, testsOf(ux)[0], 2, 1, daysAgo(2, 20)); // 50% — failed
  }

  // SQL — requires the teacher's approval.
  await enroll(olena, sql.id, 'PENDING', daysAgo(1, 10));

  // ── Other students: give teachers a lively dashboard ──

  const others = [
    's2',
    's3',
    's4',
    's5',
    's6',
    's7',
    's8',
    's9',
    's10',
    's11',
  ].map((k) => u[k].id);

  // Web: 8 active students with progress spread over the last week.
  for (const [i, id] of others.slice(0, 8).entries()) {
    await enroll(id, web.id, 'ACTIVE', daysAgo(20 - i, 10));
    const lessons = lessonsOf(web);
    const done = 2 + (i % 5); // 2..6 lessons
    await completeLessons(
      id,
      lessons.slice(0, done),
      lessons
        .slice(0, done)
        .map((_, j) =>
          daysAgo(Math.max(0, 6 - ((i + j) % 7)), 9 + j * 2, i * 5),
        ),
      lessons[done],
    );
    const tests = testsOf(web);
    if (done >= 2)
      await takeTest(
        id,
        tests[0],
        3 + (i % 3),
        1,
        daysAgo(Math.max(0, 5 - (i % 6)), 21),
      );
    if (done >= 5)
      await takeTest(
        id,
        tests[1],
        2 + (i % 4),
        1,
        daysAgo(Math.max(0, 3 - (i % 4)), 21, 30),
      );
  }

  // SQL: 5 active students, the JOIN test is hard — a low pass rate on purpose.
  for (const [i, id] of others.slice(2, 7).entries()) {
    await enroll(id, sql.id, 'ACTIVE', daysAgo(18 - i, 12));
    const lessons = lessonsOf(sql);
    await completeLessons(
      id,
      lessons.slice(0, 5),
      lessons
        .slice(0, 5)
        .map((_, j) =>
          daysAgo(Math.max(0, 6 - j - (i % 2)), 18 + (j % 3), i * 7),
        ),
      lessons[5],
    );
    const [relTest, joinTest] = testsOf(sql);
    await takeTest(
      id,
      relTest,
      3 + (i % 2),
      1,
      daysAgo(Math.max(0, 5 - i), 20),
    );
    await takeTest(
      id,
      joinTest,
      1 + (i % 3),
      1,
      daysAgo(Math.max(0, 3 - (i % 3)), 20, 15),
    ); // 17–50%
  }
  // Pending requests for teacher1 (besides Олена's).
  await enroll(u.s2.id, sql.id, 'PENDING', daysAgo(2, 15));
  await enroll(u.s3.id, sql.id, 'PENDING', daysAgo(0, 9));
  await enroll(u.s11.id, sql.id, 'REJECTED', daysAgo(10, 9));

  // UI/UX: 6 active students.
  for (const [i, id] of others.slice(4, 10).entries()) {
    await enroll(id, ux.id, 'ACTIVE', daysAgo(15 - i, 14));
    const lessons = lessonsOf(ux);
    const done = 1 + (i % 4);
    await completeLessons(
      id,
      lessons.slice(0, done),
      lessons
        .slice(0, done)
        .map((_, j) => daysAgo(Math.max(0, 5 - ((i + j) % 6)), 12 + j)),
    );
    if (done >= 2)
      await takeTest(
        id,
        testsOf(ux)[0],
        2 + (i % 3),
        1,
        daysAgo(Math.max(0, 4 - i), 16),
      );
  }

  // teacher2's courses: a few students so their dashboard is not empty.
  for (const [i, id] of others.slice(0, 4).entries()) {
    await enroll(id, git.id, 'ACTIVE', daysAgo(25 - i, 10));
    await completeLessons(
      id,
      lessonsOf(git).slice(0, 2 + i),
      lessonsOf(git)
        .slice(0, 2 + i)
        .map((_, j) => daysAgo(Math.max(0, 6 - j - i), 17)),
    );
    await takeTest(
      id,
      testsOf(git)[0],
      3 + (i % 2),
      1,
      daysAgo(Math.max(0, 5 - i), 18),
    );
  }
  for (const [i, id] of others.slice(6, 9).entries()) {
    await prisma.payment.create({
      data: {
        userId: id,
        courseId: ts.id,
        amount: ts.price,
        status: 'PAID',
        createdAt: daysAgo(10 - i * 2, 12),
      },
    });
    await enroll(id, ts.id, 'ACTIVE', daysAgo(10 - i * 2, 12));
    await completeLessons(
      id,
      lessonsOf(ts).slice(0, 2 + i),
      lessonsOf(ts)
        .slice(0, 2 + i)
        .map((_, j) => daysAgo(Math.max(0, 5 - j), 20)),
    );
    if (i > 0) await takeTest(id, testsOf(ts)[0], 3 + i, 1, daysAgo(2, 21));
  }
  {
    const id = u.s10.id;
    await prisma.payment.create({
      data: {
        userId: id,
        courseId: english.id,
        amount: english.price,
        status: 'PAID',
        createdAt: daysAgo(8, 19),
      },
    });
    await enroll(id, english.id, 'ACTIVE', daysAgo(8, 19));
    await completeLessons(id, lessonsOf(english).slice(0, 2), [
      daysAgo(4, 20),
      daysAgo(3, 20),
    ]);
    await takeTest(id, testsOf(english)[0], 4, 1, daysAgo(3, 21));
  }

  // ── Chats ──

  const activeIn = async (courseId: number) =>
    (
      await prisma.enrollment.findMany({
        where: { courseId, status: 'ACTIVE' },
        select: { userId: true },
      })
    ).map((e) => e.userId);

  await courseChat(
    web.id,
    [t1, ...(await activeIn(web.id))],
    [
      {
        from: t1,
        text: 'Вітаю всіх на курсі! Питання по урокам пишіть сюди — відповідаю щодня ввечері.',
        at: daysAgo(6, 10),
      },
      {
        from: u.s2.id,
        text: 'Дякую! А домашнє завдання з Flexbox треба десь здавати?',
        at: daysAgo(3, 18, 5),
      },
      {
        from: t1,
        text: 'Киньте посилання на CodePen або GitHub прямо в цей чат, я подивлюся.',
        at: daysAgo(3, 19),
      },
      {
        from: olena,
        text: 'Зробила сітку каталогу через grid-template-areas — так можна?',
        at: daysAgo(1, 21, 40),
      },
      {
        from: t1,
        text: 'Так, чудовий варіант! Тільки перевірте, як воно виглядає на 390 px.',
        at: daysAgo(0, 9, 15),
      },
    ],
  );
  await courseChat(
    sql.id,
    [t1, ...(await activeIn(sql.id))],
    [
      {
        from: t1,
        text: 'Нагадую: тест «SQL-запити» обмежений 15 хвилинами, повторіть JOIN перед спробою.',
        at: daysAgo(4, 11),
      },
      {
        from: u.s4.id,
        text: 'LEFT JOIN і RIGHT JOIN — це просто дзеркальні варіанти?',
        at: daysAgo(3, 20, 30),
      },
      {
        from: t1,
        text: 'Так, RIGHT JOIN можна переписати як LEFT JOIN, помінявши таблиці місцями.',
        at: daysAgo(3, 21),
      },
    ],
  );
  await courseChat(
    ux.id,
    [t1, ...(await activeIn(ux.id))],
    [
      {
        from: t1,
        text: 'Ласкаво просимо! Перший тест можна перездавати скільки завгодно разів.',
        at: daysAgo(8, 12),
      },
      {
        from: u.s7.id,
        text: 'Підкажіть сервіс для перевірки контрасту кольорів?',
        at: daysAgo(2, 17),
      },
      {
        from: t1,
        text: 'Вбудований у Chrome DevTools: наведіть на колір у панелі Styles — там є коефіцієнт контрасту.',
        at: daysAgo(2, 18),
      },
    ],
  );
  await courseChat(
    ts.id,
    [t2, ...(await activeIn(ts.id))],
    [
      {
        from: t2,
        text: 'Привіт! Рекомендую одразу ввімкнути "strict": true у tsconfig — так навчатися корисніше.',
        at: daysAgo(9, 10),
      },
      {
        from: olena,
        text: 'А unknown чи any краще для відповіді з fetch?',
        at: daysAgo(4, 22, 10),
      },
      {
        from: t2,
        text: 'unknown + валідація. Детально розберемо в розділі про звуження типів.',
        at: daysAgo(3, 9),
      },
    ],
  );
  await courseChat(
    git.id,
    [t2, ...(await activeIn(git.id))],
    [
      {
        from: t2,
        text: 'Ласкаво просимо! Не бійтеся конфліктів злиття — у курсі є урок саме про них.',
        at: daysAgo(26, 10),
      },
      {
        from: olena,
        text: 'Дякую за курс, отримала сертифікат!',
        at: daysAgo(12, 21),
      },
      {
        from: t2,
        text: 'Вітаю, Олено! Наступний крок — спробуйте зробити PR у open source проєкт.',
        at: daysAgo(11, 9),
      },
    ],
  );
  await courseChat(
    english.id,
    [t2, ...(await activeIn(english.id))],
    [
      {
        from: t2,
        text: 'Hi everyone! Пишіть питання англійською — це теж практика.',
        at: daysAgo(8, 20),
      },
    ],
  );

  // Direct chat Олена ↔ Ірина Мельник; the last two teacher messages are unread.
  const direct = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: { create: [{ userId: olena }, { userId: t1 }] },
    },
  });
  const dm = [
    {
      from: olena,
      text: 'Добрий день! Надіслала роботу з CSS-верстки, подивіться, будь ласка, коли буде час.',
      at: daysAgo(2, 19),
      read: true,
    },
    {
      from: t1,
      text: 'Добрий вечір, Олено! Перевірила вашу роботу — загалом дуже добре.',
      at: daysAgo(0, 11, 50),
      read: false,
    },
    {
      from: t1,
      text: 'Є пара зауважень: додайте alt до зображень і перевірте відступи на мобільному.',
      at: daysAgo(0, 12, 5),
      read: false,
    },
  ];
  for (const m of dm) {
    await prisma.message.create({
      data: {
        conversationId: direct.id,
        senderId: m.from,
        content: m.text,
        createdAt: m.at,
        readAt: m.read ? addMinutes(m.at, 20) : null,
      },
    });
  }

  // ── Notifications ──

  const uxResultTest = testsOf(ux)[0];
  await notify(
    olena,
    'CERTIFICATE',
    'Сертифікат за курс «Git і GitHub з нуля» готовий',
    `Номер сертифіката ${gitCode}`,
    `/certificates/${gitCode}`,
    daysAgo(12, 20, 31),
    true,
  );
  await notify(
    olena,
    'PAYMENT',
    'Оплату курсу «TypeScript для початківців» підтверджено',
    `Сума: ${ts.price} ₴`,
    `/courses/${ts.id}`,
    daysAgo(6, 13),
    true,
  );
  await notify(
    olena,
    'TEST_RESULT',
    'Тест «Тест: основи UX»: 50%',
    'Тест не складено — спробуйте ще раз',
    `/courses/${ux.id}/tests/${uxResultTest.id}/result`,
    daysAgo(2, 20),
    false,
  );
  await notify(
    olena,
    'NEW_LESSON',
    'Новий урок у курсі «Основи веб-розробки»',
    'Події та DOM',
    `/courses/${web.id}`,
    daysAgo(1, 9),
    false,
  );
  await notify(
    olena,
    'NEW_MESSAGE',
    'Нове повідомлення від Ірина Мельник',
    'Є пара зауважень: додайте alt до зображень…',
    `/chat?c=${direct.id}`,
    daysAgo(0, 12, 5),
    false,
  );

  for (const [who, at] of [
    [u.olena, daysAgo(1, 10)],
    [u.s2, daysAgo(2, 15)],
    [u.s3, daysAgo(0, 9)],
  ] as const) {
    await notify(
      t1,
      'ENROLLMENT_REQUEST',
      `Нова заявка на курс «${sql.title}»`,
      `${who.name} хоче приєднатися до курсу`,
      `/courses/${sql.id}/manage`,
      at,
      false,
    );
  }
  await notify(
    t2,
    'PAYMENT',
    `Новий студент у курсі «${ts.title}»`,
    'Олена Коваль придбала курс',
    `/courses/${ts.id}/manage`,
    daysAgo(6, 13),
    true,
  );

  await addHtmlCourseExtras(c.html);

  // ── Practical assignments with file hand-ins ──

  const webTask = await createAssignment(
    lessonByTitle(web, 'Flexbox і Grid на практиці'),
    {
      title: 'Адаптивна сторінка-каталог',
      description:
        '<p>Зверстайте сторінку каталогу курсів із карткою курсу на Flexbox і сіткою на Grid.</p>' +
        '<ul><li>картка: обкладинка, назва, кнопка;</li><li>сітка <code>repeat(auto-fill, minmax(260px, 1fr))</code>;</li>' +
        '<li>сторінка коректно виглядає на ширині 390 px.</li></ul>' +
        '<p>Здайте файли HTML/CSS архівом або окремими файлами та скриншот мобільної версії.</p>',
      dueAt: daysAhead(7),
    },
  );
  const gitTask = await createAssignment(
    lessonByTitle(git, 'Pull request і code review'),
    {
      title: 'Pull request до навчального репозиторію',
      description:
        '<p>Створіть гілку, внесіть зміни в README навчального репозиторію та відкрийте pull request.</p>' +
        '<p>Здайте короткий звіт (Markdown або PDF) із посиланням на PR і скриншотом рецензії.</p>',
      dueAt: daysAgo(14, 23, 59),
      maxFiles: 2,
    },
  );
  await createAssignment(lessonByTitle(sql, 'JOIN-запити'), {
    title: 'Запити до бази «Бібліотека»',
    description:
      '<p>Напишіть 5 запитів до бази «Бібліотека»: книги автора, кількість видач за місяць, ' +
      'читачі без жодної видачі (LEFT JOIN), топ-3 жанри, середній строк повернення.</p>' +
      '<p>Здайте файл <code>.sql</code> із запитами та коментарями.</p>',
    dueAt: daysAgo(2, 23, 59),
  });
  await createAssignment(lessonByTitle(ux, 'Адаптивний дизайн'), {
    title: 'Прототип мобільного екрана',
    description:
      '<p>Спроєктуйте мобільну версію екрана кабінету студента (ширина 390 px): ' +
      'нижня навігація, картки «Продовжити навчання», цілі дотику не менше 44 px.</p>' +
      '<p>Здайте PNG-експорт макета та короткий опис рішень.</p>',
    dueAt: daysAhead(10),
    maxFiles: 5,
  });

  // Олена's Git report — checked by the teacher.
  await prisma.submission.create({
    data: {
      assignmentId: gitTask.id,
      userId: olena,
      comment: 'Посилання на PR у звіті.',
      status: 'GRADED',
      score: 95,
      feedback:
        'Чудовий опис змін і акуратні коміти. Наступного разу додайте посилання на issue.',
      submittedAt: daysAgo(16, 21),
      gradedAt: daysAgo(15, 10),
      files: {
        create: [
          seedFile(
            'Звіт_pull_request.md',
            '# Звіт: pull request\n\n- Гілка: docs/readme-update\n- PR: https://github.com/example/lms-demo/pull/7\n- Рецензент: Андрій Бойко\n',
          ),
        ],
      },
    },
  });

  // Максим handed in the web task — waiting for review.
  await prisma.submission.create({
    data: {
      assignmentId: webTask.id,
      userId: u.s2.id,
      comment: 'Сітку перевірив у DevTools на 390 px.',
      status: 'SUBMITTED',
      submittedAt: daysAgo(1, 22),
      files: {
        create: [
          seedFile(
            'catalog.css',
            '.catalog {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));\n  gap: 20px;\n}\n',
          ),
        ],
      },
    },
  });

  // ── New question types + question bank ──
  // Added to tests nobody has taken in the seed, so earlier demo attempts stay consistent.
  {
    const webJs = testsOf(web)[2];
    if (webJs) {
      await prisma.question.createMany({
        data: [
          {
            testId: webJs.id,
            text: 'Метод querySelector повертає усі знайдені елементи.',
            type: 'TRUE_FALSE',
            config: { correct: false },
          },
          {
            testId: webJs.id,
            text: 'Яке ключове слово оголошує змінну, яку не можна перепризначити?',
            type: 'SHORT_TEXT',
            config: { accepted: ['const'], caseSensitive: false },
          },
          {
            testId: webJs.id,
            text: 'Зіставте подію з моментом, коли вона спрацьовує.',
            type: 'MATCHING',
            points: 2,
            partialCredit: true,
            config: {
              pairs: [
                { left: 'click', right: 'натискання на елемент' },
                { left: 'input', right: 'зміна значення поля' },
                { left: 'submit', right: 'надсилання форми' },
              ],
            },
          },
        ],
      });
    }
    const tsTest = testsOf(ts)[1];
    if (tsTest) {
      await prisma.question.createMany({
        data: [
          {
            testId: tsTest.id,
            text: 'Скільки параметрів типу має Record<K, V>?',
            type: 'NUMERIC',
            config: { value: 2, tolerance: 0 },
          },
          {
            testId: tsTest.id,
            text: 'Розташуйте етапи роботи компілятора TypeScript у правильному порядку.',
            type: 'ORDERING',
            points: 2,
            partialCredit: true,
            config: {
              items: ['Розбір коду', 'Перевірка типів', 'Генерація JavaScript'],
            },
          },
          {
            testId: tsTest.id,
            text: 'Поясніть своїми словами, чим interface відрізняється від type.',
            type: 'ESSAY',
            points: 3,
            config: {
              maxWords: 200,
              rubric:
                'Згадано розширення через extends, злиття оголошень, обмеження type для union.',
            },
          },
        ],
      });
    }
    const bank = await prisma.questionBankCategory.create({
      data: { courseId: web.id, name: 'HTML і CSS: банк' },
    });
    await prisma.question.create({
      data: {
        categoryId: bank.id,
        text: 'Який тег створює посилання?',
        type: 'SINGLE',
        answers: {
          create: [
            { text: '<a>', isCorrect: true },
            { text: '<link>' },
            { text: '<href>' },
          ],
        },
      },
    });
    await prisma.question.createMany({
      data: [
        {
          categoryId: bank.id,
          text: 'CSS розшифровується як Cascading Style Sheets.',
          type: 'TRUE_FALSE',
          config: { correct: true },
        },
        {
          categoryId: bank.id,
          text: 'Яка властивість задає відступ усередині елемента?',
          type: 'SHORT_TEXT',
          config: { accepted: ['padding'], caseSensitive: false },
        },
        {
          categoryId: bank.id,
          text: 'Скільки рівнів заголовків є в HTML?',
          type: 'NUMERIC',
          config: { value: 6, tolerance: 0 },
        },
      ],
    });
    if (webJs) {
      await prisma.testRandomRule.create({
        data: { testId: webJs.id, categoryId: bank.id, count: 2 },
      });
    }
  }

  // ── Summary ──

  const counts = {
    users: await prisma.user.count(),
    courses: await prisma.course.count(),
    lessons: await prisma.lesson.count(),
    tests: await prisma.test.count(),
    questions: await prisma.question.count(),
    bankCategories: await prisma.questionBankCategory.count(),
    enrollments: await prisma.enrollment.count(),
    testResults: await prisma.testResult.count(),
    certificates: await prisma.certificate.count(),
    notifications: await prisma.notification.count(),
    messages: await prisma.message.count(),
    assignments: await prisma.assignment.count(),
    submissions: await prisma.submission.count(),
  };
  console.log('Seed complete.', counts);
  console.log(`
Demo accounts (password ${DEMO_PASSWORD} unless noted):
  admin     admin@lms.local / ${ADMIN_PASSWORD}
  teacher   teacher1@lms.local  (Ірина Мельник — веб, SQL, UX)
  teacher   teacher2@lms.local  (Андрій Бойко — TypeScript, Git, англійська)
  student   student@lms.local   (Олена Коваль — головний демо-акаунт)
  students  student2…student11@lms.local
Certificate to verify: /certificates/${gitCode}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
