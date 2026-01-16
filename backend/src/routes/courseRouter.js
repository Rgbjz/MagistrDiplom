const router = require('express').Router()

const auth = require('../middlewares/authMiddleware')
const role = require('../middlewares/roleMiddleware')
const controller = require('../controllers/courseController')
const uploadFactory = require('../middlewares/uploadFactory')

const uploadCourseImage = uploadFactory('courses', { maxSizeMB: 5 })

// ===== COURSES =====
router.post(
  '/',
  auth,
  role(['TEACHER', 'ADMIN']),
  uploadCourseImage.single('image'),
  controller.createCourse
)

router.patch(
  '/:id',
  auth,
  role(['TEACHER', 'ADMIN']),
  uploadCourseImage.single('image'), // можно добавить
  controller.updateCourse
)

router.get('/:id', auth, controller.getCourse)

router.get('/', auth, controller.getCourses)

// ===== ENROLLMENT =====
router.post('/:id/enroll', auth, role(['STUDENT']), controller.requestEnroll)

router.post(
  '/:id/enroll/:userId/approve',
  auth,
  role(['TEACHER', 'ADMIN']),
  controller.approveEnroll
)

router.post(
  '/:id/enroll/:userId/reject',
  auth,
  role(['TEACHER', 'ADMIN']),
  controller.rejectEnroll
)

router.delete('/:id', auth, role(['TEACHER', 'ADMIN']), controller.deleteCourse)

module.exports = router
