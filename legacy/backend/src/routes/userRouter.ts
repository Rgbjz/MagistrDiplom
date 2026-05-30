import { Router } from 'express'

import auth from '../middlewares/authMiddleware'
import controller from '../controllers/userController'
import uploadFactory from '../middlewares/uploadFactory'

const router = Router()

const uploadAvatar = uploadFactory('avatars', { maxSizeMB: 2 })

router.get('/me', auth, controller.getMe)

router.put(
  '/me/profile',
  auth,
  uploadAvatar.single('avatar'),
  controller.updateProfile
)

router.get('/me/courses', auth, controller.getMyCourses)

export default router
