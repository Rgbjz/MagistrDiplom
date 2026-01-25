import { createSlice } from '@reduxjs/toolkit'
import {
  fetchTest,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createAnswer,
  updateAnswer,
  deleteAnswer,
  fetchMyTestResult
} from './testThunks'

const initialState = {
  current: null,
  lastResult: null,
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

      .addCase(fetchMyTestResult.pending, state => {
        state.loading = true
      })
      .addCase(fetchMyTestResult.fulfilled, (state, action) => {
        state.loading = false
        state.lastResult = action.payload // null или объект
      })

      /* ===== QUESTION ===== */
      .addCase(createQuestion.fulfilled, (state, action) => {
        state.current.questions.push({
          ...action.payload,
          answers: [] // 👈 ОБЯЗАТЕЛЬНО
        })
      })

      .addCase(updateQuestion.fulfilled, (state, action) => {
        const updated = action.payload

        const q = state.current.questions.find(q => q.id === updated.id)
        if (!q) return

        q.text = updated.text
        q.type = updated.type
        q.difficulty = updated.difficulty
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
      .addCase(updateAnswer.fulfilled, (state, action) => {
        const updated = action.payload

        const q = state.current.questions.find(q => q.id === updated.questionId)
        if (!q) return

        const a = q.answers.find(a => a.id === updated.id)
        if (!a) return

        a.text = updated.text
        a.isCorrect = updated.isCorrect
      })
      .addCase(deleteAnswer.fulfilled, (state, action) => {
        const { id, questionId } = action.payload

        const q = state.current.questions.find(q => q.id === questionId)
        if (!q) return

        q.answers = q.answers.filter(a => a.id !== id)
      })
  }
})

export const { clearTest } = testSlice.actions
export default testSlice.reducer
