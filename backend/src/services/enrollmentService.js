const { Enrollment, Course } = require('../db/models')

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
}

module.exports = new EnrollmentService()
