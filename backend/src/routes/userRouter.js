const router = require('express').Router()
const auth = require('../middlewares/authMiddleware')
const controller = require('../controllers/userController')
const uploadFactory = require('../middlewares/uploadFactory')

const uploadAvatar = uploadFactory('avatars', { maxSizeMB: 2 })

router.get('/me', auth, controller.getMe)

router.put(
  '/me/profile',
  auth,
  uploadAvatar.single('avatar'),
  controller.updateProfile
)

router.get('/me/courses', auth, controller.getMyCourses)

module.exports = router
