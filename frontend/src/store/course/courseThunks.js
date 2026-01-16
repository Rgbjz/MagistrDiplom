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
