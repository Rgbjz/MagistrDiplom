import { createSlice } from '@reduxjs/toolkit'
import { login, register, initAuth } from './authThunks'

const initialState = {
  isAuth: false,
  authChecked: false,
  loading: false,
  error: null
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout (state) {
      localStorage.removeItem('accessToken')
      localStorage.setItem('loggedOut', 'true')
      state.isAuth = false
      state.authChecked = true
    }
  },
  extraReducers: builder => {
    builder
      .addCase(initAuth.pending, state => {
        state.loading = true
      })
      .addCase(initAuth.fulfilled, state => {
        state.loading = false
        state.isAuth = true
        state.authChecked = true
      })
      .addCase(initAuth.rejected, state => {
        state.loading = false
        state.isAuth = false
        state.authChecked = true
      })

      .addCase(login.fulfilled, state => {
        state.loading = false
        state.isAuth = true
        state.authChecked = true
        localStorage.removeItem('loggedOut')
      })

      .addCase(register.fulfilled, state => {
        state.loading = false
        state.isAuth = true
        state.authChecked = true
        localStorage.removeItem('loggedOut')
      })
  }
})

export const { logout } = authSlice.actions
export default authSlice.reducer
