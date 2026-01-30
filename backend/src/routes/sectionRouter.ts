import { Router } from 'express'

import sectionController from '../controllers/sectionController'
import auth from '../middlewares/authMiddleware'
import role from '../middlewares/roleMiddleware'

const router = Router()

// ✅ только преподаватель
router.use(auth, role(['TEACHER']))

// создать секцию
router.post('/:courseId', sectionController.create)

// обновить секцию
router.patch('/:id', sectionController.update)

// удалить секцию
router.delete('/:id', sectionController.remove)

export default router
