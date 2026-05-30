import { createAsyncThunk } from '@reduxjs/toolkit'
import { userApi } from '../../api/userApi'

export const fetchMe = createAsyncThunk(
  'user/fetchMe',
  async (_, { rejectWithValue }) => {
    try {
      const res = await userApi.me()
      return res.data
    } catch (e) {
      return rejectWithValue(
        e.response?.data || { message: 'Fetch user error' }
      )
    }
  }
)

export const updateProfile = createAsyncThunk(
  'user/updateProfile',
  async (formData, { rejectWithValue }) => {
    try {
      const res = await userApi.updateProfile(formData)
      return res.data
    } catch (e) {
      return rejectWithValue(
        e.response?.data || { message: 'Update profile error' }
      )
    }
  }
)
