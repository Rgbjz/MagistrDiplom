import { Response, NextFunction } from 'express'
import { UserRole } from '../constants'
import { AuthRequest } from '../types/auth'

export default (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    next()
  }
}
