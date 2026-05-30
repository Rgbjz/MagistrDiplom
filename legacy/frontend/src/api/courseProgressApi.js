import api from './axios' // твой axios instance

export const courseProgressApi = {
  /* ===== МОЙ ПРОГРЕСС ПО КУРСУ ===== */
  getMyProgress (courseId) {
    return api.get(`/courseProgress/courses/${courseId}/progress`)
  },

  startLesson (lessonId) {
    api.post(`/courseProgress/lessons/${lessonId}/start`)
  },

  /* ===== ОТМЕТИТЬ УРОК КАК ПРОЙДЕННЫЙ ===== */
  completeLesson (lessonId) {
    return api.post(`/courseProgress/lessons/${lessonId}/complete`)
  },

  /* ===== ПРОГРЕСС ВСЕХ СТУДЕНТОВ (ДЛЯ УЧИТЕЛЯ) ===== */
  getCourseStudentsProgress (courseId) {
    return api.get(`/courses/${courseId}/progress/students`)
  }
}
