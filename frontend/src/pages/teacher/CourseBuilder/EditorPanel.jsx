import { useSelector } from 'react-redux'
import styles from './CourseBuilder.module.scss'

import LessonEditor from './editors/LessonEditor/LessonEditor'
import TestEditor from './editors/TestEditor/TestEditor'

export default function EditorPanel () {
  const activeItem = useSelector(state => state.courseBuilder.activeItem)

  if (!activeItem) {
    return (
      <div className={styles.right}>
        <p className={styles.empty}>Выберите урок или тест слева 👈</p>
      </div>
    )
  }

  // ❗ SECTION — без редактора
  if (activeItem.type === 'SECTION') {
    return (
      <div className={styles.right}>
        <p className={styles.empty}>
          📚 Раздел — это только контейнер для уроков
        </p>
      </div>
    )
  }

  return (
    <div className={styles.right}>
      {activeItem.type === 'LESSON' && (
        <LessonEditor lessonId={activeItem.id} />
      )}

      {activeItem.type === 'TEST' && <TestEditor testId={activeItem.id} />}
    </div>
  )
}
