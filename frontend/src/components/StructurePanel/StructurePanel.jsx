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

import ProgressBar from '../ProgressBar/ProgressBar'
import ProgressIcon from '../ProgressIcon/ProgressIcon'
import { calculateProgress } from '../../utils/courseProgress'

import styles from './StructurePanel.module.scss'

export default function StructurePanel ({ mode = 'edit' }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const { course, sections, activeItem } = useSelector(
    state => state.courseBuilder
  )

  const progress = useSelector(state => state.courseProgress.my)
  const user = useSelector(state => state.user.user)

  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')

  const isView = mode === 'view'
  const isStudent = user?.role === 'STUDENT'
  const isOwner = user?.id === course?.teacherId || user?.role === 'ADMIN'

  if (!course) {
    return <aside className={styles.left}>Loading...</aside>
  }

  /* ===== PROGRESS ===== */
  const progressValue =
    isStudent && progress ? calculateProgress(sections, progress) : 0

  /* ===== EDIT ===== */
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

  /* ===== DELETE COURSE ===== */
  const handleDeleteCourse = async () => {
    if (!window.confirm('Удалить курс безвозвратно?')) return
    await dispatch(deleteCourse(course.id))
    navigate('/')
  }

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
              {isStudent && <ProgressIcon completed={progressValue === 100} />}
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

        {isStudent && <ProgressBar value={progressValue} />}

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
        {sections.map(section => {
          const sectionDone =
            isStudent &&
            section.lessons?.length > 0 &&
            section.lessons.every(lesson => {
              const lessonCompleted =
                progress?.lessons?.[lesson.id] === 'COMPLETED'

              const testCompleted =
                !lesson.test ||
                progress?.tests?.[lesson.test.id] === 'COMPLETED'

              return lessonCompleted && testCompleted
            })

          return (
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
                      dispatch(
                        setActiveItem({ type: 'SECTION', id: section.id })
                      )
                    }
                  >
                    {isStudent && <ProgressIcon completed={sectionDone} />}
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
                  {section.lessons.map(lesson => {
                    const lessonDone =
                      isStudent &&
                      progress?.lessons?.[lesson.id] === 'COMPLETED'

                    return (
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
                              {isStudent && (
                                <ProgressIcon completed={lessonDone} />
                              )}
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
                                onClick={() =>
                                  dispatch(deleteLesson(lesson.id))
                                }
                              >
                                🗑
                              </button>
                            </div>
                          )}
                        </div>

                        {/* ===== TEST ===== */}
                        {lesson.test ? (
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
                                  id: lesson.test.id,
                                  lessonId: lesson.id
                                })
                              )
                            }
                          >
                            {isStudent && (
                              <ProgressIcon
                                completed={
                                  progress?.tests?.[lesson.test.id] ===
                                  'COMPLETED'
                                }
                              />
                            )}
                            🧪 {lesson.test.title}
                          </div>
                        ) : (
                          !isView && (
                            <button
                              className={styles.addTestBtn}
                              onClick={() =>
                                dispatch(addTest({ lessonId: lesson.id }))
                              }
                            >
                              + Тест
                            </button>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
