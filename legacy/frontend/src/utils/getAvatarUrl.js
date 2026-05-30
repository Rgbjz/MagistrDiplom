import { API_URL } from '../constants'

export const getAvatarUrl = avatarUrl => {
  if (!avatarUrl) return null
  return `${API_URL}${avatarUrl}`
}
