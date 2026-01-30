import crypto from 'crypto'
import ms from 'ms'

import { User, UserProfile, Session } from '../db'

import { hashPassword, comparePassword } from '../utils/password'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from '../utils/jwt'
import ApiError from '../utils/ApiError'
import jwtConfig from '../config/jwt'

// ──────────────────────────────
// types
// ──────────────────────────────

interface RegisterInput {
  email: string
  password: string
  role?: 'TEACHER' | 'STUDENT'
}

interface LoginInput {
  email: string
  password: string
}

interface JwtPayload {
  id: number
  role: string
}

// ──────────────────────────────

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

// ──────────────────────────────

class AuthService {
  async register ({ email, password, role }: RegisterInput) {
    const exists = await User.findOne({ where: { email } })
    if (exists) {
      throw ApiError.badRequest('User already exists')
    }

    const user = await User.create({
      email,
      password: await hashPassword(password),
      role: role === 'TEACHER' ? 'TEACHER' : 'STUDENT'
    })

    await UserProfile.create({
      userId: user.id
    })

    return this.createAuthResponse(user)
  }

  async login ({ email, password }: LoginInput) {
    const user = await User.findOne({ where: { email } })
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password')
    }

    const valid = await comparePassword(password, user.password)
    if (!valid) {
      throw ApiError.unauthorized('Invalid email or password')
    }

    return this.createAuthResponse(user)
  }

  async refresh (refreshToken?: string) {
    if (!refreshToken) {
      throw ApiError.unauthorized('No refresh token')
    }

    let payload: JwtPayload

    try {
      payload = verifyRefreshToken(refreshToken) as JwtPayload
    } catch {
      throw ApiError.unauthorized('Invalid refresh token')
    }

    const session = await Session.findOne({
      where: {
        userId: payload.id,
        refreshTokenHash: hashToken(refreshToken)
      }
    })

    if (!session || session.expiresAt < new Date()) {
      throw ApiError.unauthorized('Session expired')
    }

    const cleanPayload: JwtPayload = {
      id: payload.id,
      role: payload.role
    }

    const accessToken = generateAccessToken(cleanPayload)
    const newRefreshToken = generateRefreshToken(cleanPayload)

    session.refreshTokenHash = hashToken(newRefreshToken)
    session.expiresAt = new Date(Date.now() + ms(jwtConfig.refreshExpiresIn))

    await session.save()

    return {
      accessToken,
      refreshToken: newRefreshToken
    }
  }

  async logout (refreshToken?: string) {
    if (!refreshToken) return

    await Session.destroy({
      where: {
        refreshTokenHash: hashToken(refreshToken)
      }
    })
  }

  // ──────────────────────────────
  // private
  // ──────────────────────────────

  private async createAuthResponse (user: any) {
    const payload: JwtPayload = {
      id: user.id,
      role: user.role
    }

    const accessToken = generateAccessToken(payload)
    const refreshToken = generateRefreshToken(payload)

    await Session.create({
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ms(jwtConfig.refreshExpiresIn))
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      accessToken,
      refreshToken
    }
  }
}

export default new AuthService()
