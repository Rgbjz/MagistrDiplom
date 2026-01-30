import { Response, NextFunction } from 'express'
import testService from '../services/testService'
import { AuthRequest } from '../types/auth'

class TestController {
  async getTest (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const test = await testService.getById(Number(req.params.id))
      res.json(test)
    } catch (e) {
      next(e)
    }
  }

  async createTest (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const test = await testService.createTest(
        Number(req.params.lessonId),
        req.body
      )
      res.status(201).json(test)
    } catch (e) {
      next(e)
    }
  }

  async updateTest (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const test = await testService.update(Number(req.params.id), req.body)
      res.json(test)
    } catch (e) {
      next(e)
    }
  }

  // ===== QUESTIONS =====
  async createQuestion (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const question = await testService.createQuestion(
        Number(req.params.id),
        req.body
      )
      res.status(201).json(question)
    } catch (e) {
      next(e)
    }
  }

  async updateQuestion (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const question = await testService.updateQuestion(
        Number(req.params.questionId),
        req.body
      )
      res.json(question)
    } catch (e) {
      next(e)
    }
  }

  async deleteQuestion (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await testService.deleteQuestion(Number(req.params.questionId))
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }

  // ===== ANSWERS =====
  async createAnswer (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const answer = await testService.createAnswer(
        Number(req.params.questionId),
        req.body
      )
      res.status(201).json(answer)
    } catch (e) {
      next(e)
    }
  }

  async updateAnswer (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const answer = await testService.updateAnswer(
        Number(req.params.answerId),
        req.body
      )
      res.json(answer)
    } catch (e) {
      next(e)
    }
  }

  async deleteAnswer (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await testService.deleteAnswer(Number(req.params.answerId))
      res.sendStatus(204)
    } catch (e) {
      next(e)
    }
  }

  // ===== RESULTS =====
  async getMyTestResult (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id
      const testId = Number(req.params.testId)

      const result = await testService.getMyTestResult(userId, testId)

      res.json(result)
    } catch (e) {
      next(e)
    }
  }

  async getTestResults (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const testId = Number(req.params.testId)
      const teacherId = req.user!.id

      const results = await testService.getTestResults(testId)

      res.json(results)
    } catch (e) {
      next(e)
    }
  }

  // ===== PASS TEST =====
  async startTest (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const testId = Number(req.params.id)
      const userId = req.user!.id

      const result = await testService.startTest(testId, userId)
      res.json(result)
    } catch (e) {
      next(e)
    }
  }

  async submitTest (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id
      const testResultId = Number(req.params.id)
      const { answers } = req.body as { answers: Record<number, number[]> }

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

export default new TestController()
