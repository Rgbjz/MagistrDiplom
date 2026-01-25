const {
  Lesson,
  LessonProgress,
  Section,
  Test,
  TestResult
} = require('../db/models')

class CourseProgressService {
  async getProgress (courseId, userId) {
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

    const lessonIds = lessons.map(l => l.id)

    const completedLessons = await LessonProgress.findAll({
      where: {
        userId,
        lessonId: lessonIds,
        status: 'COMPLETED'
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

    const testIds = tests.map(t => t.id)

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
  async startLesson (lessonId, userId) {
    const [progress] = await LessonProgress.findOrCreate({
      where: { lessonId, userId },
      defaults: {
        status: 'IN_PROGRESS',
        startedAt: new Date()
      }
    })

    if (progress.status === 'NOT_STARTED') {
      progress.status = 'IN_PROGRESS'
      progress.startedAt = new Date()
      await progress.save()
    }

    return progress
  }

  async completeLesson (lessonId, userId) {
    const progress = await LessonProgress.findOne({
      where: { lessonId, userId }
    })

    if (!progress) {
      throw ApiError.badRequest('Lesson not started')
    }

    if (progress.status !== 'COMPLETED') {
      progress.status = 'COMPLETED'
      progress.completedAt = new Date()
      await progress.save()
    }

    return progress
  }
}

module.exports = new CourseProgressService()
