import { createSlice } from '@reduxjs/toolkit'
import {
  fetchMyCourseProgress,
  fetchStudentsProgress,
  startLesson,
  completeLesson
} from './courseProgressThunks'

const initialState = {
  loading: false,
  error: null,

  my: null, // мой прогресс
  students: [] // прогресс студентов
}

const courseProgressSlice = createSlice({
  name: 'courseProgress',
  initialState,

  reducers: {
    resetProgress: state => {
      state.my = null
      state.students = []
      state.error = null
    }
  },

  extraReducers: builder => {
    builder
      /* ===== MY PROGRESS ===== */
      .addCase(fetchMyCourseProgress.pending, state => {
        state.loading = true
      })
      .addCase(fetchMyCourseProgress.fulfilled, (state, action) => {
        state.loading = false

        const data = action.payload

        state.my = {
          percent: data.percent,
          total: data.total,
          completed: data.completed,

          lessons: data.lessons.reduce((acc, id) => {
            acc[id] = 'COMPLETED'
            return acc
          }, {}),

          tests: data.tests.reduce((acc, id) => {
            acc[id] = 'COMPLETED'
            return acc
          }, {})
        }
      })
      .addCase(fetchMyCourseProgress.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

      /* ===== START LESSON ===== */
      .addCase(startLesson.fulfilled, (state, action) => {
        if (!state.my) return

        const { lessonId, status } = action.payload

        state.my.lessons[lessonId] = status // IN_PROGRESS
      })

      /* ===== COMPLETE LESSON ===== */
      .addCase(completeLesson.fulfilled, (state, action) => {
        if (!state.my) return

        const { lessonId, status } = action.payload

        const prevStatus = state.my.lessons[lessonId]

        state.my.lessons[lessonId] = status // COMPLETED

        if (prevStatus !== 'COMPLETED') {
          state.my.completed += 1
          state.my.percent = Math.round(
            (state.my.completed / state.my.total) * 100
          )
        }
      })

      /* ===== STUDENTS ===== */
      .addCase(fetchStudentsProgress.fulfilled, (state, action) => {
        state.students = action.payload
      })
  }
})

export const { resetProgress } = courseProgressSlice.actions
export default courseProgressSlice.reducer
