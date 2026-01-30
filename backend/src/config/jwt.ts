const jwtConfig = {
  accessSecret: process.env.ACCESS_TOKEN_SECRET || '',
  refreshSecret: process.env.REFRESH_TOKEN_SECRET || '',
  accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'
}

export default jwtConfig
