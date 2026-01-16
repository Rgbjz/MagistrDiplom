import { useDispatch, useSelector } from 'react-redux'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// builder (структура)
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
} from '../../../store/courseBuilder/courseBuilderThunks'

// курс как сущность
import { updateCourse, deleteCourse } from '../../../store/course/courseThunks'

import { setActiveItem } from '../../../store/courseBuilder/courseBuilderSlice'
import styles from './CourseBuilder.module.scss'

export default function StructurePanel () {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { course, sections, activeItem } = useSelector(
    state => state.courseBuilder
  )

  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')

  if (!course) {
    return <aside className={styles.left}>Loading...</aside>
  }

  const handleDeleteCourse = async () => {
    try {
      if (!window.confirm('Удалить курс безвозвратно?')) return

      await dispatch(deleteCourse(course.id)).unwrap()
      navigate('/')
    } catch (e) {
      console.error('Failed to delete course', e)
    }
  }

  const startEdit = (type, id, title) => {
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
      {/* ===== COURSE ===== */}
      <div className={styles.header}>
        <div className={styles.row}>
          {editing?.type === 'COURSE' ? (
            <InlineInput />
          ) : (
            <h3>{course.title}</h3>
          )}

          <div className={styles.actions}>
            <button
              onClick={() => startEdit('COURSE', course.id, course.title)}
            >
              ✏️
            </button>
            <button onClick={handleDeleteCourse}>🗑</button>
          </div>
        </div>
      </div>

      {/* ===== ADD SECTION ===== */}
      <button
        className={styles.addBtn}
        onClick={() =>
          dispatch(addSection({ courseId: course.id, title: 'New section' }))
        }
      >
        + Добавить раздел
      </button>

      {/* ===== STRUCTURE ===== */}
      <ul className={styles.tree}>
        {sections.map(section => (
          <li key={section.id} className={styles.section}>
            <div className={styles.row}>
              {editing?.type === 'SECTION' && editing.id === section.id ? (
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
            </div>

            {/* ADD LESSON */}
            <div className={styles.controls}>
              <button
                onClick={() =>
                  dispatch(
                    addLesson({ sectionId: section.id, title: 'New lesson' })
                  )
                }
              >
                + Урок
              </button>
            </div>

            {/* LESSONS */}
            {section.lessons?.length > 0 && (
              <ul className={styles.sublist}>
                {section.lessons.map(lesson => (
                  <li key={lesson.id}>
                    <div className={styles.row}>
                      {editing?.type === 'LESSON' &&
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
                    </div>

                    {!lesson.test && (
                      <button
                        className={styles.smallBtn}
                        onClick={() =>
                          dispatch(
                            addTest({ lessonId: lesson.id, title: 'Test' })
                          )
                        }
                      >
                        + Тест
                      </button>
                    )}

                    {lesson.test && (
                      <ul className={styles.sublist}>
                        <li>
                          <div className={styles.row}>
                            {editing?.type === 'TEST' &&
                            editing.id === lesson.test.id ? (
                              <InlineInput />
                            ) : (
                              <div
                                className={`${styles.item} ${styles.test} ${
                                  activeItem?.type === 'TEST' &&
                                  activeItem.id === lesson.test.id
                                    ? styles.active
                                    : ''
                                }`}
                                onClick={() =>
                                  dispatch(
                                    setActiveItem({
                                      type: 'TEST',
                                      id: lesson.test.id
                                    })
                                  )
                                }
                              >
                                🧪 {lesson.test.title ?? 'test'}
                              </div>
                            )}

                            <div className={styles.actions}>
                              <button
                                onClick={() =>
                                  startEdit(
                                    'TEST',
                                    lesson.test.id,
                                    lesson.test.title ?? 'test'
                                  )
                                }
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() =>
                                  dispatch(deleteTest(lesson.test.id))
                                }
                              >
                                🗑
                              </button>
                            </div>
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
