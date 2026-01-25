const Router = require('express')
const router = new Router()

const controller = require('../controllers/courseProgressController')
const authMiddleware = require('../middlewares/authMiddleware')
const roleMiddleware = require('../middlewares/roleMiddleware')

/**
 * ПРОГРЕСС ТЕКУЩЕГО СТУДЕНТА
 */
router.get(
  '/courses/:courseId/progress',
  authMiddleware,
  controller.getMyProgress
)

/**
 * ПРОГРЕСС КОНКРЕТНОГО СТУДЕНТА (учитель / админ)
 */
router.get(
  '/courses/:courseId/progress/:userId',
  authMiddleware,
  roleMiddleware(['TEACHER', 'ADMIN']),
  controller.getUserProgress
)

router.post(
  '/lessons/:lessonId/complete',
  authMiddleware,
  controller.completeLesson
)

router.post('/lessons/:id/start', authMiddleware, controller.startLesson)
module.exports = router
