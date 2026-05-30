import { createAsyncThunk } from '@reduxjs/toolkit'
import { startTestApi, submitTestApi } from '../../api/testSessionApi'

export const startTest = createAsyncThunk(
  'testSession/start',
  async (testId, { rejectWithValue }) => {
    try {
      const { data } = await startTestApi(testId)
      return data
    } catch (e) {
      return rejectWithValue(e.response?.data || e.message)
    }
  }
)

export const submitTest = createAsyncThunk(
  'testSession/submit',
  async ({ testResultId, answers }, { rejectWithValue }) => {
    try {
      const { data } = await submitTestApi(testResultId, { answers })
      return data
    } catch (e) {
      return rejectWithValue(e.response?.data || e.message)
    }
  }
)
