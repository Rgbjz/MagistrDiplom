const {
  Lesson,
  Section,
  Course,
  Enrollment,
  LessonProgress,
  Test
} = require('../db/models')
const ApiError = require('../utils/ApiError')

class LessonService {
  async getLesson (lessonId, user) {
    const lesson = await Lesson.findByPk(lessonId, {
      include: [
        {
          model: Section,
          as: 'section',
          include: [
            {
              model: Course,
              as: 'course'
            }
          ]
        },
        {
          model: Test,
          as: 'test'
        }
      ]
    })

    if (!lesson) {
      throw ApiError.notFound('Lesson not found')
    }

    const courseId = lesson.section.course.id

    if (user.role === 'STUDENT') {
      const enrollment = await Enrollment.findOne({
        where: {
          userId: user.id,
          courseId,
          status: 'APPROVED'
        }
      })

      if (!enrollment) {
        throw ApiError.forbidden('You are not enrolled in this course')
      }
    }

    let progress = await LessonProgress.findOne({
      where: {
        userId: user.id,
        lessonId
      }
    })

    if (!progress) {
      progress = await LessonProgress.create({
        userId: user.id,
        lessonId,
        status: 'STARTED',
        startedAt: new Date()
      })
    }

    return { lesson, progress }
  }

  async completeLesson (lessonId, user) {
    const progress = await LessonProgress.findOne({
      where: {
        userId: user.id,
        lessonId
      }
    })

    if (!progress) {
      throw ApiError.badRequest('Lesson not started')
    }

    if (progress.status === 'COMPLETED') return

    await progress.update({
      status: 'COMPLETED',
      completedAt: new Date()
    })
  }

  async createLesson (sectionId, data, user) {
    const section = await Section.findByPk(sectionId, {
      include: {
        model: Course,
        as: 'course'
      }
    })

    if (!section) {
      throw ApiError.notFound('Section not found')
    }

    if (section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    const maxOrder = await Lesson.max('order', {
      where: { sectionId }
    })

    const order = maxOrder ? maxOrder + 1 : 1

    return Lesson.create({
      title: data.title || 'New lesson',
      content: data.content || '',
      sectionId,
      order
    })
  }

  // ===== UPDATE =====
  async updateLesson (lessonId, data, user) {
    const lesson = await Lesson.findByPk(lessonId, {
      include: {
        model: Section,
        as: 'section',
        include: {
          model: Course,
          as: 'course'
        }
      }
    })

    if (!lesson) {
      throw ApiError.notFound('Lesson not found')
    }

    if (lesson.section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    await lesson.update({
      title: data.title,
      content: data.content,
      videoUrl: data.videoUrl
    })

    return lesson
  }

  // ===== DELETE =====
  async deleteLesson (lessonId, user) {
    const lesson = await Lesson.findByPk(lessonId, {
      include: {
        model: Section,
        as: 'section',
        include: {
          model: Course,
          as: 'course'
        }
      }
    })

    if (!lesson) {
      throw ApiError.notFound('Lesson not found')
    }

    if (lesson.section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    await lesson.destroy()
  }
}

module.exports = new LessonService()
