import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'

export default function TeacherRoute ({ children }) {
  const user = useSelector(state => state.user.user)

  if (!user) return null

  if (user.role !== 'TEACHER') {
    return <Navigate to='/' />
  }

  return children
}
