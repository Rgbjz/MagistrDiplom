import { Link } from 'react-router-dom'
import styles from './CourseCard.module.scss'
import { API_URL } from '../../constants'

export default function CourseCard ({ course, user, onEnroll }) {
  const imgSrc = course.imageUrl?.startsWith('/public')
    ? `${API_URL}${course.imageUrl}`
    : course.imageUrl

  const isStudent = user?.role === 'STUDENT'
  const isTeacher = user?.role === 'TEACHER'
  const isAdmin = user?.role === 'ADMIN'
  const isOwner = user?.id === course.teacherId

  const getButton = () => {
    if (!user) return null

    /* ===== STUDENT ===== */
    if (isStudent) {
      const isRequested = course.enrollmentStatus === 'PENDING'
      const isApproved = course.enrollmentStatus === 'ACTIVE'

      if (isRequested) {
        return (
          <button className={`${styles.btn} ${styles.btnDisabled}`}>
            Pending
          </button>
        )
      }

      if (isApproved) {
        return (
          <Link
            className={`${styles.btn} ${styles.btnPrimary}`}
            to={`/courses/${course.id}`}
          >
            Open
          </Link>
        )
      }

      return (
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => onEnroll(course.id)}
        >
          Enroll
        </button>
      )
    }

    /* ===== TEACHER ===== */
    if (isTeacher) {
      return (
        <div className={styles.actions}>
          <Link
            className={`${styles.btn} ${styles.btnPrimary}`}
            to={`/courses/${course.id}`}
          >
            View
          </Link>

          {isOwner && (
            <Link
              className={`${styles.btn} ${styles.btnOutline}`}
              to={`/teacher/courses/${course.id}/builder`}
            >
              Edit
            </Link>
          )}
        </div>
      )
    }

    /* ===== ADMIN ===== */
    if (isAdmin) {
      return (
        <div className={styles.actions}>
          <Link
            className={`${styles.btn} ${styles.btnPrimary}`}
            to={`/courses/${course.id}`}
          >
            View
          </Link>

          <Link
            className={`${styles.btn} ${styles.btnOutline}`}
            to={`/teacher/courses/${course.id}/builder`}
          >
            Edit
          </Link>
        </div>
      )
    }

    return null
  }

  return (
    <div className={styles.card}>
      <div className={styles.image}>
        {imgSrc ? (
          <img src={imgSrc} alt={course.title} />
        ) : (
          <div className={styles.placeholder} />
        )}
      </div>

      <div className={styles.content}>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        {getButton()}
      </div>
    </div>
  )
}
