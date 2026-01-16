'use strict'

const { verifyAccessToken } = require('../utils/jwt')

module.exports = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token

    if (!token) {
      return next(new Error('Unauthorized'))
    }

    socket.user = verifyAccessToken(token)
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
}
