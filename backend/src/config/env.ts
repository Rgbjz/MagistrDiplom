import dotenv from 'dotenv'

dotenv.config()

function requireEnv (name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`❌ Missing env variable: ${name}`)
  }
  return value
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  PORT: Number(process.env.PORT) || 5000,

  DB_HOST: requireEnv('DB_HOST'),
  DB_PORT: Number(process.env.DB_PORT) || 5432,
  DB_NAME: requireEnv('DB_NAME'),
  DB_USER: requireEnv('DB_USER'),
  DB_PASSWORD: requireEnv('DB_PASSWORD')
}
