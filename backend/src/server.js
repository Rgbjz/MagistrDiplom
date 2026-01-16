'use strict'

const http = require('http')
require('dotenv').config()

const app = require('./app')
// const controller = require('./socketInit')
// const { logError } = require('./utils/logger')
// const initLogArchiverCron = require('./utils/logArchiverCron')

const PORT = process.env.PORT || 3000

// =====================
// Process handlers
// =====================
// process.on('uncaughtException', async err => {
//   console.error('uncaughtException', err)
//   await logError(err, 500, {
//     fatal: true,
//     source: 'uncaughtException'
//   })
// })

// process.on('unhandledRejection', async reason => {
//   console.error('unhandledRejection', reason)
//   await logError(reason, 500, {
//     fatal: true,
//     source: 'unhandledRejection'
//   })
// })

// =====================
// Cron jobs
// =====================
// initLogArchiverCron()

// =====================
// HTTP server
// =====================
const server = http.createServer(app)

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`)
})

// =====================
// WebSocket
// =====================
// controller.createConnection(server)
