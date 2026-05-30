import {
  Lesson,
  Section,
  Course,
  Enrollment,
  LessonProgress,
  Test
} from '../db'

import ApiError from '../utils/ApiError'
import {
  USER_ROLES,
  ENROLLMENT_STATUS,
  LESSON_PROGRESS_STATUS,
  UserRole
} from '../constants'

interface CreateLessonInput {
  title?: string
  content?: string
}

interface UpdateLessonInput {
  title?: string
  content?: string
  videoUrl?: string
}

interface AuthUser {
  id: number
  role: UserRole
}

class LessonService {
  async getLesson (lessonId: number, user: AuthUser) {
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

    if (!lesson || !lesson.section || !lesson.section.course) {
      throw ApiError.notFound('Lesson not found')
    }

    const courseId = lesson.section.course.id

    if (user.role === USER_ROLES.STUDENT) {
      const enrollment = await Enrollment.findOne({
        where: {
          userId: user.id,
          courseId,
          status: ENROLLMENT_STATUS.ACTIVE
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
        status: LESSON_PROGRESS_STATUS.IN_PROGRESS,
        startedAt: new Date()
      })
    }

    return { lesson, progress }
  }

  async completeLesson (lessonId: number, user: AuthUser) {
    const progress = await LessonProgress.findOne({
      where: {
        userId: user.id,
        lessonId
      }
    })

    if (!progress) {
      throw ApiError.badRequest('Lesson not started')
    }

    if (progress.status === LESSON_PROGRESS_STATUS.COMPLETED) return

    await progress.update({
      status: LESSON_PROGRESS_STATUS.COMPLETED,
      completedAt: new Date()
    })
  }

  async createLesson (
    sectionId: number,
    data: CreateLessonInput,
    user: AuthUser
  ) {
    const section = await Section.findByPk(sectionId, {
      include: {
        model: Course,
        as: 'course'
      }
    })

    if (!section || !section.course) {
      throw ApiError.notFound('Section not found')
    }

    if (section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    const maxOrder = (await Lesson.max('order', {
      where: { sectionId }
    })) as number | null

    const order = (maxOrder ?? 0) + 1

    return Lesson.create({
      title: data.title ?? 'New lesson',
      content: data.content ?? '',
      sectionId,
      order
    })
  }

  async updateLesson (
    lessonId: number,
    data: UpdateLessonInput,
    user: AuthUser
  ) {
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
        }
      ]
    })

    if (!lesson || !lesson.section || !lesson.section.course) {
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

  async deleteLesson (lessonId: number, user: AuthUser) {
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
        }
      ]
    })

    if (!lesson || !lesson.section || !lesson.section.course) {
      throw ApiError.notFound('Lesson not found')
    }

    if (lesson.section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    await lesson.destroy()
  }
}

export default new LessonService()
