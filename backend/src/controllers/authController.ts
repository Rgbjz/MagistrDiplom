import { Response, NextFunction } from 'express'

import authService from '../services/authService'
import { AuthRequest } from '../types/auth'

class AuthController {
  async register (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { refreshToken, ...data } = await authService.register(req.body)

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000
      })

      res.status(201).json(data)
    } catch (e) {
      next(e)
    }
  }

  async login (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { refreshToken, ...data } = await authService.login(req.body)

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000
      })

      res.json(data)
    } catch (e) {
      next(e)
    }
  }

  async refresh (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const refreshTokenFromCookie = req.cookies?.refreshToken as
        | string
        | undefined

      const { accessToken, refreshToken } = await authService.refresh(
        refreshTokenFromCookie
      )

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000
      })

      res.json({ accessToken })
    } catch (e) {
      next(e)
    }
  }

  async logout (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const refreshTokenFromCookie = req.cookies?.refreshToken as
        | string
        | undefined

      await authService.logout(refreshTokenFromCookie)

      res.clearCookie('refreshToken')
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }

  // ✅ NEW
  async me (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // authMiddleware уже положил req.user
      res.json({
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role
      })
    } catch (e) {
      next(e)
    }
  }
}

export default new AuthController()
