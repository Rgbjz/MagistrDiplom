'use strict'

const ApiError = require('../utils/ApiError')
const { ValidationError } = require('sequelize')

module.exports = (err, req, res, next) => {
  console.error('🔥 ERROR:', err)

  // ===== Sequelize validation errors =====
  if (err instanceof ValidationError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    })
  }

  // ===== Our custom ApiError =====
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      message: err.message,
      errors: err.errors || null
    })
  }

  // ===== JWT errors =====
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Invalid or expired token'
    })
  }

  // ===== Fallback =====
  return res.status(500).json({
    message: 'Unexpected server error'
  })
}
