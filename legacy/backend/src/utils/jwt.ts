import jwt, { JwtPayload } from 'jsonwebtoken'
import config from '../config/jwt'
import { AuthUser } from '../types/auth'

type TokenPayload = AuthUser & {
  email?: string // если хочешь хранить email в токене
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.accessSecret, {
    expiresIn: config.accessExpiresIn
  })
}

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.refreshSecret, {
    expiresIn: config.refreshExpiresIn
  })
}

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.accessSecret) as TokenPayload
}

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.refreshSecret) as TokenPayload
}
