import { createSlice } from '@reduxjs/toolkit'
import { fetchMe, updateProfile } from './userThunks'

const userSlice = createSlice({
  name: 'user',
  initialState: {
    user: null,
    loading: false,
    error: null
  },
  reducers: {
    clearUser (state) {
      state.user = null
    }
  },
  extraReducers: builder => {
    builder
      .addCase(fetchMe.pending, state => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
      })
      .addCase(fetchMe.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload?.message
      })

      .addCase(updateProfile.pending, state => {
        state.loading = true
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false
        state.user.profile = action.payload
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload?.message
      })
  }
})

export const { clearUser } = userSlice.actions
export default userSlice.reducer
