-- CreateEnum
CREATE TYPE "ShowAnswersMode" AS ENUM ('NEVER', 'AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_CLOSE');

-- CreateEnum
CREATE TYPE "AttemptQuestionStatus" AS ENUM ('AUTO', 'PENDING', 'GRADED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'TRUE_FALSE';
ALTER TYPE "QuestionType" ADD VALUE 'SHORT_TEXT';
ALTER TYPE "QuestionType" ADD VALUE 'NUMERIC';
ALTER TYPE "QuestionType" ADD VALUE 'MATCHING';
ALTER TYPE "QuestionType" ADD VALUE 'ORDERING';
ALTER TYPE "QuestionType" ADD VALUE 'ESSAY';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "config" JSONB,
ADD COLUMN     "partialCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "testId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "maxAttempts" INTEGER,
ADD COLUMN     "questionsPerAttempt" INTEGER,
ADD COLUMN     "showCorrectAnswers" "ShowAnswersMode" NOT NULL DEFAULT 'AFTER_SUBMIT',
ADD COLUMN     "shuffleAnswers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TestResult" ADD COLUMN     "pendingReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "QuestionBankCategory" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionBankCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRandomRule" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "TestRandomRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptQuestion" (
    "id" SERIAL NOT NULL,
    "testResultId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "optionOrder" JSONB,
    "response" JSONB,
    "earned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxPoints" INTEGER NOT NULL,
    "status" "AttemptQuestionStatus" NOT NULL DEFAULT 'AUTO',
    "feedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "gradedById" INTEGER,

    CONSTRAINT "AttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionBankCategory_courseId_idx" ON "QuestionBankCategory"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "TestRandomRule_testId_categoryId_key" ON "TestRandomRule"("testId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_testResultId_questionId_key" ON "AttemptQuestion"("testResultId", "questionId");

-- CreateIndex
CREATE INDEX "Question_categoryId_idx" ON "Question"("categoryId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "QuestionBankCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankCategory" ADD CONSTRAINT "QuestionBankCategory_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRandomRule" ADD CONSTRAINT "TestRandomRule_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRandomRule" ADD CONSTRAINT "TestRandomRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "QuestionBankCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

