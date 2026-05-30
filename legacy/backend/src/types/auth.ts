import type { Request } from 'express'
import type { UserRole } from '../constants'

export interface AuthUser {
  id: number
  email: string
  role: UserRole
}

export interface AuthRequest extends Request {
  user?: AuthUser

  // multer
  file?: Express.Multer.File
  files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>
}
