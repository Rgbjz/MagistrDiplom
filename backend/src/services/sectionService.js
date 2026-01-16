const { Section, Lesson, Course } = require('../db/models')
const ApiError = require('../utils/ApiError')

class SectionService {
  async create (courseId, data, user) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    if (course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    // 🔥 находим последний order
    const lastOrder = await Section.max('order', {
      where: { courseId }
    })

    return Section.create({
      title: data.title || 'New section',
      courseId,
      order: (lastOrder ?? 0) + 1
    })
  }

  async update (id, data, user) {
    const section = await Section.findByPk(id, {
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

    await section.update(data)
    return section
  }

  async remove (id, user) {
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

    if (section.course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    await section.destroy()
  }

  async createLesson (sectionId, data, user) {
    const section = await Section.findByPk(sectionId, {
      include: Course
    })
    if (!section) throw ApiError.notFound('Section not found')

    if (section.Course.teacherId !== user.id) {
      throw ApiError.forbidden('Not your course')
    }

    return Lesson.create({
      title: data.title || 'New lesson',
      content: data.content || '',
      sectionId
    })
  }
}

module.exports = new SectionService()
