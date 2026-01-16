const { Test, Question, Answer } = require('../db/models')
const ApiError = require('../utils/ApiError')

class TestService {
  async getById (id) {
    const test = await Test.findByPk(id, {
      include: [
        {
          model: Question,
          as: 'questions',
          include: [{ model: Answer, as: 'answers' }]
        }
      ]
    })

    if (!test) throw ApiError.notFound('Test not found')
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
}

module.exports = new TestService()
