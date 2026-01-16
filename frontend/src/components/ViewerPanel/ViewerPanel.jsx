import { useSelector } from 'react-redux'
import styles from './ViewerPanel.module.scss'

import LessonViewer from '../viewers/LessonViewer/LessonViewer'
import TestViewer from '../viewers/TestViewer/TestViewer'

export default function ViewerPanel () {
  const activeItem = useSelector(state => state.courseBuilder.activeItem)

  if (!activeItem) {
    return (
      <div className={styles.right}>
        <p className={styles.empty}>Выберите урок или тест слева 👈</p>
      </div>
    )
  }

  if (activeItem.type === 'SECTION') {
    return (
      <div className={styles.right}>
        <p className={styles.empty}>📚 Раздел — это контейнер для уроков</p>
      </div>
    )
  }

  return (
    <div className={styles.right}>
      {activeItem.type === 'LESSON' && (
        <LessonViewer lessonId={activeItem.id} />
      )}

      {activeItem.type === 'TEST' && <TestViewer testId={activeItem.id} />}
    </div>
  )
}
