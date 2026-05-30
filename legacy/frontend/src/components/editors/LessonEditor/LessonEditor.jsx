import { useDispatch, useSelector } from 'react-redux'
import { useEffect, useState } from 'react'
import styles from './LessonEditor.module.scss'
import { updateLesson } from '../../../store/courseBuilder/courseBuilderThunks'

// ===== helpers =====
const toEmbedUrl = url => {
  if (!url) return ''

  try {
    if (url.includes('youtube.com/watch')) {
      const id = new URL(url).searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : ''
    }

    if (url.includes('youtu.be/')) {
      const id = url.split('youtu.be/')[1]
      return `https://www.youtube.com/embed/${id}`
    }

    if (url.includes('vimeo.com')) {
      const id = url.split('vimeo.com/')[1]
      return `https://player.vimeo.com/video/${id}`
    }
  } catch {
    return ''
  }

  return ''
}

export default function LessonEditor () {
  const dispatch = useDispatch()
  const { activeItem, sections } = useSelector(state => state.courseBuilder)

  // ===== find lesson from source of truth =====
  const lesson = sections
    .flatMap(section => section.lessons || [])
    .find(l => l.id === activeItem?.id)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [videoUrl, setVideoUrl] = useState('')

  // ===== sync local state =====
  useEffect(() => {
    if (!lesson) return

    setTitle(lesson.title || '')
    setContent(lesson.content || '')
    setVideoUrl(lesson.videoUrl || '')
  }, [lesson])

  if (!activeItem || activeItem.type !== 'LESSON' || !lesson) {
    return <div className={styles.empty}>Выберите урок слева 👈</div>
  }

  const handleSave = () => {
    dispatch(
      updateLesson({
        id: lesson.id,
        data: {
          title,
          content,
          videoUrl
        }
      })
    )
  }

  return (
    <div className={styles.editor}>
      {/* ===== HEADER ===== */}
      <div className={styles.header}>
        <input
          className={styles.title}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder='Название урока'
        />

        <button className={styles.saveBtn} onClick={handleSave}>
          💾 Сохранить
        </button>
      </div>

      {/* ===== VIDEO ===== */}
      <div className={styles.videoBlock}>
        <label>Видео (YouTube / Vimeo)</label>

        <input
          placeholder='https://www.youtube.com/watch?v=...'
          value={videoUrl}
          onChange={e => setVideoUrl(e.target.value)}
        />

        {videoUrl && toEmbedUrl(videoUrl) && (
          <div className={styles.video}>
            <iframe
              src={toEmbedUrl(videoUrl)}
              title='Lesson video'
              frameBorder='0'
              allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
              allowFullScreen
            />
          </div>
        )}
      </div>

      {/* ===== CONTENT ===== */}
      <div className={styles.content}>
        <label>Текст урока</label>
        <textarea
          rows={14}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder='Введите текст урока...'
        />
      </div>
    </div>
  )
}
