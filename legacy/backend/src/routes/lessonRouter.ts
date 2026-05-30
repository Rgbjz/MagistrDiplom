import { Router } from 'express'

import auth from '../middlewares/authMiddleware'
import role from '../middlewares/roleMiddleware'
import lessonController from '../controllers/lessonController'

const router = Router()

// ===== GET ONE LESSON =====
// GET /api/lessons/:id
router.get('/:id', auth, lessonController.getLesson)

// ===== CREATE LESSON (TEACHER) =====
// POST /api/lessons/:sectionId
router.post(
  '/:sectionId',
  auth,
  role(['TEACHER']),
  lessonController.createLesson
)

// ===== UPDATE LESSON (TEACHER) =====
// PATCH /api/lessons/:id
router.patch('/:id', auth, role(['TEACHER']), lessonController.updateLesson)

// ===== DELETE LESSON (TEACHER) =====
// DELETE /api/lessons/:id
router.delete('/:id', auth, role(['TEACHER']), lessonController.deleteLesson)

// ===== COMPLETE LESSON (STUDENT) =====
// POST /api/lessons/:id/complete
router.post(
  '/:id/complete',
  auth,
  role(['STUDENT']),
  lessonController.completeLesson
)

export default router
