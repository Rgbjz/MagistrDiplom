import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { useParams } from 'react-router-dom'
import { fetchCourse } from '../../../store/courseBuilder/courseBuilderThunks'
import StructurePanel from '../../../components/StructurePanel/StructurePanel'
import EditorPanel from './EditorPanel'
import styles from './CourseBuilder.module.scss'

export default function CourseBuilder () {
  const dispatch = useDispatch()
  const { id } = useParams()

  useEffect(() => {
    dispatch(fetchCourse(id))
  }, [dispatch, id])

  return (
    <div className={styles.builder}>
      <StructurePanel mode='edit' />
      <EditorPanel />
    </div>
  )
}
