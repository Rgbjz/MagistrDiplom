import { Response, NextFunction } from 'express'
import courseProgressService from '../services/courseProgressService'
import { AuthRequest } from '../types/auth'

class CourseProgressController {
  async getMyProgress (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.courseId)
      const userId = req.user!.id

      const progress = await courseProgressService.getProgress(courseId, userId)

      res.json(progress)
    } catch (e) {
      next(e)
    }
  }

  async getUserProgress (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.courseId)
      const userId = Number(req.params.userId)

      const progress = await courseProgressService.getProgress(courseId, userId)

      res.json(progress)
    } catch (e) {
      next(e)
    }
  }

  async startLesson (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const lessonId = Number(req.params.lessonId)
      const userId = req.user!.id

      const progress = await courseProgressService.startLesson(lessonId, userId)

      res.json(progress)
    } catch (e) {
      next(e)
    }
  }

  async completeLesson (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const lessonId = Number(req.params.lessonId)
      const userId = req.user!.id

      const progress = await courseProgressService.completeLesson(
        lessonId,
        userId
      )

      res.json(progress)
    } catch (e) {
      next(e)
    }
  }
}

export default new CourseProgressController()
