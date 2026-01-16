import api from './axios'

export const testApi = {
  // ===== TEST =====
  getTest (id) {
    return api.get(`/tests/${id}`)
  },

  updateTest (id, data) {
    return api.patch(`/tests/${id}`, data)
  },

  // ===== QUESTIONS =====
  addQuestion (testId, data) {
    return api.post(`/tests/${testId}/questions`, data)
  },

  updateQuestion (questionId, data) {
    return api.patch(`/tests/questions/${questionId}`, data)
  },

  deleteQuestion (questionId) {
    return api.delete(`/tests/questions/${questionId}`)
  },

  // ===== ANSWERS =====
  addAnswer (questionId, data) {
    return api.post(`/tests/questions/${questionId}/answers`, data)
  },

  updateAnswer (answerId, data) {
    return api.patch(`/tests/answers/${answerId}`, data)
  },

  deleteAnswer (answerId) {
    return api.delete(`/tests/answers/${answerId}`)
  }
}
