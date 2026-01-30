import { Op } from 'sequelize'
import {
  Course,
  Section,
  Lesson,
  LessonProgress,
  Enrollment,
  Test,
  TestResult,
  User,
  UserProfile
} from '../db'
import ApiError from '../utils/ApiError'
import courseProgressService from './courseProgressService'
import { USER_ROLES, ENROLLMENT_STATUS, UserRole } from '../constants'
import { AuthUser } from '../types/auth'

interface CreateCourseInput {
  title: string
  description?: string
  imageUrl?: string | null
}

interface UpdateCourseInput {
  title?: string
  description?: string
  imageUrl?: string | null
}

export class CourseService {
  async create (data: CreateCourseInput, user: AuthUser) {
    if (user.role !== USER_ROLES.TEACHER) {
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

  async getCourseWithStructure (courseId: number, user: AuthUser) {
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

    let enrollment: any = null
    let progress: any = null

    // ===== STUDENT ACCESS =====
    if (user.role === USER_ROLES.STUDENT) {
      enrollment = await Enrollment.findOne({
        where: {
          userId: user.id,
          courseId,
          status: ENROLLMENT_STATUS.ACTIVE
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

  async getCoursesForUser (user: AuthUser) {
    const courses = await Course.findAll({
      attributes: ['id', 'title', 'description', 'imageUrl', 'teacherId'],
      order: [['createdAt', 'DESC']]
    })

    if (user.role !== USER_ROLES.STUDENT) {
      return courses
    }

    const enrollments = await Enrollment.findAll({
      where: { userId: user.id }
    })

    // Map: courseId -> status
    const map: Record<number, string> = Object.fromEntries(
      enrollments.map((e: any) => [e.courseId, e.status])
    )

    return courses.map((course: any) => ({
      ...course.toJSON(),
      enrollmentStatus: map[course.id] ?? null
    }))
  }

  async update (courseId: number, data: UpdateCourseInput, user?: AuthUser) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    // если хочешь контроль прав — можно включить:
    // if (user && user.role !== USER_ROLES.ADMIN && course.teacherId !== user.id) {
    //   throw ApiError.forbidden('Not your course')
    // }

    await course.update({
      title: data.title ?? course.title,
      description: data.description ?? course.description,
      imageUrl: data.imageUrl ?? course.imageUrl
    })

    return course
  }

  async getStudentsProgress ({
    courseId,
    teacherId,
    role
  }: {
    courseId: number
    teacherId: number
    role: UserRole
  }) {
    /* ===== COURSE ===== */
    const course = await Course.findByPk(courseId)

    if (!course) {
      throw ApiError.notFound('Course not found')
    }

    // 🔐 доступ
    if (role !== USER_ROLES.ADMIN && course.teacherId !== teacherId) {
      throw ApiError.forbidden('Access denied')
    }

    /* ===== STUDENTS ===== */
    const enrollments = await Enrollment.findAll({
      where: {
        courseId,
        status: ENROLLMENT_STATUS.ACTIVE
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

    const studentIds: number[] = enrollments.map((e: any) => e.userId)

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

    const lessonsByUser: Record<number, number> = lessonsProgress.reduce(
      (acc: Record<number, number>, lp: any) => {
        acc[lp.userId] = (acc[lp.userId] || 0) + 1
        return acc
      },
      {}
    )

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

    const testIds: number[] = tests.map((t: any) => t.id)

    let testResults: any[] = []

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
    const lastTestResults = new Map<string, any>()

    for (const r of testResults) {
      const key = `${r.userId}_${r.testId}`
      if (!lastTestResults.has(key)) {
        lastTestResults.set(key, r)
      }
    }

    const testsByUser: Record<number, number> = {}
    const scoreSumByUser: Record<number, number> = {}

    for (const r of lastTestResults.values()) {
      testsByUser[r.userId] = (testsByUser[r.userId] || 0) + 1
      scoreSumByUser[r.userId] = (scoreSumByUser[r.userId] || 0) + r.score
    }

    /* ===== BUILD RESPONSE ===== */
    return enrollments.map((e: any) => {
      const user = e.student
      const profile = user?.profile

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

  async remove (courseId: number) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    await course.destroy()
  }
}

export default new CourseService()
