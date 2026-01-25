const {
  Test,
  Question,
  Answer,
  Lesson,
  TestResult,
  UserAnswer,
  User,
  UserProfile
} = require('../db/models')
const { Op } = require('sequelize')
const ApiError = require('../utils/ApiError')

class TestService {
  async getById (id) {
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

  async createTest (lessonId, data = {}) {
    const lesson = await Lesson.findByPk(lessonId, {
      include: ['test']
    })

    if (!lesson) {
      throw ApiError.notFound('Lesson not found')
    }

    if (lesson.test) {
      throw ApiError.badRequest('Test already exists for this lesson')
    }

    const test = await Test.create({
      lessonId,
      title: data.title || 'Test',
      timeLimit: data.timeLimit || 10,
      passingScore: data.passingScore || 60
    })

    return test
  }

  async update (id, data) {
    const test = await Test.findByPk(id)
    if (!test) throw ApiError.notFound('Test not found')

    await test.update(data)
    return test
  }

  // ===== QUESTIONS =====
  async createQuestion (testId, data) {
    return Question.create({
      testId,
      text: data.text,
      type: data.type || 'SINGLE',
      difficulty: data.difficulty || 1
    })
  }

  async updateQuestion (id, data) {
    const q = await Question.findByPk(id)
    if (!q) throw ApiError.notFound('Question not found')

    await q.update(data)
    return q
  }

  async deleteQuestion (id) {
    const q = await Question.findByPk(id)
    if (!q) throw ApiError.notFound('Question not found')

    await q.destroy()
  }

  // ===== ANSWERS =====
  async createAnswer (questionId, data) {
    return Answer.create({
      questionId,
      text: data.text,
      isCorrect: !!data.isCorrect
    })
  }

  async updateAnswer (id, data) {
    const a = await Answer.findByPk(id)
    if (!a) throw ApiError.notFound('Answer not found')

    await a.update(data)
    return a
  }

  async deleteAnswer (id) {
    const a = await Answer.findByPk(id)
    if (!a) throw ApiError.notFound('Answer not found')

    await a.destroy()
  }

  async getTestResults ({ testId, teacherId }) {
    const test = await Test.findByPk(testId)

    if (!test) throw new Error('Test not found')

    const results = await TestResult.findAll({
      where: {
        testId,
        finishedAt: {
          [Op.ne]: null
        }
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

    // берём только последнюю попытку каждого пользователя
    const lastResultsMap = new Map()

    for (const r of results) {
      if (!lastResultsMap.has(r.userId)) {
        lastResultsMap.set(r.userId, r)
      }
    }

    return Array.from(lastResultsMap.values()).map(r => ({
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

  async getMyTestResult ({ userId, testId }) {
    const result = await TestResult.findOne({
      where: {
        userId,
        testId,
        finishedAt: {
          [Op.ne]: null
        }
      },
      order: [['attempt', 'DESC']],
      include: [
        {
          model: UserAnswer,
          as: 'answers'
        }
      ]
    })

    if (!result) {
      return null
    }

    /* ============================= */
    /* ===== BUILD DETAILS ========= */
    /* ============================= */

    // все вопросы теста с правильными ответами
    const questions = await Question.findAll({
      where: { testId },
      include: [
        {
          model: Answer,
          as: 'answers'
        }
      ]
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

  async startTest (testId, userId) {
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

    if (!test) throw new Error('Test not found')

    // 🔢 номер попытки
    const attemptsCount = await TestResult.count({
      where: { testId, userId }
    })

    const attempt = attemptsCount + 1

    const testResult = await TestResult.create({
      testId,
      userId,
      attempt,
      startedAt: new Date()
    })

    return {
      testResultId: testResult.id,
      attempt,
      timeLimit: test.timeLimit,
      startedAt: testResult.startedAt,
      questions: test.questions
    }
  }

  /* =====================================================
     SUBMIT TEST
     answers = [{ questionId, answerIds: [] }]
     ===================================================== */
  async submitTest ({ testResultId, userId, answers = {} }) {
    console.log('testResultId:', testResultId)

    const testResult = await TestResult.findByPk(testResultId, {
      include: {
        model: Test,
        as: 'test',
        include: {
          model: Question,
          as: 'questions',
          include: {
            model: Answer,
            as: 'answers'
          }
        }
      }
    })

    if (!testResult) throw new Error('Test result not found')
    if (testResult.userId !== userId) throw new Error('Access denied')
    if (testResult.finishedAt) throw new Error('Test already submitted')

    // 2️⃣ Проверка тайм-лимита
    const now = new Date()
    const deadline = new Date(testResult.startedAt)
    deadline.setMinutes(deadline.getMinutes() + testResult.test.timeLimit)

    const finishedAt = now > deadline ? deadline : now

    let correctCount = 0
    const totalQuestions = testResult.test.questions.length

    // 3️⃣ Проверка каждого вопроса
    for (const question of testResult.test.questions) {
      const correctAnswerIds = question.answers
        .filter(a => a.isCorrect)
        .map(a => a.id)
        .sort()

      const userAnswerIds = (answers[question.id] || []).slice().sort()

      const isCorrect =
        correctAnswerIds.length === userAnswerIds.length &&
        correctAnswerIds.every((id, i) => id === userAnswerIds[i])

      // 4️⃣ Сохраняем ответы пользователя
      for (const answerId of userAnswerIds) {
        await UserAnswer.create({
          userId,
          questionId: question.id,
          answerId,
          testResultId: testResult.id
        })
      }
      console.log('Q:', question.id)
      console.log('Correct:', correctAnswerIds)
      console.log('User:', userAnswerIds)
      console.log('isCorrect:', isCorrect)
      if (isCorrect) correctCount++
    }

    // 5️⃣ Подсчёт результата
    const score = Math.round((correctCount / totalQuestions) * 100)
    const passed = score >= testResult.test.passingScore

    await testResult.update({
      finishedAt,
      score,
      passed
    })

    return {
      score,
      passed,
      correct: correctCount,
      total: totalQuestions,
      finishedAt
    }
  }
}

module.exports = new TestService()
