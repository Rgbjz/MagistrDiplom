import { Router } from 'express'

import auth from '../middlewares/authMiddleware'
import role from '../middlewares/roleMiddleware'
import courseController from '../controllers/courseController'
import uploadFactory from '../middlewares/uploadFactory'

const router = Router()

const uploadCourseImage = uploadFactory('courses', { maxSizeMB: 5 })

// ===== COURSES =====
router.post(
  '/',
  auth,
  role(['TEACHER', 'ADMIN']),
  uploadCourseImage.single('image'),
  courseController.createCourse
)

router.patch(
  '/:id',
  auth,
  role(['TEACHER', 'ADMIN']),
  uploadCourseImage.single('image'),
  courseController.updateCourse
)

router.get('/:id', auth, courseController.getCourse)

router.get('/', auth, courseController.getCourses)

router.get(
  '/:courseId/students/progress',
  auth,
  role(['TEACHER', 'ADMIN']),
  courseController.getStudentsProgress
)

// ===== ENROLLMENT =====
router.post(
  '/:id/enroll',
  auth,
  role(['STUDENT']),
  courseController.requestEnroll
)

router.post(
  '/:id/enroll/:userId/approve',
  auth,
  role(['TEACHER', 'ADMIN']),
  courseController.approveEnroll
)

router.post(
  '/:id/enroll/:userId/reject',
  auth,
  role(['TEACHER', 'ADMIN']),
  courseController.rejectEnroll
)

router.get(
  '/:id/enrollments',
  auth,
  role(['TEACHER', 'ADMIN']),
  courseController.getEnrollments
)

router.delete(
  '/:id',
  auth,
  role(['TEACHER', 'ADMIN']),
  courseController.deleteCourse
)

export default router
