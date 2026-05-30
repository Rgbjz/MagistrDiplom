import { Enrollment, Course, User, UserProfile } from '../db'

import ApiError from '../utils/ApiError'
import { ENROLLMENT_STATUS } from '../constants'
import { AuthUser } from '../types/auth'

class EnrollmentService {
  async request (userId: number, courseId: number) {
    return Enrollment.create({
      userId,
      courseId,
      status: ENROLLMENT_STATUS.PENDING,
      enrolledAt: new Date()
    })
  }

  async approve (userId: number, courseId: number, teacherId: number) {
    const course = await Course.findByPk(courseId)

    if (!course) {
      throw ApiError.notFound('Course not found')
    }

    if (course.teacherId !== teacherId) {
      throw ApiError.forbidden('Forbidden')
    }

    const enrollment = await Enrollment.findOne({
      where: { userId, courseId }
    })

    if (!enrollment) {
      throw ApiError.notFound('Enrollment not found')
    }

    await enrollment.update({
      status: ENROLLMENT_STATUS.ACTIVE
    })

    return enrollment
  }

  async reject (userId: number, courseId: number, teacherId: number) {
    const course = await Course.findByPk(courseId)

    if (!course) {
      throw ApiError.notFound('Course not found')
    }

    if (course.teacherId !== teacherId) {
      throw ApiError.forbidden('Forbidden')
    }

    const enrollment = await Enrollment.findOne({
      where: { userId, courseId }
    })

    if (!enrollment) {
      throw ApiError.notFound('Enrollment not found')
    }

    await enrollment.update({
      status: ENROLLMENT_STATUS.REJECTED
    })

    return enrollment
  }

  async getCourseEnrollments (
    courseId: number,
    status: keyof typeof ENROLLMENT_STATUS | undefined,
    user: AuthUser
  ) {
    const course = await Course.findByPk(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    const where: { courseId: number; status?: string } = { courseId }

    if (status) {
      where.status = ENROLLMENT_STATUS[status]
    }

    return Enrollment.findAll({
      where,
      include: [
        {
          model: User,
          as: 'student',
          attributes: ['id', 'email'],
          include: [
            {
              model: UserProfile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'avatarUrl']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    })
  }
}

export default new EnrollmentService()
