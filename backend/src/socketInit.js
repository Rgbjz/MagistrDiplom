'use strict'

const { Server } = require('socket.io')

// const ChatController = require('./controllers/sockets/ChatController')
// const NotificationController = require('./controllers/sockets/NotificationController')

let ioInstance = null
// let chatController = null
// let notificationController = null

const cors = {
  origin: 'http://localhost:3000',
  credentials: true
}

// ==========================
// Init socket.io
// ==========================
const createConnection = httpServer => {
  if (ioInstance) return ioInstance

  const io = new Server(httpServer, { cors })
  ioInstance = io

  // ===== Controllers =====
  // notificationController = new NotificationController()
  // notificationController.connect('/notifications', io)

  // chatController = new ChatController()
  // chatController.connect('/chat', io)

  console.log('🔌 Socket.io initialized')

  return io
}

// ==========================
// Getters (optional, but ok)
// ==========================
const getChatController = () => chatController
const getNotificationController = () => notificationController
const getIO = () => ioInstance

module.exports = {
  createConnection,
  getChatController,
  getNotificationController,
  getIO
}
