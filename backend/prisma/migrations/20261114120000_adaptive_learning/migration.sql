-- Adaptive learning module: learner model, settings, A/B groups, event log.
-- CreateEnum
CREATE TYPE "AdaptiveExperimentMode" AS ENUM ('OFF', 'AB_TEST');
-- CreateEnum
CREATE TYPE "AdaptiveGroup" AS ENUM ('ADAPTIVE', 'CONTROL');
-- CreateEnum
CREATE TYPE "AdaptiveEventType" AS ENUM ('RECOMMENDATION_SHOWN', 'RECOMMENDATION_OPENED', 'MASTERY_UPDATED', 'ADAPTIVE_TEST_GENERATED');
-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "adaptiveGroup" "AdaptiveGroup";
-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "calibratedDifficulty" DOUBLE PRECISION,
ADD COLUMN     "calibrationCount" INTEGER NOT NULL DEFAULT 0;
-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "adaptive" BOOLEAN;
-- AlterTable
ALTER TABLE "TestResult" ADD COLUMN     "strategy" TEXT,
ADD COLUMN     "targetDifficulty" DOUBLE PRECISION;
-- CreateTable
CREATE TABLE "CourseAdaptiveSettings" (
    "courseId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "masteryThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "accelerationThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "adaptiveTestsDefault" BOOLEAN NOT NULL DEFAULT false,
    "experimentMode" "AdaptiveExperimentMode" NOT NULL DEFAULT 'OFF',
    "experimentStartedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseAdaptiveSettings_pkey" PRIMARY KEY ("courseId")
);
-- CreateTable
CREATE TABLE "LearnerSectionMastery" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "evidence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearnerSectionMastery_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LearnerAbility" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "theta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "answers" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearnerAbility_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AdaptiveEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "type" "AdaptiveEventType" NOT NULL,
    "key" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdaptiveEvent_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "LearnerSectionMastery_courseId_idx" ON "LearnerSectionMastery"("courseId");
-- CreateIndex
CREATE UNIQUE INDEX "LearnerSectionMastery_userId_sectionId_key" ON "LearnerSectionMastery"("userId", "sectionId");
-- CreateIndex
CREATE UNIQUE INDEX "LearnerAbility_userId_courseId_key" ON "LearnerAbility"("userId", "courseId");
-- CreateIndex
CREATE INDEX "AdaptiveEvent_courseId_type_idx" ON "AdaptiveEvent"("courseId", "type");
-- CreateIndex
CREATE INDEX "AdaptiveEvent_userId_courseId_type_idx" ON "AdaptiveEvent"("userId", "courseId", "type");
-- AddForeignKey
ALTER TABLE "CourseAdaptiveSettings" ADD CONSTRAINT "CourseAdaptiveSettings_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LearnerSectionMastery" ADD CONSTRAINT "LearnerSectionMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LearnerSectionMastery" ADD CONSTRAINT "LearnerSectionMastery_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LearnerSectionMastery" ADD CONSTRAINT "LearnerSectionMastery_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LearnerAbility" ADD CONSTRAINT "LearnerAbility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LearnerAbility" ADD CONSTRAINT "LearnerAbility_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdaptiveEvent" ADD CONSTRAINT "AdaptiveEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdaptiveEvent" ADD CONSTRAINT "AdaptiveEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
