import api from './axios'

export const courseBuilderApi = {
  // курс
  createCourse (data) {
    return api.post('/courses', data)
  },

  getMyCourses () {
    return api.get('/courses')
  },

  getCourseWithStructure (id) {
    return api.get(`/courses/${id}`)
  },

  updateCourse (id, data) {
    return api.patch(`/courses/${id}`, data)
  },

  // секции
  addSection (courseId, data) {
    return api.post(`/sections/${courseId}`, data)
  },

  updateSection (id, data) {
    return api.patch(`/sections/${id}`, data)
  },

  deleteSection (id) {
    return api.delete(`/sections/${id}`)
  },

  // уроки
  addLesson (sectionId, data) {
    return api.post(`/lessons/${sectionId}`, data)
  },

  updateLesson (id, data) {
    return api.patch(`/lessons/${id}`, data)
  },

  deleteLesson (id) {
    return api.delete(`/lessons/${id}`)
  },

  addTest (testId, data) {
    return api.post(`/tests/${testId}`, data)
  },

  deleteTest (testId) {
    return api.delete(`/tests/${testId}`)
  },

  updateTest (testid, data) {
    return api.patch(`/tests/${testid}`, data)
  }
}
