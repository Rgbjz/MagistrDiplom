import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import { fetchCourse } from '../../../store/courseBuilder/courseBuilderThunks'
import { fetchMyCourseProgress } from '../../../store/courseProgress/courseProgressThunks'

import StructurePanel from '../../../components/StructurePanel/StructurePanel'
import CourseEnrollRequests from '../../../components/CourseEnrollRequests/CourseEnrollRequests'
import ViewerPanel from '../../../components/ViewerPanel/ViewerPanel'

import styles from './CoursePage.module.scss'

export default function CoursePage () {
  const { id } = useParams()
  const dispatch = useDispatch()

  const course = useSelector(state => state.courseBuilder.course)
  const user = useSelector(state => state.user.user)

  useEffect(() => {
    dispatch(fetchCourse(id))
  }, [dispatch, id])
  useEffect(() => {
    if (course?.id && user?.role === 'STUDENT') {
      dispatch(fetchMyCourseProgress(course.id))
    }
  }, [dispatch, course?.id, user?.role])
  if (!course) return null

  return (
    <div className={styles.page}>
      {/* ЛЕВАЯ ПАНЕЛЬ */}
      <StructurePanel mode='view' />

      {/* ПРАВАЯ ЧАСТЬ */}
      <div className={styles.content}>
        <header className={styles.header}>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
        </header>

        <ViewerPanel />
      </div>
    </div>
  )
}
