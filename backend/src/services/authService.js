'use strict'

const { User, Session, UserProfile } = require('../db/models')
const { hashPassword, comparePassword } = require('../utils/password')
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require('../utils/jwt')
const ApiError = require('../utils/ApiError')
const crypto = require('crypto')
const ms = require('ms')
const jwtConfig = require('../config/jwt')

const hashToken = token =>
  crypto.createHash('sha256').update(token).digest('hex')

class AuthService {
  async register ({ email, password, role }) {
    const exists = await User.findOne({ where: { email } })
    if (exists) {
      throw ApiError.badRequest('User already exists')
    }

    const user = await User.create({
      email,
      password: await hashPassword(password),
      role: role === 'TEACHER' ? 'TEACHER' : 'STUDENT' // 🔒 защита
    })

    // профиль создаём сразу
    await UserProfile.create({
      userId: user.id
    })

    return this._createAuthResponse(user)
  }

  async login ({ email, password }) {
    const user = await User.findOne({ where: { email } })
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password')
    }

    const valid = await comparePassword(password, user.password)
    if (!valid) {
      throw ApiError.unauthorized('Invalid email or password')
    }

    return this._createAuthResponse(user)
  }

  async refresh (refreshToken) {
    if (!refreshToken) {
      throw ApiError.unauthorized('No refresh token')
    }

    let payload
    try {
      payload = verifyRefreshToken(refreshToken)
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

    const cleanPayload = {
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

  async logout (refreshToken) {
    if (!refreshToken) return

    await Session.destroy({
      where: { refreshTokenHash: hashToken(refreshToken) }
    })
  }

  async _createAuthResponse (user) {
    const payload = { id: user.id, role: user.role }

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

module.exports = new AuthService()
