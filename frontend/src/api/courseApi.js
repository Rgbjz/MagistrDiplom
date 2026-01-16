import api from './axios'

export const courseApi = {
  getAll: () => api.get('/courses'),
  getById: id => api.get(`/courses/${id}`),
  enroll: id => api.post(`/courses/${id}/enroll`),

  update: (id, data) => api.patch(`/courses/${id}`, data),
  delete: id => api.delete(`/courses/${id}`)
}
