import { createSlice } from '@reduxjs/toolkit'
import {
  fetchCourses,
  fetchMyCourses,
  enrollCourse,
  fetchEnrollRequests,
  approveEnroll,
  rejectEnroll,
  updateCourse,
  deleteCourse
} from './courseThunks'

const initialState = {
  all: [],
  my: [],
  enrollRequests: {},
  loading: false,
  error: null
}

const courseSlice = createSlice({
  name: 'courses',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchCourses.pending, state => {
        state.loading = true
      })
      .addCase(fetchCourses.fulfilled, (state, action) => {
        state.loading = false
        state.all = action.payload
      })
      .addCase(fetchCourses.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })

      .addCase(fetchMyCourses.fulfilled, (state, action) => {
        state.my = action.payload
      })

      .addCase(updateCourse.fulfilled, (state, action) => {
        const updated = action.payload

        state.all = state.all.map(c =>
          c.id === updated.id ? { ...c, ...updated } : c
        )

        state.my = state.my.map(c =>
          c.id === updated.id ? { ...c, ...updated } : c
        )
      })

      // ✅ DELETE COURSE
      .addCase(deleteCourse.fulfilled, (state, action) => {
        const id = action.payload
        state.all = state.all.filter(c => c.id !== id)
        state.my = state.my.filter(c => c.id !== id)
      })
      // 📥 FETCH ENROLL REQUESTS
      .addCase(fetchEnrollRequests.fulfilled, (state, action) => {
        const { courseId, requests } = action.payload
        state.enrollRequests[courseId] = requests
      })

      // ✅ APPROVE
      .addCase(approveEnroll.fulfilled, (state, action) => {
        const { courseId, userId } = action.payload

        if (!state.enrollRequests?.[courseId]) return

        state.enrollRequests[courseId] = state.enrollRequests[courseId].filter(
          r => r.userId !== userId
        )
      })

      // ❌ REJECT
      .addCase(rejectEnroll.fulfilled, (state, action) => {
        const { courseId, userId } = action.payload

        state.enrollRequests[courseId] =
          state.enrollRequests[courseId]?.filter(r => r.user.id !== userId) ||
          []
      })
  }
})

export default courseSlice.reducer
