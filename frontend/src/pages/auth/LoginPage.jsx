import { useDispatch, useSelector } from 'react-redux'
import { useState, useEffect } from 'react'
import { login } from '../../store/auth/authThunks'
import { Link, useNavigate } from 'react-router-dom'
import styles from './AuthForm.module.scss'

export default function LoginPage () {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error, isAuth } = useSelector(state => state.auth)

  const [form, setForm] = useState({
    email: '',
    password: ''
  })

  useEffect(() => {
    if (isAuth) navigate('/')
  }, [isAuth, navigate])

  const submit = e => {
    e.preventDefault()
    dispatch(login(form))
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={submit}>
        <h1>Login</h1>

        <input
          className={styles.input}
          placeholder='Email'
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          required
        />

        <input
          className={styles.input}
          type='password'
          placeholder='Password'
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          required
        />

        <button className={styles.button} disabled={loading}>
          {loading ? 'Loading...' : 'Login'}
        </button>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.switch}>
          No account? <Link to='/register'>Register</Link>
        </p>
      </form>
    </div>
  )
}
