import { Response, NextFunction } from 'express'

import courseService from '../services/courseService'
import enrollmentService from '../services/enrollmentService'
import { ENROLLMENT_STATUS } from '../constants'
import { AuthRequest } from '../types/auth'

class CourseController {
  async createCourse (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = {
        title: req.body.title,
        description: req.body.description,
        imageUrl: req.file ? `/public/courses/${req.file.filename}` : null
      }

      const course = await courseService.create(data, req.user!)
      res.status(201).json(course)
    } catch (e) {
      next(e)
    }
  }

  async getCourse (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.id)
      const user = req.user!

      const course = await courseService.getCourseWithStructure(courseId, user)

      res.json(course)
    } catch (e) {
      next(e)
    }
  }

  async getCourses (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courses = await courseService.getCoursesForUser(req.user!)
      res.json(courses)
    } catch (e) {
      next(e)
    }
  }

  async getStudentsProgress (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const courseId = Number(req.params.courseId)
      const teacherId = req.user!.id
      const role = req.user!.role

      const data = await courseService.getStudentsProgress({
        courseId,
        teacherId,
        role
      })

      res.json(data)
    } catch (e) {
      next(e)
    }
  }

  async updateCourse (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.id)

      const course = await courseService.update(courseId, req.body, req.user!)
      res.json(course)
    } catch (e) {
      next(e)
    }
  }

  async requestEnroll (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.id)

      const enrollment = await enrollmentService.request(req.user!.id, courseId)
      res.status(201).json(enrollment)
    } catch (e) {
      next(e)
    }
  }

  async approveEnroll (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.id)
      const userId = Number(req.params.userId)
      const teacherId = req.user!.id

      const enrollment = await enrollmentService.approve(
        userId,
        courseId,
        teacherId
      )
      res.json(enrollment)
    } catch (e) {
      next(e)
    }
  }

  async rejectEnroll (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.id)
      const userId = Number(req.params.userId)
      const teacherId = req.user!.id

      const enrollment = await enrollmentService.reject(
        userId,
        courseId,
        teacherId
      )
      res.json(enrollment)
    } catch (e) {
      next(e)
    }
  }

  async getEnrollments (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.id)

      const status = req.query.status
        ? (String(
            req.query.status
          ).toUpperCase() as keyof typeof ENROLLMENT_STATUS)
        : undefined

      const enrollments = await enrollmentService.getCourseEnrollments(
        courseId,
        status,
        req.user!
      )

      res.json(enrollments)
    } catch (e) {
      next(e)
    }
  }

  async deleteCourse (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.id)

      await courseService.remove(courseId)
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }
}

export default new CourseController()
