import { Request, Response, NextFunction } from 'express'
import userService from '../services/userService'

interface AuthRequest extends Request {
  user: {
    id: number
    role?: string
  }
  file?: Express.Multer.File
}

class UserController {
  async getMe (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = await userService.getMe(req.user.id)
      res.json(user)
    } catch (e) {
      next(e)
    }
  }

  async updateProfile (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body } as Record<string, any>

      if (req.file) {
        data.avatarUrl = `/public/avatars/${req.file.filename}`
      }

      const profile = await userService.updateProfile(req.user.id, data)
      res.json(profile)
    } catch (e) {
      next(e)
    }
  }

  async getMyCourses (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const courses = await userService.getMyCourses(req.user.id)
      res.json(courses)
    } catch (e) {
      next(e)
    }
  }
}

export default new UserController()
