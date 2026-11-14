-- Indexes for the hottest course-scoped queries (see docs/performance.md:
-- measured on 1 000 students per course before/after).
CREATE INDEX "TestResult_testId_userId_idx" ON "TestResult"("testId", "userId");

CREATE INDEX "Enrollment_courseId_status_idx" ON "Enrollment"("courseId", "status");

CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
