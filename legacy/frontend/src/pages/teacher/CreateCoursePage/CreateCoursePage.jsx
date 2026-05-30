import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { createCourse } from '../../../store/courseBuilder/courseBuilderThunks'
import styles from './CreateCoursePage.module.scss'

export default function CreateCoursePage () {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '',
    description: '',
    image: null
  })

  const [previewImage, setPreviewImage] = useState(null)

  const onCreate = async () => {
    if (!form.title.trim()) return

    const fd = new FormData()
    fd.append('title', form.title)
    fd.append('description', form.description)

    if (form.image) {
      fd.append('image', form.image)
    }

    const course = await dispatch(createCourse(fd)).unwrap()
    navigate(`/teacher/courses/${course.id}/builder`)
  }

  const onImageChange = e => {
    const file = e.target.files[0]
    if (!file) return

    setForm({ ...form, image: file })
    setPreviewImage(URL.createObjectURL(file))
  }

  return (
    <div className={styles.wrapper}>
      {/* LEFT — FORM */}
      <div className={styles.left}>
        <h2>Create course</h2>

        <input
          placeholder='Course title'
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
        />

        <textarea
          placeholder='Course description'
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />

        <label className={styles.fileLabel}>
          Upload cover image
          <input type='file' accept='image/*' onChange={onImageChange} />
        </label>

        <button onClick={onCreate}>Create course</button>
      </div>

      {/* RIGHT — PREVIEW */}
      <div className={styles.right}>
        <div className={styles.previewCard}>
          <div className={styles.previewImage}>
            {previewImage ? (
              <img src={previewImage} alt='preview' />
            ) : (
              <div className={styles.imagePlaceholder}>Course cover</div>
            )}
          </div>

          <div className={styles.previewContent}>
            <h1>{form.title || 'Course title'}</h1>
            <p>{form.description || 'Course description'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
