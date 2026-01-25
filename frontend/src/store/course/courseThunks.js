import { createAsyncThunk } from '@reduxjs/toolkit'
import { courseApi } from '../../api/courseApi'

const mapStudentProgress = s => {
  const totalItems = s.lessons.total + s.tests.total
  const completedItems = s.lessons.completed + s.tests.completed

  return {
    userId: s.userId,
    fullName: s.name || s.email,
    email: s.email,

    completedLessons: s.lessons.completed,
    totalLessons: s.lessons.total,

    passedTests: s.tests.completed,
    totalTests: s.tests.total,

    progressPercent: totalItems
      ? Math.round((completedItems / totalItems) * 100)
      : 0,

    completed: completedItems === totalItems
  }
}

export const fetchCourses = createAsyncThunk('courses/fetchAll', async () => {
  const { data } = await courseApi.getAll()
  return data
})

export const fetchMyCourses = createAsyncThunk('courses/fetchMy', async () => {
  const { data } = await courseApi.getAll()
  return data.filter(c => c.enrolled)
})

export const fetchCourseStudentsProgress = createAsyncThunk(
  'courses/fetchStudentsProgress',
  async (courseId, { rejectWithValue }) => {
    try {
      const { data } = await courseApi.getCourseStudentsProgress(courseId)

      // 🔥 ВАЖНО: маппинг здесь
      return data.map(mapStudentProgress)
    } catch (e) {
      return rejectWithValue(
        e.response?.data?.message || 'Failed to load students progress'
      )
    }
  }
)

export const enrollCourse = createAsyncThunk(
  'courses/enroll',
  async courseId => {
    await courseApi.enroll(courseId)
    return courseId
  }
)

export const fetchEnrollRequests = createAsyncThunk(
  'courses/fetchEnrollRequests',
  async courseId => {
    const { data } = await courseApi.getEnrollRequests(courseId)
    return { courseId, requests: data }
  }
)

export const approveEnroll = createAsyncThunk(
  'courses/approveEnroll',
  async ({ courseId, userId }) => {
    await courseApi.approveEnroll(courseId, userId)
    return { courseId, userId }
  }
)

export const rejectEnroll = createAsyncThunk(
  'courses/rejectEnroll',
  async ({ courseId, userId }) => {
    await courseApi.rejectEnroll(courseId, userId)
    return { courseId, userId }
  }
)

// ✅ UPDATE COURSE
export const updateCourse = createAsyncThunk(
  'courses/update',
  async ({ id, data }) => {
    const { data: updated } = await courseApi.update(id, data)
    return updated
  }
)

// ✅ DELETE COURSE
export const deleteCourse = createAsyncThunk('courses/delete', async id => {
  await courseApi.delete(id)
  return id
})
