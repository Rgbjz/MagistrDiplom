import type { Socket } from 'socket.io'
import type { ExtendedError } from 'socket.io/dist/namespace'

import { verifyAccessToken } from '../utils/jwt'

const socketAuthMiddleware = (socket: Socket, next: (err?: ExtendedError) => void) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined

    if (!token) {
      return next(new Error('Unauthorized'))
    }

    socket.user = verifyAccessToken(token)
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
}

export default socketAuthMiddleware
