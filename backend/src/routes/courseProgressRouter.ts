import { Router } from 'express'

import courseProgressController from '../controllers/courseProgressController'
import authMiddleware from '../middlewares/authMiddleware'
import roleMiddleware from '../middlewares/roleMiddleware'

const router = Router()

router.get(
  '/courses/:courseId/progress',
  authMiddleware,
  courseProgressController.getMyProgress
)

router.get(
  '/courses/:courseId/progress/:userId',
  authMiddleware,
  roleMiddleware(['TEACHER', 'ADMIN']),
  courseProgressController.getUserProgress
)

router.post(
  '/lessons/:lessonId/complete',
  authMiddleware,
  courseProgressController.completeLesson
)

router.post(
  '/lessons/:lessonId/start',
  authMiddleware,
  courseProgressController.startLesson
)

export default router
