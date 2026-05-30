import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../../store/auth/authSlice'
import { clearUser } from '../../store/user/userSlice'
import { Link } from 'react-router-dom'
import { getAvatarUrl } from '../../utils/getAvatarUrl'
import styles from './Header.module.scss'

export default function Header () {
  const dispatch = useDispatch()
  const user = useSelector(state => state.user.user)

  if (!user) {
    return <header className={styles.header} />
  }

  const { email, role, profile } = user
  const avatarUrl = profile?.avatarUrl

  const onLogout = () => {
    dispatch(logout())
    dispatch(clearUser())
  }

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link to='/'>Courses</Link>

        {role === 'TEACHER' && (
          <Link to='/teacher/courses/new'>Create course</Link>
        )}

        <Link to='/profile'>Profile</Link>
      </nav>

      <div className={styles.user}>
        <div className={styles.avatar}>
          {avatarUrl ? (
            <img src={getAvatarUrl(avatarUrl)} alt='avatar' />
          ) : (
            <span>{email.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <span className={styles.name}>{email}</span>
        <button onClick={onLogout}>Logout</button>
      </div>
    </header>
  )
}
