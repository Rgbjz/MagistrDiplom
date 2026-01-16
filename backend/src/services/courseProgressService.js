const { Lesson, LessonProgress, Section } = require('../db/models')

class CourseProgressService {
  async getProgress (courseId, userId) {
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

    const total = lessons.length

    if (total === 0) {
      return {
        percent: 0,
        completed: 0,
        total: 0
      }
    }

    const lessonIds = lessons.map(l => l.id)

    const completed = await LessonProgress.count({
      where: {
        userId,
        lessonId: lessonIds,
        status: 'COMPLETED'
      }
    })

    return {
      total,
      completed,
      percent: Math.round((completed / total) * 100)
    }
  }
}

module.exports = new CourseProgressService()
