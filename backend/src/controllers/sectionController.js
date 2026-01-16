const sectionService = require('../services/sectionService')

class SectionController {
  async create (req, res, next) {
    try {
      const section = await sectionService.create(
        req.params.courseId,
        req.body,
        req.user
      )
      res.status(201).json(section)
    } catch (e) {
      next(e)
    }
  }

  async update (req, res, next) {
    try {
      const section = await sectionService.update(
        req.params.id,
        req.body,
        req.user
      )
      res.json(section)
    } catch (e) {
      next(e)
    }
  }

  async remove (req, res, next) {
    try {
      await sectionService.remove(req.params.id, req.user)
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new SectionController()
