import { useSelector } from 'react-redux'
import styles from './TestViewer.module.scss'

export default function TestViewer ({ testId }) {
  const test = useSelector(state =>
    state.courseBuilder.sections
      .flatMap(s => s.lessons || [])
      .map(l => l.test)
      .find(t => t?.id === testId)
  )

  if (!test) {
    return <p className={styles.empty}>Тест не найден</p>
  }

  return (
    <div className={styles.test}>
      <h2 className={styles.title}>{test.title}</h2>

      <div className={styles.meta}>
        <p>⏱ Время на прохождение: {test.timeLimit} минут</p>
        <p>✅ Проходной балл: {test.passingScore}%</p>
      </div>

      <button className={styles.startBtn}>Начать тест</button>
    </div>
  )
}
