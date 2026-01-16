import { useDispatch, useSelector } from 'react-redux'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  addSection,
  addLesson,
  addTest,
  updateSection,
  updateLesson,
  updateTest,
  deleteSection,
  deleteLesson,
  deleteTest
} from '../../store/courseBuilder/courseBuilderThunks'

import { updateCourse, deleteCourse } from '../../store/course/courseThunks'
import { setActiveItem } from '../../store/courseBuilder/courseBuilderSlice'

import styles from './StructurePanel.module.scss'

export default function StructurePanel ({ mode = 'edit' }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const { course, sections, activeItem } = useSelector(
    state => state.courseBuilder
  )

  const user = useSelector(state => state.user.user)

  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')

  const isView = mode === 'view'
  const isOwner = user?.id === course?.teacherId || user?.role === 'ADMIN'

  if (!course) {
    return <aside className={styles.left}>Loading...</aside>
  }

  const handleDeleteCourse = async () => {
    if (!window.confirm('Удалить курс безвозвратно?')) return
    await dispatch(deleteCourse(course.id))
    navigate('/')
  }

  const startEdit = (type, id, title) => {
    if (isView) return
    setEditing({ type, id })
    setValue(title)
  }

  const stopEdit = () => {
    setEditing(null)
    setValue('')
  }

  const submitEdit = () => {
    if (!value.trim()) return stopEdit()

    const data = { title: value.trim() }

    switch (editing.type) {
      case 'COURSE':
        dispatch(updateCourse({ id: editing.id, data }))
        break
      case 'SECTION':
        dispatch(updateSection({ id: editing.id, data }))
        break
      case 'LESSON':
        dispatch(updateLesson({ id: editing.id, data }))
        break
      case 'TEST':
        dispatch(updateTest({ id: editing.id, data }))
        break
    }

    stopEdit()
  }

  const InlineInput = () => (
    <input
      autoFocus
      className={styles.inlineInput}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={submitEdit}
      onKeyDown={e => {
        if (e.key === 'Enter') submitEdit()
        if (e.key === 'Escape') stopEdit()
      }}
    />
  )

  return (
    <aside className={styles.left}>
      {/* ===== COURSE HEADER ===== */}
      <div className={styles.header}>
        <div className={styles.courseHeader}>
          {!isView && editing?.type === 'COURSE' ? (
            <InlineInput />
          ) : (
            <h3
              className={styles.courseTitle}
              onClick={() => navigate(`/courses/${course.id}`)}
            >
              {course.title}
            </h3>
          )}

          {isOwner && (
            <button
              className={styles.manageBtn}
              onClick={() => navigate(`/courses/${course.id}/manage`)}
            >
              ⚙ Управление
            </button>
          )}
        </div>

        {!isView && (
          <div className={styles.actions}>
            <button
              onClick={() => startEdit('COURSE', course.id, course.title)}
            >
              ✏️
            </button>
            <button onClick={handleDeleteCourse}>🗑</button>
          </div>
        )}
      </div>

      {/* ===== ADD SECTION ===== */}
      {!isView && (
        <button
          className={styles.addBtn}
          onClick={() =>
            dispatch(addSection({ courseId: course.id, title: 'New section' }))
          }
        >
          + Добавить раздел
        </button>
      )}

      {/* ===== STRUCTURE ===== */}
      <ul className={styles.tree}>
        {sections.map(section => (
          <li key={section.id} className={styles.section}>
            <div className={styles.row}>
              {!isView &&
              editing?.type === 'SECTION' &&
              editing.id === section.id ? (
                <InlineInput />
              ) : (
                <div
                  className={`${styles.item} ${
                    activeItem?.type === 'SECTION' &&
                    activeItem.id === section.id
                      ? styles.active
                      : ''
                  }`}
                  onClick={() =>
                    dispatch(setActiveItem({ type: 'SECTION', id: section.id }))
                  }
                >
                  📚 {section.title}
                </div>
              )}

              {!isView && (
                <div className={styles.actions}>
                  <button
                    onClick={() =>
                      startEdit('SECTION', section.id, section.title)
                    }
                  >
                    ✏️
                  </button>
                  <button onClick={() => dispatch(deleteSection(section.id))}>
                    🗑
                  </button>
                </div>
              )}
            </div>

            {!isView && (
              <div className={styles.controls}>
                <button
                  onClick={() =>
                    dispatch(
                      addLesson({
                        sectionId: section.id,
                        title: 'New lesson'
                      })
                    )
                  }
                >
                  + Урок
                </button>
              </div>
            )}

            {section.lessons?.length > 0 && (
              <ul className={styles.sublist}>
                {section.lessons.map(lesson => (
                  <li key={lesson.id}>
                    <div className={styles.row}>
                      {!isView &&
                      editing?.type === 'LESSON' &&
                      editing.id === lesson.id ? (
                        <InlineInput />
                      ) : (
                        <div
                          className={`${styles.item} ${
                            activeItem?.type === 'LESSON' &&
                            activeItem.id === lesson.id
                              ? styles.active
                              : ''
                          }`}
                          onClick={() =>
                            dispatch(
                              setActiveItem({
                                type: 'LESSON',
                                id: lesson.id
                              })
                            )
                          }
                        >
                          📘 {lesson.title}
                        </div>
                      )}

                      {!isView && (
                        <div className={styles.actions}>
                          <button
                            onClick={() =>
                              startEdit('LESSON', lesson.id, lesson.title)
                            }
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => dispatch(deleteLesson(lesson.id))}
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </div>

                    {lesson.test && (
                      <ul className={styles.sublist}>
                        <li>
                          <div
                            className={`${styles.item} ${styles.test}`}
                            onClick={() =>
                              dispatch(
                                setActiveItem({
                                  type: 'TEST',
                                  id: lesson.test.id
                                })
                              )
                            }
                          >
                            🧪 {lesson.test.title}
                          </div>
                        </li>
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
