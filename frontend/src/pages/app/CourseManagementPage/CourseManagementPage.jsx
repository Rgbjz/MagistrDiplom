import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import { fetchCourse } from '../../../store/courseBuilder/courseBuilderThunks'

import CourseEnrollRequests from '../../../components/CourseEnrollRequests/CourseEnrollRequests'

import styles from './CourseManagementPage.module.scss'

export default function CourseManagementPage () {
  const { id } = useParams()
  const dispatch = useDispatch()

  const course = useSelector(state => state.courseBuilder.course)
  const user = useSelector(state => state.user.user)

  useEffect(() => {
    dispatch(fetchCourse(id))
  }, [dispatch, id])

  if (!course) return null

  if (user?.id !== course.teacherId && user?.role !== 'ADMIN') {
    return <p>Нет доступа</p>
  }

  return (
    <div className={styles.page}>
      <h1>Управление курсом</h1>
      <h2>{course.title}</h2>

      <section className={styles.block}>
        <h3>📩 Заявки на курс</h3>
        <CourseEnrollRequests courseId={course.id} />
      </section>

      <section className={styles.block}>
        <h3>👥 Студенты</h3>
        <p>🚧 В разработке</p>
      </section>

      <section className={styles.block}>
        <h3>📊 Прогресс</h3>
        <p>🚧 В разработке</p>
      </section>
    </div>
  )
}
