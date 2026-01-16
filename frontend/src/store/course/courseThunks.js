import { createAsyncThunk } from '@reduxjs/toolkit'
import { courseApi } from '../../api/courseApi'

export const fetchCourses = createAsyncThunk('courses/fetchAll', async () => {
  const { data } = await courseApi.getAll()
  return data
})

export const fetchMyCourses = createAsyncThunk('courses/fetchMy', async () => {
  const { data } = await courseApi.getAll()
  return data.filter(c => c.enrolled)
})

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
