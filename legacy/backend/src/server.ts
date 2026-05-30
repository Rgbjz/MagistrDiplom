import http from 'http'
import dotenv from 'dotenv'
import app from './app'

dotenv.config()

const PORT = Number(process.env.PORT) || 5000

const server = http.createServer(app)

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`)
})
