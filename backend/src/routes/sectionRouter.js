const router = require('express').Router()
const sectionController = require('../controllers/sectionController')
const auth = require('../middlewares/authMiddleware')
const role = require('../middlewares/roleMiddleware')

// ✅ только преподаватель
router.use(auth, role('TEACHER'))

// создать секцию
router.post('/:courseId', sectionController.create)

// обновить секцию
router.patch('/:id', sectionController.update)

// удалить секцию
router.delete('/:id', sectionController.remove)

module.exports = router
