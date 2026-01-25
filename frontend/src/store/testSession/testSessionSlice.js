import { createSlice } from '@reduxjs/toolkit'
import { startTest, submitTest } from './testSessionThunks'

const initialState = {
  session: null, // данные старта теста
  answers: {}, // { questionId: [answerId] }
  timeLeft: null, // секунды
  finished: false,
  result: null, // результат сабмита
  loading: false,
  error: null
}

const testSessionSlice = createSlice({
  name: 'testSession',
  initialState,
  reducers: {
    setAnswer: (state, action) => {
      const { questionId, answerIds } = action.payload
      state.answers[questionId] = answerIds
    },

    tick: state => {
      if (state.timeLeft > 0) {
        state.timeLeft -= 1
      }
    },

    clearSession: () => initialState
  },
  extraReducers: builder => {
    builder
      /* ===== START TEST ===== */
      .addCase(startTest.pending, state => {
        state.loading = true
        state.error = null
      })
      .addCase(startTest.fulfilled, (state, action) => {
        state.loading = false
        state.session = action.payload
        state.timeLeft = action.payload.timeLimit * 60
        state.finished = false
        state.answers = {}
      })
      .addCase(startTest.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

      /* ===== SUBMIT TEST ===== */
      .addCase(submitTest.pending, state => {
        state.loading = true
      })
      .addCase(submitTest.fulfilled, (state, action) => {
        state.loading = false
        state.finished = true
        state.session = null
      })
      .addCase(submitTest.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  }
})

export const { setAnswer, tick, clearSession } = testSessionSlice.actions

export default testSessionSlice.reducer
