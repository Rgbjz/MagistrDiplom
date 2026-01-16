import { createAsyncThunk } from '@reduxjs/toolkit'
import { testApi } from '../../api/testApi'

/* ===== TEST ===== */

export const fetchTest = createAsyncThunk('test/fetch', async testId => {
  const { data } = await testApi.getTest(`${testId}`)
  return data
})

/* ===== QUESTION ===== */

export const createQuestion = createAsyncThunk(
  'test/createQuestion',
  async ({ testId, data }) => {
    const { data: question } = await testApi.addQuestion(testId, data)
    return question
  }
)

export const updateQuestion = createAsyncThunk(
  'test/updateQuestion',
  async ({ id, data }) => {
    const { data: updated } = await testApi.patch(`/questions/${id}`, data)
    return updated
  }
)

export const deleteQuestion = createAsyncThunk(
  'test/deleteQuestion',
  async id => {
    await testApi.delete(`/questions/${id}`)
    return id
  }
)

/* ===== ANSWER ===== */

export const createAnswer = createAsyncThunk(
  'test/createAnswer',
  async ({ questionId, data }) => {
    const { data: answer } = await testApi.addAnswer(questionId, data)
    return answer
  }
)

export const updateAnswer = createAsyncThunk(
  'test/updateAnswer',
  async ({ id, data }) => {
    const { data: updated } = await testApi.patch(`/answers/${id}`, data)
    return updated
  }
)

export const deleteAnswer = createAsyncThunk('test/deleteAnswer', async id => {
  await testApi.delete(`/answers/${id}`)
  return id
})
