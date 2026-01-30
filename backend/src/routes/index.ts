import { Router } from 'express'

import authRouter from './authRouter'
import userRouter from './userRouter'
import courseRouter from './courseRouter'
import sectionRouter from './sectionRouter'
import lessonRouter from './lessonRouter'
import testRouter from './testRouter'
import courseProgressRouter from './courseProgressRouter'

const router = Router()

router.use('/auth', authRouter)
router.use('/users', userRouter)
router.use('/courses', courseRouter)
router.use('/sections', sectionRouter)
router.use('/lessons', lessonRouter)
router.use('/tests', testRouter)
router.use('/courseProgress', courseProgressRouter)

export default router
