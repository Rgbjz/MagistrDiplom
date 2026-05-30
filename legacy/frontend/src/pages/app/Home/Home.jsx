import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchMe } from '../../../store/user/userThunks'
import { fetchCourses, enrollCourse } from '../../../store/course/courseThunks'
import CourseCard from '../../../components/CourseCard/CourseCard'
import styles from './Home.module.scss'

export default function Home () {
  const dispatch = useDispatch()

  const { all, loading } = useSelector(state => state.courses)
  const { user } = useSelector(state => state.user) // ← добавили

  useEffect(() => {
    dispatch(fetchMe())
    dispatch(fetchCourses())
  }, [dispatch])

  const onEnroll = id => {
    dispatch(enrollCourse(id))
  }

  return (
    <div className={styles.page}>
      <h1>Dashboard</h1>

      {loading && <p>Loading courses...</p>}

      <div className={styles.grid}>
        {all.map(course => (
          <CourseCard
            key={course.id}
            course={course}
            user={user} // ← передаём user
            onEnroll={onEnroll}
          />
        ))}
      </div>
    </div>
  )
}
