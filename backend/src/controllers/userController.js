const userService = require('../services/userService')

class UserController {
  async getMe (req, res, next) {
    try {
      const user = await userService.getMe(req.user.id)
      res.json(user)
    } catch (e) {
      next(e)
    }
  }

  async updateProfile (req, res, next) {
    try {
      const data = { ...req.body }

      if (req.file) {
        data.avatarUrl = `/public/avatars/${req.file.filename}`
      }

      const profile = await userService.updateProfile(req.user.id, data)
      res.json(profile)
    } catch (e) {
      next(e)
    }
  }

  async getMyCourses (req, res, next) {
    try {
      const courses = await userService.getMyCourses(req.user.id)
      res.json(courses)
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new UserController()
