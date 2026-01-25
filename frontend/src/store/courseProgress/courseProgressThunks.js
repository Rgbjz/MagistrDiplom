import { createAsyncThunk } from '@reduxjs/toolkit'
import { courseProgressApi } from '../../api/courseProgressApi'

/* ===== МОЙ ПРОГРЕСС ===== */
export const fetchMyCourseProgress = createAsyncThunk(
  'courseProgress/fetchMy',
  async (courseId, { rejectWithValue }) => {
    try {
      const { data } = await courseProgressApi.getMyProgress(courseId)
      return data
    } catch (e) {
      return rejectWithValue(e.response?.data || 'Failed to load progress')
    }
  }
)

export const startLesson = createAsyncThunk(
  'courseProgress/startLesson',
  async (lessonId, { rejectWithValue }) => {
    try {
      const { data } = await courseProgressApi.startLesson(lessonId)
      return data
    } catch (e) {
      return rejectWithValue(e.response?.data || 'Failed to start lesson')
    }
  }
)
/* ===== ЗАВЕРШИТЬ УРОК ===== */
export const completeLesson = createAsyncThunk(
  'courseProgress/completeLesson',
  async (lessonId, { rejectWithValue }) => {
    try {
      const { data } = await courseProgressApi.completeLesson(lessonId)
      return data
    } catch (e) {
      return rejectWithValue(e.response?.data || 'Failed to complete lesson')
    }
  }
)

/* ===== ПРОГРЕСС СТУДЕНТОВ (TEACHER / ADMIN) ===== */
export const fetchStudentsProgress = createAsyncThunk(
  'courseProgress/fetchStudents',
  async (courseId, { rejectWithValue }) => {
    try {
      const { data } = await courseProgressApi.getCourseStudentsProgress(
        courseId
      )
      return data
    } catch (e) {
      return rejectWithValue(e.response?.data || 'Failed to load students')
    }
  }
)
