const testService = require('../services/testService')

class TestController {
  async getTest (req, res, next) {
    try {
      const test = await testService.getById(req.params.id)
      res.json(test)
    } catch (e) {
      next(e)
    }
  }

  async updateTest (req, res, next) {
    try {
      const test = await testService.update(req.params.id, req.body)
      res.json(test)
    } catch (e) {
      next(e)
    }
  }

  // ===== QUESTIONS =====
  async createQuestion (req, res, next) {
    try {
      const question = await testService.createQuestion(req.params.id, req.body)
      res.status(201).json(question)
    } catch (e) {
      next(e)
    }
  }

  async updateQuestion (req, res, next) {
    try {
      const question = await testService.updateQuestion(
        req.params.questionId,
        req.body
      )
      res.json(question)
    } catch (e) {
      next(e)
    }
  }

  async deleteQuestion (req, res, next) {
    try {
      await testService.deleteQuestion(req.params.questionId)
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }

  // ===== ANSWERS =====
  async createAnswer (req, res, next) {
    try {
      const answer = await testService.createAnswer(
        req.params.questionId,
        req.body
      )
      res.status(201).json(answer)
    } catch (e) {
      next(e)
    }
  }

  async updateAnswer (req, res, next) {
    try {
      const answer = await testService.updateAnswer(
        req.params.answerId,
        req.body
      )
      res.json(answer)
    } catch (e) {
      next(e)
    }
  }

  async deleteAnswer (req, res, next) {
    try {
      await testService.deleteAnswer(req.params.answerId)
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new TestController()
