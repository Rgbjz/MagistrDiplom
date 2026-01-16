import { createSlice } from '@reduxjs/toolkit'
import {
  fetchTest,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createAnswer,
  updateAnswer,
  deleteAnswer
} from './testThunks'

const initialState = {
  current: null,
  loading: false,
  error: null
}

const testSlice = createSlice({
  name: 'test',
  initialState,
  reducers: {
    clearTest: state => {
      state.current = null
    }
  },
  extraReducers: builder => {
    builder
      .addCase(fetchTest.pending, state => {
        state.loading = true
      })
      .addCase(fetchTest.fulfilled, (state, action) => {
        state.loading = false
        state.current = action.payload
      })

      /* ===== QUESTION ===== */
      .addCase(createQuestion.fulfilled, (state, action) => {
        state.current.questions.push({
          ...action.payload,
          answers: [] // 👈 ОБЯЗАТЕЛЬНО
        })
      })

      .addCase(updateQuestion.fulfilled, (state, action) => {
        const q = action.payload
        state.current.questions = state.current.questions.map(x =>
          x.id === q.id ? q : x
        )
      })
      .addCase(deleteQuestion.fulfilled, (state, action) => {
        state.current.questions = state.current.questions.filter(
          q => q.id !== action.payload
        )
      })

      /* ===== ANSWER ===== */
      .addCase(createAnswer.fulfilled, (state, action) => {
        const a = action.payload
        const q = state.current.questions.find(q => q.id === a.questionId)
        q.answers.push(a)
      })
  }
})

export const { clearTest } = testSlice.actions
export default testSlice.reducer
