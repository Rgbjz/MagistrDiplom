const { verifyAccessToken } = require('../utils/jwt')

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization
  console.log('decoded user:', req.user)
  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    req.user = verifyAccessToken(token)
    console.log('decoded user:', req.user)
    next()
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}
