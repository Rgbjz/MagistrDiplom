const { Course, Section, Lesson, Enrollment, Test } = require('../db/models')
const ApiError = require('../utils/ApiError')
const courseProgressService = require('./courseProgressService')

class CourseService {
  async create (data, user) {
    if (user.role !== 'TEACHER') {
      throw ApiError.forbidden('Only teachers can create courses')
    }

    const course = await Course.create({
      title: data.title,
      description: data.description || '',
      imageUrl: data.imageUrl || null,
      teacherId: user.id
    })

    return course
  }
  async getCourseWithStructure (courseId, user) {
    const course = await Course.findByPk(courseId, {
      include: [
        {
          model: Section,
          as: 'sections',
          separate: true,
          order: [['order', 'ASC']],
          include: [
            {
              model: Lesson,
              as: 'lessons',
              order: [['order', 'ASC']],
              include: [{ model: Test, as: 'test' }]
            }
          ]
        }
      ]
    })

    if (!course) {
      throw ApiError.notFound('Course not found')
    }

    let enrollment = null
    let progress = null

    // ===== STUDENT ACCESS =====
    if (user.role === 'STUDENT') {
      enrollment = await Enrollment.findOne({
        where: {
          userId: user.id,
          courseId,
          status: 'ACTIVE'
        }
      })

      if (!enrollment) {
        throw ApiError.forbidden('You are not enrolled in this course')
      }

      progress = await courseProgressService.getProgress(courseId, user.id)
    }

    return {
      ...course.toJSON(),
      enrollmentStatus: enrollment?.status ?? null,
      progress
    }
  }
  async getCoursesForUser (user) {
    const courses = await Course.findAll({
      attributes: ['id', 'title', 'description', 'imageUrl', 'teacherId'],
      order: [['createdAt', 'DESC']]
    })

    if (user.role !== 'STUDENT') {
      return courses
    }

    const enrollments = await Enrollment.findAll({
      where: { userId: user.id }
    })

    const map = Object.fromEntries(enrollments.map(e => [e.courseId, e.status]))

    return courses.map(course => ({
      ...course.toJSON(),
      enrollmentStatus: map[course.id] ?? null
    }))
  }
  async update (courseId, data) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    await course.update({
      title: data.title ?? course.title,
      description: data.description ?? course.description,
      imageUrl: data.imageUrl ?? course.imageUrl
    })

    return course
  }

  // ===== DELETE COURSE =====
  async remove (courseId) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    await course.destroy()
  }
}

module.exports = new CourseService()
