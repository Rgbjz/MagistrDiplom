import { Lesson, LessonProgress, Section, Test, TestResult } from '../db'

import ApiError from '../utils/ApiError'
import { LESSON_PROGRESS_STATUS } from '../constants'

class CourseProgressService {
  async getProgress (courseId: number, userId: number) {
    /** ===== LESSONS ===== */
    const lessons = await Lesson.findAll({
      include: [
        {
          model: Section,
          as: 'section',
          attributes: [],
          where: { courseId }
        }
      ],
      attributes: ['id']
    })

    const lessonIds = lessons.map(lesson => lesson.id)

    const completedLessons = await LessonProgress.findAll({
      where: {
        userId,
        lessonId: lessonIds,
        status: LESSON_PROGRESS_STATUS.COMPLETED
      },
      attributes: ['lessonId']
    })

    /** ===== TESTS ===== */
    const tests = await Test.findAll({
      include: [
        {
          model: Lesson,
          as: 'lesson',
          attributes: [],
          include: [
            {
              model: Section,
              as: 'section',
              attributes: [],
              where: { courseId }
            }
          ]
        }
      ],
      attributes: ['id']
    })

    const testIds = tests.map(test => test.id)

    const passedTests = await TestResult.findAll({
      where: {
        userId,
        testId: testIds,
        passed: true
      },
      attributes: ['testId']
    })

    /** ===== TOTAL ===== */
    const totalItems = lessonIds.length + testIds.length
    const completedItems = completedLessons.length + passedTests.length

    const percent =
      totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100)

    return {
      percent,
      total: totalItems,
      completed: completedItems,
      lessons: completedLessons.map(l => l.lessonId),
      tests: passedTests.map(t => t.testId)
    }
  }

  async startLesson (lessonId: number, userId: number) {
    const [progress] = await LessonProgress.findOrCreate({
      where: { lessonId, userId },
      defaults: {
        status: LESSON_PROGRESS_STATUS.IN_PROGRESS,
        startedAt: new Date()
      }
    })

    if (progress.status === LESSON_PROGRESS_STATUS.NOT_STARTED) {
      progress.status = LESSON_PROGRESS_STATUS.IN_PROGRESS
      progress.startedAt = new Date()
      await progress.save()
    }

    return progress
  }

  async completeLesson (lessonId: number, userId: number) {
    const progress = await LessonProgress.findOne({
      where: { lessonId, userId }
    })

    if (!progress) {
      throw ApiError.badRequest('Lesson not started')
    }

    if (progress.status !== LESSON_PROGRESS_STATUS.COMPLETED) {
      progress.status = LESSON_PROGRESS_STATUS.COMPLETED
      progress.completedAt = new Date()
      await progress.save()
    }

    return progress
  }
}

export default new CourseProgressService()
