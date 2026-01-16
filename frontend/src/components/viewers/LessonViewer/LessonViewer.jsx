import { useSelector } from 'react-redux'
import styles from './LessonViewer.module.scss'

export default function LessonViewer ({ lessonId }) {
  const lesson = useSelector(state =>
    state.courseBuilder.sections
      .flatMap(s => s.lessons || [])
      .find(l => l.id === lessonId)
  )

  if (!lesson) {
    return <p className={styles.empty}>Урок не найден</p>
  }

  const youtubeId = lesson.videoUrl?.includes('youtube')
    ? new URL(lesson.videoUrl).searchParams.get('v')
    : null

  return (
    <div className={styles.lesson}>
      <h2 className={styles.title}>{lesson.title}</h2>

      {/* VIDEO */}
      {youtubeId && (
        <div className={styles.videoWrapper}>
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title={lesson.title}
            frameBorder='0'
            allowFullScreen
          />
        </div>
      )}

      {/* CONTENT */}
      {lesson.content ? (
        <div
          className={styles.content}
          dangerouslySetInnerHTML={{ __html: lesson.content }}
        />
      ) : (
        <p className={styles.empty}>Контент урока отсутствует</p>
      )}
    </div>
  )
}
