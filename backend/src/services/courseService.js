const {
  Course,
  Section,
  Lesson,
  LessonProgress,
  Enrollment,
  Test,
  TestResult,
  User,
  UserProfile
} = require('../db/models')
const { Op } = require('sequelize')
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

  async getStudentsProgress ({ courseId, teacherId, role }) {
    /* ===== COURSE ===== */
    const course = await Course.findByPk(courseId)

    if (!course) {
      throw new Error('Course not found')
    }

    // 🔐 доступ
    if (role !== 'ADMIN' && course.teacherId !== teacherId) {
      throw new Error('Access denied')
    }

    /* ===== STUDENTS ===== */
    const enrollments = await Enrollment.findAll({
      where: {
        courseId,
        status: 'ACTIVE'
      },
      include: [
        {
          model: User,
          as: 'student',
          attributes: ['id', 'email'],
          include: [
            {
              model: UserProfile,
              as: 'profile',
              attributes: ['firstName', 'lastName']
            }
          ]
        }
      ]
    })

    if (enrollments.length === 0) {
      return []
    }

    const studentIds = enrollments.map(e => e.userId)

    /* ===== LESSONS ===== */
    const totalLessons = await Lesson.count({
      include: [
        {
          model: Section,
          as: 'section',
          where: { courseId },
          attributes: []
        }
      ]
    })

    const lessonsProgress = await LessonProgress.findAll({
      where: {
        userId: studentIds,
        completedAt: {
          [Op.ne]: null
        }
      },
      attributes: ['userId']
    })

    const lessonsByUser = lessonsProgress.reduce((acc, lp) => {
      acc[lp.userId] = (acc[lp.userId] || 0) + 1
      return acc
    }, {})

    /* ===== TESTS ===== */
    const tests = await Test.findAll({
      attributes: ['id'],
      include: [
        {
          model: Lesson,
          as: 'lesson',
          attributes: [],
          include: [
            {
              model: Section,
              as: 'section',
              where: { courseId },
              attributes: []
            }
          ]
        }
      ]
    })

    const testIds = tests.map(t => t.id)

    let testResults = []

    if (testIds.length > 0) {
      testResults = await TestResult.findAll({
        where: {
          testId: testIds,
          userId: studentIds,
          finishedAt: { [Op.ne]: null }
        },
        order: [
          ['userId', 'ASC'],
          ['testId', 'ASC'],
          ['attempt', 'DESC']
        ]
      })
    }

    /* ===== LAST ATTEMPT PER TEST ===== */
    const lastTestResults = new Map()

    for (const r of testResults) {
      const key = `${r.userId}_${r.testId}`
      if (!lastTestResults.has(key)) {
        lastTestResults.set(key, r)
      }
    }

    const testsByUser = {}
    const scoreSumByUser = {}

    for (const r of lastTestResults.values()) {
      testsByUser[r.userId] = (testsByUser[r.userId] || 0) + 1
      scoreSumByUser[r.userId] = (scoreSumByUser[r.userId] || 0) + r.score
    }

    /* ===== BUILD RESPONSE ===== */
    return enrollments.map(e => {
      const user = e.student
      const profile = user.profile

      const completedTests = testsByUser[user.id] || 0
      const averageScore =
        completedTests > 0
          ? Math.round(scoreSumByUser[user.id] / completedTests)
          : null

      return {
        userId: user.id,
        name: profile
          ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
          : user.email,
        email: user.email,

        lessons: {
          completed: lessonsByUser[user.id] || 0,
          total: totalLessons
        },

        tests: {
          completed: completedTests,
          total: testIds.length
        },

        averageScore
      }
    })
  }

  // ===== DELETE COURSE =====
  async remove (courseId) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    await course.destroy()
  }
}

module.exports = new CourseService()
