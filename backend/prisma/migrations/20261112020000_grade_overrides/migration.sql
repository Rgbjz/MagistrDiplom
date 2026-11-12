-- CreateEnum
CREATE TYPE "GradingScale" AS ENUM ('PERCENT', 'FIVE_POINT', 'ECTS', 'PASS_FAIL');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GRADE_UPDATED';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "gradingScale" "GradingScale" NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "gradingScaleConfig" JSONB;

-- CreateTable
CREATE TABLE "GradeOverride" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeOverrideHistory" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "oldValue" DOUBLE PRECISION,
    "newValue" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "changedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeOverrideHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeOverride_courseId_userId_itemKey_key" ON "GradeOverride"("courseId", "userId", "itemKey");

-- CreateIndex
CREATE INDEX "GradeOverrideHistory_courseId_userId_idx" ON "GradeOverrideHistory"("courseId", "userId");

-- AddForeignKey
ALTER TABLE "GradeOverride" ADD CONSTRAINT "GradeOverride_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeOverride" ADD CONSTRAINT "GradeOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeOverrideHistory" ADD CONSTRAINT "GradeOverrideHistory_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeOverrideHistory" ADD CONSTRAINT "GradeOverrideHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

