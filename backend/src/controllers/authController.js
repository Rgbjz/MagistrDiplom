const authService = require('../services/authService')

class AuthController {
  async register (req, res, next) {
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

  async login (req, res, next) {
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

  async refresh (req, res, next) {
    try {
      const { accessToken, refreshToken } = await authService.refresh(
        req.cookies.refreshToken
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

  async logout (req, res, next) {
    try {
      await authService.logout(req.cookies.refreshToken)
      res.clearCookie('refreshToken')
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }

  // ✅ НОВОЕ
  async me (req, res, next) {
    try {
      // authMiddleware уже положил req.user
      res.json({
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      })
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new AuthController()
