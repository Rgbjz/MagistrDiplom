import { Routes, Route, Navigate } from 'react-router-dom'
import Login from '../pages/auth/LoginPage'
import Register from '../pages/auth/RegisterPage'
import Home from '../pages/app/Home/Home'
import CoursePage from '../pages/app/CoursePage/CoursePage'
import Profile from '../pages/app/Profile/Profile'
import AppLayout from '../components/Layout/AppLayout'
import TeacherRoute from './TeacherRoute'
import CourseBuilder from '../pages/teacher/CourseBuilder/CourseBuilder'
import CreateCoursePage from '../pages/teacher/CreateCoursePage/CreateCoursePage'
import CourseManagementPage from '../pages/app/CourseManagementPage/CourseManagementPage'
import { useSelector } from 'react-redux'

export default function AppRouter () {
  const { isAuth, authChecked } = useSelector(state => state.auth)

  if (!authChecked) {
    return <div>Loading...</div>
  }

  if (!isAuth) {
    return (
      <Routes>
        <Route path='/login' element={<Login />} />
        <Route path='/register' element={<Register />} />
        <Route path='*' element={<Navigate to='/login' />} />
      </Routes>
    )
  }

  return (
    <Routes>
      {/* ✅ layout route ДОЛЖЕН ИМЕТЬ path */}
      <Route path='/' element={<AppLayout />}>
        {/* index = '/' */}
        <Route index element={<Home />} />
        <Route path='profile' element={<Profile />} />
        <Route path='*' element={<Navigate to='/' />} />
        <Route path='/courses/:id' element={<CoursePage />} />
        <Route path='/courses/:id/manage' element={<CourseManagementPage />} />
        <Route
          path='teacher/courses/new'
          element={
            <TeacherRoute>
              <CreateCoursePage />
            </TeacherRoute>
          }
        />
        <Route
          path='teacher/courses/:id/builder'
          element={
            <TeacherRoute>
              <CourseBuilder />
            </TeacherRoute>
          }
        />
      </Route>
    </Routes>
  )
}
