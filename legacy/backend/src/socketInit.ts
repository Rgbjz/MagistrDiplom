import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'

// const ChatController = require('./controllers/sockets/ChatController')
// const NotificationController = require('./controllers/sockets/NotificationController')

let ioInstance: Server | null = null
// let chatController: any = null
// let notificationController: any = null

const cors = {
  origin: 'http://localhost:3000',
  credentials: true
}

// ==========================
// Init socket.io
// ==========================
export const createConnection = (httpServer: HttpServer): Server => {
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
// Getters
// ==========================
// export const getChatController = () => chatController
// export const getNotificationController = () => notificationController

export const getIO = (): Server | null => ioInstance
