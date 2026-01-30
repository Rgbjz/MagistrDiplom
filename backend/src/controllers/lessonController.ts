import { Response, NextFunction } from 'express'
import lessonService from '../services/lessonService'
import { AuthRequest } from '../types/auth'

class LessonController {
  async getLesson (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const lessonId = Number(req.params.id)

      const lesson = await lessonService.getLesson(lessonId, req.user!)
      res.json(lesson)
    } catch (e) {
      next(e)
    }
  }

  async completeLesson (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const lessonId = Number(req.params.id)

      await lessonService.completeLesson(lessonId, req.user!)
      res.json({ message: 'Lesson completed' })
    } catch (e) {
      next(e)
    }
  }

  async createLesson (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sectionId = Number(req.params.sectionId)

      const lesson = await lessonService.createLesson(
        sectionId,
        req.body,
        req.user!
      )

      res.json(lesson)
    } catch (e) {
      next(e)
    }
  }

  async updateLesson (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const lessonId = Number(req.params.id)

      const lesson = await lessonService.updateLesson(
        lessonId,
        req.body,
        req.user!
      )

      res.json(lesson)
    } catch (e) {
      next(e)
    }
  }

  async deleteLesson (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const lessonId = Number(req.params.id)

      await lessonService.deleteLesson(lessonId, req.user!)
      res.json({ message: 'Lesson deleted' })
    } catch (e) {
      next(e)
    }
  }
}

export default new LessonController()
