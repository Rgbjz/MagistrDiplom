import styles from './ProgressIcon.module.scss'

export default function ProgressIcon ({ completed }) {
  return (
    <span
      className={`${styles.icon} ${completed ? styles.done : styles.pending}`}
    >
      ✓
    </span>
  )
}
