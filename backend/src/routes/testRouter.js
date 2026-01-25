const router = require('express').Router()

const auth = require('../middlewares/authMiddleware')
const role = require('../middlewares/roleMiddleware')

const testController = require('../controllers/testController')

// ===== TEST =====
router.get('/:id', auth, testController.getTest)

router.post(
  '/:lessonId',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.createTest
)

router.patch(
  '/:id',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.updateTest
)

// ===== QUESTIONS =====
router.post(
  '/:id/questions',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.createQuestion
)

router.patch(
  '/questions/:questionId',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.updateQuestion
)

router.delete(
  '/questions/:questionId',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.deleteQuestion
)

// ===== ANSWERS =====
router.post(
  '/questions/:questionId/answers',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.createAnswer
)

router.patch(
  '/answers/:answerId',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.updateAnswer
)

router.delete(
  '/answers/:answerId',
  auth,
  role(['TEACHER', 'ADMIN']),
  testController.deleteAnswer
)

router.get(
  '/:testId/my-result',
  auth,
  role(['STUDENT']),
  testController.getMyTestResult
)

router.get(
  '/:testId/results',
  auth,
  role(['TEACHER']),
  testController.getTestResults
)

// ===== PASS TEST =====
router.post('/:id/start', auth, role(['STUDENT']), testController.startTest)

router.post('/:id/submit', auth, role(['STUDENT']), testController.submitTest)

module.exports = router
