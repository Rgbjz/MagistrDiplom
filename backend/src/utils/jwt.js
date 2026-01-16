const jwt = require('jsonwebtoken')
const config = require('../config/jwt')

const generateAccessToken = payload => {
  return jwt.sign(payload, config.accessSecret, {
    expiresIn: config.accessExpiresIn
  })
}

const generateRefreshToken = payload => {
  return jwt.sign(payload, config.refreshSecret, {
    expiresIn: config.refreshExpiresIn
  })
}

const verifyAccessToken = token => {
  return jwt.verify(token, config.accessSecret)
}

const verifyRefreshToken = token => {
  return jwt.verify(token, config.refreshSecret)
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
}
