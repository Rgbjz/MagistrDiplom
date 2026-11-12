-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "LessonVideo" (
    "id" SERIAL NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "mp4Url" TEXT,
    "hlsPrefix" TEXT,
    "renditions" TEXT,
    "hasPoster" BOOLEAN NOT NULL DEFAULT false,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonVideo_lessonId_key" ON "LessonVideo"("lessonId");

-- AddForeignKey
ALTER TABLE "LessonVideo" ADD CONSTRAINT "LessonVideo_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move previously uploaded videos (stored in Lesson.videoUrl) to LessonVideo:
-- they stay playable as progressive MP4 right away; the API re-queues them
-- for HLS transcoding on startup (VideoService reconciliation).
INSERT INTO "LessonVideo" ("lessonId", "status", "progress", "mp4Url", "createdAt", "updatedAt")
SELECT "id", 'READY', 100, "videoUrl", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson"
WHERE "videoUrl" LIKE '/public/videos/%'
   OR "videoUrl" ~ '^https://[^/]+\.blob\.vercel-storage\.com/videos/';

UPDATE "Lesson" SET "videoUrl" = NULL
WHERE "videoUrl" LIKE '/public/videos/%'
   OR "videoUrl" ~ '^https://[^/]+\.blob\.vercel-storage\.com/videos/';
