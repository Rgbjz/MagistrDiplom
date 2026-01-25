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

  async createTest (req, res, next) {
    try {
      const test = await testService.createTest(req.params.lessonId, req.body)
      res.status(201).json(test)
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

  async getMyTestResult (req, res, next) {
    try {
      const userId = req.user.id
      const { testId } = req.params

      const result = await testService.getMyTestResult({
        userId,
        testId
      })

      res.json(result)
    } catch (e) {
      next(e)
    }
  }

  // ===== PASS TEST =====
  async startTest (req, res, next) {
    try {
      const testId = Number(req.params.id)
      const userId = req.user.id

      const result = await testService.startTest(testId, userId)

      res.json(result)
    } catch (e) {
      next(e)
    }
  }

  async submitTest (req, res, next) {
    try {
      const userId = req.user.id
      const testResultId = Number(req.params.id)
      const { answers } = req.body

      const result = await testService.submitTest({
        testResultId,
        userId,
        answers
      })

      res.json(result)
    } catch (e) {
      next(e)
    }
  }
}

module.exports = new TestController()
