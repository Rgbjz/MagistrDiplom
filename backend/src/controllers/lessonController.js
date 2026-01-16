const lessonService = require('../services/lessonService')

class LessonController {
  async getLesson (req, res, next) {
    try {
      const lesson = await lessonService.getLesson(req.params.id, req.user)
      res.json(lesson)
    } catch (e) {
      next(e)
    }
  }

  async completeLesson (req, res, next) {
    try {
      await lessonService.completeLesson(req.params.id, req.user)
      res.json({ message: 'Lesson completed' })
    } catch (e) {
      next(e)
    }
  }

  async createLesson (req, res, next) {
    try {
      const { sectionId } = req.params
      const lesson = await lessonService.createLesson(
        sectionId,
        req.body,
        req.user
      )
      res.json(lesson)
    } catch (e) {
      next(e)
    }
  }

  // ===== UPDATE =====
  async updateLesson (req, res, next) {
    try {
      const lesson = await lessonService.updateLesson(
        req.params.id,
        req.body,
        req.user
      )
      res.json(lesson)
    } catch (e) {
      next(e)
    }
  }

  // ===== DELETE =====
  async deleteLesson (req, res, next) {
    try {
      await lessonService.deleteLesson(req.params.id, req.user)
      res.json({ message: 'Lesson deleted' })
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new LessonController()
