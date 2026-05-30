// controllers/sectionController.ts
import { Response, NextFunction } from 'express'
import sectionService from '../services/sectionService'
import { AuthRequest } from '../types/auth'

class SectionController {
  async create (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courseId = Number(req.params.courseId)

      const section = await sectionService.create(courseId, req.body, req.user!)

      res.status(201).json(section)
    } catch (e) {
      next(e)
    }
  }

  async update (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sectionId = Number(req.params.id)

      const section = await sectionService.update(
        sectionId,
        req.body,
        req.user!
      )

      res.json(section)
    } catch (e) {
      next(e)
    }
  }

  async remove (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sectionId = Number(req.params.id)

      await sectionService.remove(sectionId, req.user!)

      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }
}

export default new SectionController()
