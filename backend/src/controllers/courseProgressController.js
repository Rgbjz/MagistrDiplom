const courseProgressService = require('../services/courseProgressService')

class CourseProgressController {
  async getMyProgress (req, res, next) {
    try {
      const { courseId } = req.params
      const userId = req.user.id

      const progress = await courseProgressService.getProgress(courseId, userId)

      res.json(progress)
    } catch (e) {
      next(e)
    }
  }

  async getUserProgress (req, res, next) {
    try {
      const { courseId, userId } = req.params

      const progress = await courseProgressService.getProgress(courseId, userId)

      res.json(progress)
    } catch (e) {
      next(e)
    }
  }

  async startLesson (req, res, next) {
    try {
      const lessonId = Number(req.params.id)
      const userId = req.user.id

      const progress = await courseProgressService.startLesson(lessonId, userId)

      res.json(progress)
    } catch (e) {
      next(e)
    }
  }

  async completeLesson (req, res, next) {
    try {
      const { lessonId } = req.params
      const userId = req.user.id

      const progress = await courseProgressService.completeLesson(
        Number(lessonId),
        userId
      )

      return res.json(progress)
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new CourseProgressController()
