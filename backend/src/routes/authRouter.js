const router = require('express').Router()
const authController = require('../controllers/authController')
const auth = require('../middlewares/authMiddleware')

router.post('/register', authController.register)
router.post('/login', authController.login)
router.post('/refresh', authController.refresh)
router.post('/logout', authController.logout)

// ✅ НОВОЕ
router.get('/me', auth, authController.me)

module.exports = router
