const router = require('express').Router()
const auth = require('../middlewares/authMiddleware')
const role = require('../middlewares/roleMiddleware')
const controller = require('../controllers/lessonController')

// ===== GET ONE LESSON =====
// GET /api/lessons/:id
router.get('/:id', auth, controller.getLesson)

// ===== CREATE LESSON (TEACHER) =====
// POST /api/lessons/:sectionId
router.post('/:sectionId', auth, role(['TEACHER']), controller.createLesson)

// ===== UPDATE LESSON (TEACHER) =====
// PUT /api/lessons/:id
router.patch('/:id', auth, role(['TEACHER']), controller.updateLesson)

// ===== DELETE LESSON (TEACHER) =====
// DELETE /api/lessons/:id
router.delete('/:id', auth, role(['TEACHER']), controller.deleteLesson)

// ===== COMPLETE LESSON (STUDENT) =====
// POST /api/lessons/:id/complete
router.post('/:id/complete', auth, role(['STUDENT']), controller.completeLesson)

module.exports = router
