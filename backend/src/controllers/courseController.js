const courseService = require('../services/courseService')
const enrollmentService = require('../services/enrollmentService')

class CourseController {
  async createCourse (req, res, next) {
    try {
      const data = { ...req.body }

      if (req.file) {
        data.imageUrl = `/public/courses/${req.file.filename}`
      }

      const course = await courseService.create(data, req.user)
      res.status(201).json(course)
    } catch (e) {
      next(e)
    }
  }

  async getCourse (req, res, next) {
    try {
      const courseId = req.params.id
      const user = req.user

      const course = await courseService.getCourseWithStructure(courseId, user)

      res.json(course)
    } catch (e) {
      next(e)
    }
  }

  async getCourses (req, res, next) {
    try {
      const courses = await courseService.getCoursesForUser(req.user)
      res.json(courses)
    } catch (e) {
      next(e)
    }
  }

  async updateCourse (req, res, next) {
    try {
      const course = await courseService.update(
        req.params.id,
        req.body,
        req.user
      )
      res.json(course)
    } catch (e) {
      next(e)
    }
  }

  async requestEnroll (req, res, next) {
    try {
      const enrollment = await enrollmentService.request(
        req.user.id,
        req.params.id
      )
      res.status(201).json(enrollment)
    } catch (e) {
      next(e)
    }
  }

  async approveEnroll (req, res, next) {
    try {
      const enrollment = await enrollmentService.approve(
        req.params.userId,
        req.params.id,
        req.user.id
      )
      res.json(enrollment)
    } catch (e) {
      next(e)
    }
  }

  async rejectEnroll (req, res, next) {
    try {
      const enrollment = await enrollmentService.reject(
        req.params.userId,
        req.params.id,
        req.user.id
      )
      res.json(enrollment)
    } catch (e) {
      next(e)
    }
  }

  async getEnrollments (req, res, next) {
    try {
      const { id: courseId } = req.params
      const { status } = req.query

      const enrollments = await enrollmentService.getCourseEnrollments(
        courseId,
        status,
        req.user
      )

      res.json(enrollments)
    } catch (e) {
      next(e)
    }
  }

  async deleteCourse (req, res, next) {
    try {
      await courseService.remove(req.params.id)
      res.status(204).send()
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new CourseController()
