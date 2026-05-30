import { createAsyncThunk } from '@reduxjs/toolkit'
import { courseBuilderApi } from '../../api/courseBuilderApi'

export const fetchCourse = createAsyncThunk(
  'courseBuilder/fetchCourse',
  async (id, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.getCourseWithStructure(id)
      return res.data
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const createCourse = createAsyncThunk(
  'courseBuilder/createCourse',
  async (data, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.createCourse(data)
      return res.data
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const addSection = createAsyncThunk(
  'courseBuilder/addSection',
  async ({ courseId, title }, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.addSection(courseId, { title })
      return res.data // return { id, title, ... }
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const addLesson = createAsyncThunk(
  'courseBuilder/addLesson',
  async ({ sectionId, title }, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.addLesson(sectionId, { title })
      return { sectionId, lesson: res.data }
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const addTest = createAsyncThunk(
  'courseBuilder/addTest',
  async ({ lessonId, title }, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.addTest(lessonId, { title })
      return { lessonId, test: res.data }
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const updateSection = createAsyncThunk(
  'courseBuilder/updateSection',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.updateSection(id, data)
      return res.data
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)
export const updateLesson = createAsyncThunk(
  'courseBuilder/updateLesson',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.updateLesson(id, data)
      return res.data
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)
export const updateTest = createAsyncThunk(
  'courseBuilder/updateTest',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await courseBuilderApi.updateTest(id, data)
      return res.data
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const deleteSection = createAsyncThunk(
  'courseBuilder/deleteSection',
  async (id, { rejectWithValue }) => {
    try {
      await courseBuilderApi.deleteSection(id)
      return id
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const deleteTest = createAsyncThunk(
  'courseBuilder/deleteTest',
  async (id, { rejectWithValue }) => {
    try {
      await courseBuilderApi.deleteTest(id)
      return id
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const deleteLesson = createAsyncThunk(
  'courseBuilder/deleteLesson',
  async (id, { rejectWithValue }) => {
    try {
      await courseBuilderApi.deleteLesson(id)
      return id
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)
