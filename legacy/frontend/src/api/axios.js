import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true
})

// ===== REQUEST =====
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ===== RESPONSE =====
api.interceptors.response.use(
  res => res,
  async error => {
    const originalRequest = error.config

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !localStorage.getItem('loggedOut')
    ) {
      originalRequest._retry = true

      try {
        const res = await axios.post(
          'http://localhost:5000/api/auth/refresh',
          {},
          { withCredentials: true }
        )

        localStorage.setItem('accessToken', res.data.accessToken)
        originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`

        return api(originalRequest)
      } catch {
        localStorage.removeItem('accessToken')
        localStorage.setItem('loggedOut', 'true')
      }
    }

    return Promise.reject(error)
  }
)

export default api
