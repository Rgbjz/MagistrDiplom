import {
  Test,
  Question,
  Answer,
  Lesson,
  TestResult,
  UserAnswer,
  User,
  UserProfile
} from '../db'

import { Op } from 'sequelize'
import ApiError from '../utils/ApiError'

interface CreateTestInput {
  title?: string
  timeLimit?: number
  passingScore?: number
}

interface SubmitTestInput {
  testResultId: number
  userId: number
  answers: Record<number, number[]>
}

class TestService {
  async getById (id: number) {
    const test = await Test.findByPk(id, {
      include: [
        {
          model: Question,
          as: 'questions',
          include: [
            {
              model: Answer,
              as: 'answers'
            }
          ]
        }
      ],
      order: [
        ['questions', 'id', 'ASC'],
        ['questions', 'answers', 'id', 'ASC']
      ]
    })

    if (!test) throw ApiError.notFound('Test not found')
    return test
  }

  async createTest (lessonId: number, data: CreateTestInput = {}) {
    const lesson = await Lesson.findByPk(lessonId, {
      include: ['test']
    })

    if (!lesson) {
      throw ApiError.notFound('Lesson not found')
    }

    if ((lesson as any).test) {
      throw ApiError.badRequest('Test already exists for this lesson')
    }

    return Test.create({
      lessonId,
      title: data.title ?? 'Test',
      timeLimit: data.timeLimit ?? 10,
      passingScore: data.passingScore ?? 60
    })
  }

  async update (id: number, data: Partial<CreateTestInput>) {
    const test = await Test.findByPk(id)
    if (!test) throw ApiError.notFound('Test not found')

    await test.update(data)
    return test
  }

  // ================= QUESTIONS =================

  async createQuestion (testId: number, data: any) {
    return Question.create({
      testId,
      text: data.text,
      type: data.type ?? 'SINGLE',
      difficulty: data.difficulty ?? 1
    })
  }

  async updateQuestion (id: number, data: any) {
    const q = await Question.findByPk(id)
    if (!q) throw ApiError.notFound('Question not found')

    await q.update(data)
    return q
  }

  async deleteQuestion (id: number) {
    const q = await Question.findByPk(id)
    if (!q) throw ApiError.notFound('Question not found')

    await q.destroy()
  }

  // ================= ANSWERS =================

  async createAnswer (questionId: number, data: any) {
    return Answer.create({
      questionId,
      text: data.text,
      isCorrect: !!data.isCorrect
    })
  }

  async updateAnswer (id: number, data: any) {
    const a = await Answer.findByPk(id)
    if (!a) throw ApiError.notFound('Answer not found')

    await a.update(data)
    return a
  }

  async deleteAnswer (id: number) {
    const a = await Answer.findByPk(id)
    if (!a) throw ApiError.notFound('Answer not found')

    await a.destroy()
  }

  // ================= RESULTS =================

  async getTestResults (testId: number) {
    const test = await Test.findByPk(testId)
    if (!test) throw ApiError.notFound('Test not found')

    const results = await TestResult.findAll({
      where: {
        testId,
        finishedAt: { [Op.ne]: null }
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email'],
          include: [
            {
              model: UserProfile,
              as: 'profile',
              attributes: ['firstName', 'lastName']
            }
          ]
        }
      ],
      order: [
        ['userId', 'ASC'],
        ['attempt', 'DESC']
      ]
    })

    const lastResults = new Map<number, any>()

    for (const r of results) {
      if (!lastResults.has(r.userId)) {
        lastResults.set(r.userId, r)
      }
    }

    return Array.from(lastResults.values()).map(r => ({
      userId: r.user.id,
      userName: r.user.profile
        ? `${r.user.profile.firstName ?? ''} ${
            r.user.profile.lastName ?? ''
          }`.trim()
        : 'Без имени',
      email: r.user.email,
      attempt: r.attempt,
      score: r.score,
      passed: r.passed,
      finishedAt: r.finishedAt
    }))
  }

  async getMyTestResult (userId: number, testId: number) {
    const result = await TestResult.findOne({
      where: {
        userId,
        testId,
        finishedAt: { [Op.ne]: null }
      },
      order: [['attempt', 'DESC']],
      include: [
        {
          model: UserAnswer,
          as: 'answers'
        }
      ]
    })

    if (!result) return null

    const questions = await Question.findAll({
      where: { testId },
      include: [{ model: Answer, as: 'answers' }]
    })

    const details = questions.map(q => {
      const correctAnswerIds = q.answers.filter(a => a.isCorrect).map(a => a.id)

      const userAnswerIds = result.answers
        .filter(a => a.questionId === q.id)
        .map(a => a.answerId)

      return {
        questionId: q.id,
        correctAnswerIds,
        userAnswerIds
      }
    })

    return {
      id: result.id,
      score: result.score,
      passed: result.passed,
      finishedAt: result.finishedAt,
      details
    }
  }

  async startTest (testId: number, userId: number) {
    const test = await Test.findByPk(testId, {
      include: [
        {
          model: Question,
          as: 'questions',
          include: [
            {
              model: Answer,
              as: 'answers',
              attributes: ['id', 'text']
            }
          ]
        }
      ],
      order: [
        ['questions', 'id', 'ASC'],
        ['questions', 'answers', 'id', 'ASC']
      ]
    })

    if (!test) throw ApiError.notFound('Test not found')

    const attempts = await TestResult.count({
      where: { testId, userId }
    })

    const testResult = await TestResult.create({
      testId,
      userId,
      attempt: attempts + 1,
      startedAt: new Date()
    })

    return {
      testResultId: testResult.id,
      attempt: testResult.attempt,
      timeLimit: test.timeLimit,
      startedAt: testResult.startedAt,
      questions: test.questions
    }
  }

  async submitTest ({ testResultId, userId, answers }: SubmitTestInput) {
    const testResult = await TestResult.findByPk(testResultId, {
      include: [
        {
          model: Test,
          as: 'test',
          include: [
            {
              model: Question,
              as: 'questions',
              include: [
                {
                  model: Answer,
                  as: 'answers'
                }
              ]
            }
          ]
        }
      ]
    })

    if (!testResult) throw ApiError.notFound('Test result not found')
    if (testResult.userId !== userId) throw ApiError.forbidden('Access denied')
    if (testResult.finishedAt)
      throw ApiError.badRequest('Test already submitted')

    const deadline = new Date(testResult.startedAt)
    deadline.setMinutes(deadline.getMinutes() + testResult.test.timeLimit)

    const finishedAt = new Date()
    if (finishedAt > deadline) finishedAt.setTime(deadline.getTime())

    let correct = 0

    for (const question of testResult.test.questions) {
      const correctIds = question.answers
        .filter(a => a.isCorrect)
        .map(a => a.id)
        .sort()

      const userIds = (answers[question.id] ?? []).slice().sort()

      const isCorrect =
        correctIds.length === userIds.length &&
        correctIds.every((id, i) => id === userIds[i])

      for (const answerId of userIds) {
        await UserAnswer.create({
          userId,
          questionId: question.id,
          answerId,
          testResultId
        })
      }

      if (isCorrect) correct++
    }

    const score = Math.round((correct / testResult.test.questions.length) * 100)
    const passed = score >= testResult.test.passingScore

    await testResult.update({ finishedAt, score, passed })

    return {
      score,
      passed,
      correct,
      total: testResult.test.questions.length,
      finishedAt
    }
  }
}

export default new TestService()
