-- Scales a seeded LMS database up for performance measurements.
-- Run ONLY against a separate database (e.g. lms_perf), never lms_dev/prod:
--   psql -v n=1000 -d lms_perf -f perf/db/scale.sql
-- Adds :n students enrolled in every published course with lesson progress,
-- 1–2 finished attempts per test (per-question rows), graded lab
-- submissions, learner-model rows and course-chat messages.
\set ON_ERROR_STOP on
\if :{?n}
\else
  \set n 1000
\endif

BEGIN;

-- Students (password is not a valid hash: these accounts can't log in).
INSERT INTO "User" (email, password, role, "emailVerified", "createdAt", "updatedAt")
SELECT format('perf%s@perf.local', g), 'x', 'STUDENT', true, now() - (g % 90) * interval '1 day', now()
FROM generate_series(1, :n) g;

INSERT INTO "UserProfile" ("userId", "firstName", "lastName", "createdAt", "updatedAt")
SELECT u.id, 'Perf', 'Student ' || u.id, now(), now()
FROM "User" u WHERE u.email LIKE 'perf%@perf.local';

CREATE TEMP TABLE perf_users AS SELECT id FROM "User" WHERE email LIKE 'perf%@perf.local';
CREATE TEMP TABLE perf_courses AS SELECT id FROM "Course" WHERE published;

INSERT INTO "Enrollment" ("userId", "courseId", status, "enrolledAt", "createdAt", "updatedAt")
SELECT u.id, c.id, 'ACTIVE', now() - interval '30 days', now(), now()
FROM perf_users u CROSS JOIN perf_courses c;

-- Lesson progress: ~70 % completed, ~15 % in progress. (random() is made
-- row-dependent: an uncorrelated sub-select would be evaluated only once.)
INSERT INTO "LessonProgress" ("userId", "lessonId", status, "startedAt", "completedAt", "createdAt", "updatedAt")
SELECT u.id, l.id,
       (CASE WHEN r < 0.70 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END)::"LessonProgressStatus",
       now() - interval '20 days',
       CASE WHEN r < 0.70 THEN now() - (r * 20) * interval '1 day' END,
       now(), now()
FROM perf_users u
JOIN perf_courses c ON true
JOIN "Section" s ON s."courseId" = c.id
JOIN "Lesson" l ON l."sectionId" = s.id
CROSS JOIN LATERAL (SELECT random() + 0 * (u.id + l.id) AS r) x
WHERE x.r < 0.85;

-- Finished test attempts (1–2 per student and test) with per-question rows.
INSERT INTO "TestResult" ("userId", "testId", attempt, "startedAt", "finishedAt", score, passed, "createdAt", "updatedAt")
SELECT u.id, t.id, a.n, now() - interval '10 days', now() - interval '10 days' + interval '8 minutes',
       sc, sc >= t."passingScore", now(), now()
FROM perf_users u
JOIN perf_courses c ON true
JOIN "Section" s ON s."courseId" = c.id
JOIN "Lesson" l ON l."sectionId" = s.id
JOIN "Test" t ON t."lessonId" = l.id
CROSS JOIN LATERAL generate_series(1, 1 + (random() + 0 * (u.id + t.id) < 0.4)::int) a(n)
CROSS JOIN LATERAL (SELECT (30 + random() * 70 + 0 * (u.id + t.id + a.n))::int AS sc) x;

INSERT INTO "AttemptQuestion" ("testResultId", "questionId", position, earned, "maxPoints", status)
SELECT tr.id, q.id, row_number() OVER (PARTITION BY tr.id ORDER BY q.id),
       CASE WHEN random() * 100 < tr.score THEN q.points ELSE 0 END, q.points, 'AUTO'
FROM "TestResult" tr
JOIN perf_users u ON u.id = tr."userId"
JOIN "Question" q ON q."testId" = tr."testId";

-- Graded lab submissions for ~80 % of students.
INSERT INTO "Submission" ("assignmentId", "userId", status, score, "submittedAt", "gradedAt", late)
SELECT a.id, u.id, 'GRADED', (a."maxScore" * (0.4 + random() * 0.6))::int, now() - interval '5 days', now() - interval '4 days', false
FROM perf_users u
JOIN perf_courses c ON true
JOIN "Section" s ON s."courseId" = c.id
JOIN "Lesson" l ON l."sectionId" = s.id
JOIN "Assignment" a ON a."lessonId" = l.id
WHERE random() < 0.8;

-- Learner model rows (as the adaptive module would compute them).
INSERT INTO "LearnerSectionMastery" ("userId", "courseId", "sectionId", mastery, evidence, "updatedAt")
SELECT u.id, c.id, s.id, random(), (random() * 12)::int, now()
FROM perf_users u JOIN perf_courses c ON true JOIN "Section" s ON s."courseId" = c.id;

INSERT INTO "LearnerAbility" ("userId", "courseId", theta, answers, "updatedAt")
SELECT u.id, c.id, random() * 3 - 1.5, (random() * 30)::int, now()
FROM perf_users u JOIN perf_courses c ON true;

-- Course chats: every student is a participant; ~5 messages per student.
INSERT INTO "ConversationParticipant" ("conversationId", "userId", "createdAt")
SELECT cv.id, u.id, now()
FROM "Conversation" cv JOIN perf_courses c ON c.id = cv."courseId" CROSS JOIN perf_users u
WHERE cv.type = 'COURSE'
ON CONFLICT DO NOTHING;

INSERT INTO "Message" ("conversationId", "senderId", content, "createdAt")
SELECT cv.id, u.id, 'perf message ' || g, now() - (random() * 60) * interval '1 day'
FROM "Conversation" cv JOIN perf_courses c ON c.id = cv."courseId"
CROSS JOIN perf_users u CROSS JOIN generate_series(1, 5) g
WHERE cv.type = 'COURSE' AND random() < 0.15;

COMMIT;
ANALYZE;

SELECT 'users' t, count(*) FROM "User" UNION ALL
SELECT 'enrollments', count(*) FROM "Enrollment" UNION ALL
SELECT 'lessonProgress', count(*) FROM "LessonProgress" UNION ALL
SELECT 'testResults', count(*) FROM "TestResult" UNION ALL
SELECT 'attemptQuestions', count(*) FROM "AttemptQuestion" UNION ALL
SELECT 'submissions', count(*) FROM "Submission" UNION ALL
SELECT 'messages', count(*) FROM "Message";
