-- Calendar: course events, deadline reminders, personal iCal feed.

-- CreateEnum
CREATE TYPE "CourseEventKind" AS ENUM ('LECTURE', 'ONLINE_LESSON', 'DEADLINE', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_REMINDER';

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "calendarTokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deadlineReminders" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CourseEvent" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CourseEventKind" NOT NULL DEFAULT 'OTHER',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseEvent_courseId_startsAt_idx" ON "CourseEvent"("courseId", "startsAt");

-- AddForeignKey
ALTER TABLE "CourseEvent" ADD CONSTRAINT "CourseEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEvent" ADD CONSTRAINT "CourseEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
