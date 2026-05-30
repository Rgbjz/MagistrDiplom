import { Section, Lesson, Course } from '../db'
import ApiError from '../utils/ApiError'

interface AuthUser {
  id: number
  role: 'STUDENT' | 'TEACHER' | 'ADMIN'
}

export class SectionService {
  async create (courseId: number, data: { title?: string }, user: AuthUser) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    if (course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    const lastOrder = Number(
      await Section.max('order', { where: { courseId } })
    )

    const order = lastOrder + 1

    return Section.create({
      title: data.title ?? 'New section',
      courseId,
      order
    })
  }

  async update (
    id: number,
    data: Partial<{ title: string; order: number }>,
    user: AuthUser
  ) {
    const section = await Section.findByPk(id, {
      include: [
        {
          model: Course,
          as: 'course'
        }
      ]
    })

    if (!section) {
      throw ApiError.notFound('Section not found')
    }

    if (!section.course || section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    await section.update(data)
    return section
  }

  async remove (id: number, user: AuthUser) {
    const section = await Section.findByPk(id, {
      include: [
        {
          model: Course,
          as: 'course'
        }
      ]
    })

    if (!section) {
      throw ApiError.notFound('Section not found')
    }

    if (!section.course || section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    await section.destroy()
  }

  async createLesson (
    sectionId: number,
    data: { title?: string; content?: string },
    user: AuthUser
  ) {
    const section = await Section.findByPk(sectionId, {
      include: [
        {
          model: Course,
          as: 'course'
        }
      ]
    })

    if (!section) throw ApiError.notFound('Section not found')

    if (!section.course || section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    return Lesson.create({
      title: data.title ?? 'New lesson',
      content: data.content ?? '',
      sectionId
    })
  }
}

export default new SectionService()
