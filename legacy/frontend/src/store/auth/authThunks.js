import { createAsyncThunk } from '@reduxjs/toolkit'
import { authApi } from '../../api/authApi'

export const register = createAsyncThunk(
  'auth/register',
  async (data, { rejectWithValue }) => {
    try {
      const res = await authApi.register(data)
      localStorage.setItem('accessToken', res.data.accessToken)
      return res.data
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

export const login = createAsyncThunk(
  'auth/login',
  async (data, { rejectWithValue }) => {
    try {
      const res = await authApi.login(data)
      localStorage.setItem('accessToken', res.data.accessToken)
      return res.data
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)

// 🔥 ГЛАВНЫЙ THUNK ДЛЯ RELOAD
export const initAuth = createAsyncThunk(
  'auth/init',
  async (_, { rejectWithValue }) => {
    try {
      await authApi.me()
      return true
    } catch (e) {
      return rejectWithValue(e.response?.data)
    }
  }
)
