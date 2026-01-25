import api from './axios'

export const startTestApi = testId => api.post(`/tests/${testId}/start`)

export const submitTestApi = (testResultId, payload) =>
  api.post(`/tests/${testResultId}/submit`, payload)
