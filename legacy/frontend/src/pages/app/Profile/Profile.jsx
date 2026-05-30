import { useDispatch, useSelector } from 'react-redux'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import { updateProfile } from '../../../store/user/userThunks'
import { profileSchema } from '../../../validation/profileSchema'
import { getAvatarUrl } from '../../../utils/getAvatarUrl'
import styles from './Profile.module.scss'

export default function Profile () {
  const dispatch = useDispatch()
  const { user, loading } = useSelector(state => state.user)

  const profile = user?.profile

  if (!user || !profile) {
    return <p className={styles.loading}>Loading profile...</p>
  }

  return (
    <div className={styles.profile}>
      <h1>Profile</h1>

      <Formik
        enableReinitialize
        initialValues={{
          firstName: profile.firstName ?? '',
          lastName: profile.lastName ?? '',
          bio: profile.bio ?? '',
          avatar: null
        }}
        validationSchema={profileSchema}
        onSubmit={values => {
          const fd = new FormData()
          fd.append('firstName', values.firstName)
          fd.append('lastName', values.lastName)
          fd.append('bio', values.bio)

          if (values.avatar) {
            fd.append('avatar', values.avatar)
          }

          dispatch(updateProfile(fd))
        }}
      >
        {({ setFieldValue }) => (
          <Form className={styles.form}>
            {/* ===== AVATAR ===== */}
            <div className={styles.avatarBlock}>
              <div className={styles.avatar}>
                {profile.avatarUrl ? (
                  <img src={getAvatarUrl(profile.avatarUrl)} alt='avatar' />
                ) : (
                  <span>{user.email.charAt(0).toUpperCase()}</span>
                )}
              </div>

              <input
                type='file'
                accept='image/*'
                onChange={e =>
                  setFieldValue('avatar', e.currentTarget.files[0])
                }
              />
              <ErrorMessage
                name='avatar'
                component='div'
                className={styles.error}
              />
            </div>

            {/* ===== EMAIL ===== */}
            <div className={styles.field}>
              <label>Email</label>
              <input value={user.email} disabled />
            </div>

            {/* ===== FIRST NAME ===== */}
            <div className={styles.field}>
              <label>First name</label>
              <Field name='firstName' />
              <ErrorMessage
                name='firstName'
                component='div'
                className={styles.error}
              />
            </div>

            {/* ===== LAST NAME ===== */}
            <div className={styles.field}>
              <label>Last name</label>
              <Field name='lastName' />
              <ErrorMessage
                name='lastName'
                component='div'
                className={styles.error}
              />
            </div>

            {/* ===== BIO ===== */}
            <div className={styles.field}>
              <label>Bio</label>
              <Field as='textarea' rows={4} name='bio' />
              <ErrorMessage
                name='bio'
                component='div'
                className={styles.error}
              />
            </div>

            <button type='submit' disabled={loading} className={styles.button}>
              {loading ? 'Saving...' : 'Save changes'}
            </button>
          </Form>
        )}
      </Formik>
    </div>
  )
}
