import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchEnrollRequests,
  approveEnroll,
  rejectEnroll
} from '../../store/course/courseThunks'

const CourseEnrollRequests = ({ courseId }) => {
  const dispatch = useDispatch()

  const requests =
    useSelector(state => state.courses.enrollRequests?.[courseId]) || []

  useEffect(() => {
    dispatch(fetchEnrollRequests(courseId))
  }, [courseId, dispatch])

  if (!requests.length) {
    return <p>Нет заявок на вступление</p>
  }

  return (
    <div>
      <h3>Заявки на курс</h3>

      {requests.map(req => {
        const student = req.student
        const profile = student.profile

        const fullName =
          profile?.firstName || profile?.lastName
            ? `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
            : student.email

        return (
          <div
            key={student.id}
            style={{
              border: '1px solid #ccc',
              padding: 12,
              marginBottom: 8
            }}
          >
            <div>
              <strong>{fullName}</strong>
              <div style={{ color: '#666', fontSize: 14 }}>{student.email}</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                onClick={() =>
                  dispatch(
                    approveEnroll({
                      courseId,
                      userId: student.id
                    })
                  )
                }
              >
                ✅ Одобрить
              </button>

              <button
                style={{ marginLeft: 8 }}
                onClick={() =>
                  dispatch(
                    rejectEnroll({
                      courseId,
                      userId: student.id
                    })
                  )
                }
              >
                ❌ Отклонить
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default CourseEnrollRequests
