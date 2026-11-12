-- CreateEnum
CREATE TYPE "CourseStaffRole" AS ENUM ('OWNER', 'TEACHER', 'ASSISTANT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_STAFF_ADDED';

-- CreateTable
CREATE TABLE "CourseStaff" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "CourseStaffRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseStaff_userId_idx" ON "CourseStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStaff_courseId_userId_key" ON "CourseStaff"("courseId", "userId");

-- AddForeignKey
ALTER TABLE "CourseStaff" ADD CONSTRAINT "CourseStaff_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStaff" ADD CONSTRAINT "CourseStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing course gets its teacher as OWNER.
INSERT INTO "CourseStaff" ("courseId", "userId", "role")
SELECT "id", "teacherId", 'OWNER' FROM "Course"
ON CONFLICT ("courseId", "userId") DO NOTHING;
