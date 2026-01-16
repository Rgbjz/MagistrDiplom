const { Enrollment, Course, User, UserProfile } = require('../db/models')

class EnrollmentService {
  async request (userId, courseId) {
    return Enrollment.create({
      userId,
      courseId,
      status: 'PENDING',
      enrolledAt: new Date()
    })
  }

  async approve (userId, courseId, teacherId) {
    const course = await Course.findByPk(courseId)
    if (course.teacherId !== teacherId) {
      throw new Error('Forbidden')
    }

    const enrollment = await Enrollment.findOne({
      where: { userId, courseId }
    })

    enrollment.status = 'ACTIVE'
    await enrollment.save()
    return enrollment
  }

  async reject (userId, courseId, teacherId) {
    const enrollment = await Enrollment.findOne({
      where: { userId, courseId }
    })

    enrollment.status = 'REJECTED'
    await enrollment.save()
    return enrollment
  }
  async getCourseEnrollments (courseId, status) {
    const where = { courseId }

    if (status) {
      where.status = status.toUpperCase()
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

module.exports = new EnrollmentService()
