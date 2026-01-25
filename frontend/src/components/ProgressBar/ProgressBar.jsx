import styles from './ProgressBar.module.scss'

export default function ProgressBar ({ value }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        Прогресс: <strong>{value}%</strong>
      </div>

      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}
