import { Response, NextFunction } from 'express'

import { verifyAccessToken } from '../utils/jwt'
import { AuthRequest } from '../types/auth'

export default (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    const user = verifyAccessToken(token)

    req.user = user
    next()
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}
