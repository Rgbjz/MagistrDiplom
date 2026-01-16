'use strict'

const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('path')

const router = require('./routes/index.js')
const handlerError = require('./handlerError/handler')

const app = express()

// =====================
// Middlewares
// =====================
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true
  })
)
app.use(express.static(path.join(__dirname, 'public')))
app.use(cookieParser())
app.use(express.json())

// =====================
// Static files
// =====================
app.use('/public', express.static(path.join(__dirname, 'public')))

// =====================
// Routes
// =====================
app.use('/api', router)

// =====================
// Error handler (last)
// =====================
app.use(handlerError)

module.exports = app
