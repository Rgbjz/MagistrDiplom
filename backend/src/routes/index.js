const router = require('express').Router()

router.use('/auth', require('./authRouter'))
router.use('/users', require('./userRouter'))
router.use('/courses', require('./courseRouter'))
router.use('/sections', require('./sectionRouter'))
router.use('/lessons', require('./lessonRouter'))
router.use('/tests', require('./testRouter'))

module.exports = router
