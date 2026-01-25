import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'

import { fetchCourse } from '../../../store/courseBuilder/courseBuilderThunks'
import { fetchCourseStudentsProgress } from '../../../store/course/courseThunks'

import CourseEnrollRequests from '../../../components/CourseEnrollRequests/CourseEnrollRequests'

import styles from './CourseManagementPage.module.scss'

export default function CourseManagementPage () {
  const { id } = useParams()
  const dispatch = useDispatch()

  const course = useSelector(state => state.courseBuilder.course)
  const user = useSelector(state => state.user.user)

  const courseState = useSelector(state => state.courses)
  const loading = courseState?.loading ?? false
  const students = courseState?.studentsProgress?.[id] ?? []

  useEffect(() => {
    dispatch(fetchCourse(id))
    dispatch(fetchCourseStudentsProgress(id))
  }, [dispatch, id])

  if (!course) return null

  if (user?.id !== course.teacherId && user?.role !== 'ADMIN') {
    return <p className={styles.noAccess}>Нет доступа</p>
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Управление курсом</h1>
      <h2 className={styles.subtitle}>{course.title}</h2>

      {/* ===== ENROLL REQUESTS ===== */}
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>📩 Заявки на курс</h3>
        <CourseEnrollRequests courseId={course.id} />
      </section>

      {/* ===== STUDENTS ===== */}
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>👥 Студенты</h3>

        {loading && <p className={styles.muted}>Загрузка...</p>}

        {!loading && students.length === 0 && (
          <p className={styles.muted}>Студенты ещё не записаны</p>
        )}

        <div className={styles.studentsList}>
          {students.map(s => (
            <div key={s.userId} className={styles.studentCard}>
              <div className={styles.studentHeader}>
                <div>
                  <div className={styles.studentName}>{s.fullName}</div>
                  <div className={styles.studentEmail}>{s.email}</div>
                </div>

                <div
                  className={`${styles.status} ${
                    s.completed ? styles.completed : styles.inProgress
                  }`}
                >
                  {s.completed ? 'Завершил курс' : 'В процессе'}
                </div>
              </div>

              <div className={styles.progress}>
                <div className={styles.progressRow}>
                  <span>Уроки</span>
                  <span>
                    {s.completedLessons} / {s.totalLessons}
                  </span>
                </div>

                <div className={styles.progressRow}>
                  <span>Тесты</span>
                  <span>
                    {s.passedTests} / {s.totalTests}
                  </span>
                </div>

                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${s.progressPercent}%` }}
                  />
                </div>

                <div className={styles.progressPercent}>
                  {s.progressPercent}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
