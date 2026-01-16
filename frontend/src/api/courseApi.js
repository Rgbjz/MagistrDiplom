import api from './axios'

export const courseApi = {
  getAll: () => api.get('/courses'),
  getById: id => api.get(`/courses/${id}`),
  enroll: id => api.post(`/courses/${id}/enroll`),
  getEnrollRequests: courseId =>
    api.get(`/courses/${courseId}/enrollments?status=pending`),
  approveEnroll: (courseId, userId) =>
    api.post(`/courses/${courseId}/enroll/${userId}/approve`),
  rejectEnroll: (courseId, userId) =>
    api.post(`/courses/${courseId}/enroll/${userId}/reject`),
  update: (id, data) => api.patch(`/courses/${id}`, data),
  delete: id => api.delete(`/courses/${id}`)
}
