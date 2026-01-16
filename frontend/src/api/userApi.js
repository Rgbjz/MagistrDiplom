import api from './axios'

export const userApi = {
  me () {
    return api.get('/users/me')
  },

  updateProfile (data) {
    return api.put('/users/me/profile', data)
  }
}
