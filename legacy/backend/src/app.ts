import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'

import router from './routes'
import handlerError from './handlerError/handler'

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

export default app
