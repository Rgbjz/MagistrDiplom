import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  startLesson,
  completeLesson
} from '../../../store/courseProgress/courseProgressThunks'
import styles from './LessonViewer.module.scss'

export default function LessonViewer ({ lessonId }) {
  const dispatch = useDispatch()
  const playerRef = useRef(null)

  const lesson = useSelector(state =>
    state.courseBuilder.sections
      .flatMap(s => s.lessons || [])
      .find(l => l.id === lessonId)
  )

  const lessonStatus = useSelector(
    state => state.courseProgress.my?.lessons?.[lessonId]
  )

  // ▶️ START LESSON (один раз)
  useEffect(() => {
    if (!lesson) return
    if (lessonStatus) return // уже started или completed

    dispatch(startLesson(lessonId))
  }, [lesson, lessonId, lessonStatus, dispatch])

  if (!lesson) {
    return <p className={styles.empty}>Урок не найден</p>
  }

  const youtubeId = lesson.videoUrl?.includes('youtube')
    ? new URL(lesson.videoUrl).searchParams.get('v')
    : null

  // ▶️ YOUTUBE API
  useEffect(() => {
    if (!youtubeId) return

    const initPlayer = () => {
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: youtubeId,
        events: {
          onStateChange: e => {
            if (
              e.data === window.YT.PlayerState.ENDED &&
              lessonStatus !== 'COMPLETED'
            ) {
              dispatch(completeLesson(lessonId))
            }
          }
        }
      })
    }

    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      window.onYouTubeIframeAPIReady = initPlayer
      document.body.appendChild(tag)
    } else {
      initPlayer()
    }
  }, [youtubeId, lessonId, lessonStatus, dispatch])

  return (
    <div className={styles.lesson}>
      <h2 className={styles.title}>{lesson.title}</h2>

      {youtubeId && (
        <div className={styles.videoWrapper}>
          <div id='yt-player' />
        </div>
      )}

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
