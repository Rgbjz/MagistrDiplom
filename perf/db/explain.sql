-- EXPLAIN ANALYZE of the queries behind gradebook/analytics/adaptive for the
-- course «Основи веб-розробки» (the shapes Prisma generates: IN-lists of ids).
\set ON_ERROR_STOP on
SELECT id AS course FROM "Course" WHERE title = 'Основи веб-розробки' \gset
SELECT array_agg(e."userId") AS users FROM "Enrollment" e WHERE e."courseId" = :course AND e.status IN ('ACTIVE','COMPLETED') \gset
SELECT array_agg(t.id) AS tests FROM "Test" t JOIN "Lesson" l ON l.id = t."lessonId" JOIN "Section" s ON s.id = l."sectionId" WHERE s."courseId" = :course \gset
SELECT array_agg(l.id) AS lessons FROM "Lesson" l JOIN "Section" s ON s.id = l."sectionId" WHERE s."courseId" = :course \gset

\echo '== Q1 enrollments of the course'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "userId", "enrolledAt" FROM "Enrollment" WHERE "courseId" = :course AND status IN ('ACTIVE','COMPLETED');
\echo '== Q2 finished attempts of the course students'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id, "userId", "testId", score FROM "TestResult" WHERE "testId" = ANY(:'tests'::int[]) AND "userId" = ANY(:'users'::int[]) AND "finishedAt" IS NOT NULL;
\echo '== Q3 per-question outcomes of those attempts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT aq."questionId", aq.earned, aq."maxPoints" FROM "AttemptQuestion" aq JOIN "TestResult" tr ON tr.id = aq."testResultId" WHERE tr."testId" = ANY(:'tests'::int[]) AND tr."finishedAt" IS NOT NULL;
\echo '== Q4 lesson progress of the course'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "userId", status, "completedAt" FROM "LessonProgress" WHERE "lessonId" = ANY(:'lessons'::int[]) AND "userId" = ANY(:'users'::int[]);
\echo '== Q5 last chat message per student (analytics activity)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT m."senderId", max(m."createdAt") FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE c."courseId" = :course GROUP BY m."senderId";
\echo '== Q6 one student: last attempt per test (adaptive/me)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT DISTINCT ON ("testId") id, "testId", score FROM "TestResult" WHERE "userId" = (:'users'::int[])[1] AND "testId" = ANY(:'tests'::int[]) AND "finishedAt" IS NOT NULL ORDER BY "testId", attempt DESC;
\echo '== Q7 chat history page'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "Message" WHERE "conversationId" = (SELECT id FROM "Conversation" WHERE "courseId" = :course LIMIT 1) ORDER BY "createdAt" DESC LIMIT 50;
