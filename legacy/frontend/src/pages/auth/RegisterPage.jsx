import { useDispatch, useSelector } from 'react-redux'
import { useState, useEffect } from 'react'
import { register } from '../../store/auth/authThunks'
import { Link, useNavigate } from 'react-router-dom'
import styles from './AuthForm.module.scss'

export default function RegisterPage () {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error, isAuth } = useSelector(state => state.auth)

  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'STUDENT' // 👈 по умолчанию
  })

  useEffect(() => {
    if (isAuth) navigate('/')
  }, [isAuth, navigate])

  const submit = e => {
    e.preventDefault()
    dispatch(register(form))
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={submit}>
        <h1>Register</h1>

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

        {/* 🔽 ВЫБОР РОЛИ */}
        <select
          className={styles.input}
          value={form.role}
          onChange={e => setForm({ ...form, role: e.target.value })}
        >
          <option value='STUDENT'>Student</option>
          <option value='TEACHER'>Teacher</option>
        </select>

        <button className={styles.button} disabled={loading}>
          {loading ? 'Loading...' : 'Register'}
        </button>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.switch}>
          Already have an account? <Link to='/login'>Login</Link>
        </p>
      </form>
    </div>
  )
}
