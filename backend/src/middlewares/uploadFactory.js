// middlewares/uploadFactory.js
const multer = require('multer')
const path = require('path')
const fs = require('fs')

function uploadFactory (folder, { maxSizeMB = 5, allowed = ['image/'] } = {}) {
  const uploadDir = path.join(__dirname, '..', 'public', folder)

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname)
      cb(null, `${folder}-${Date.now()}${ext}`)
    }
  })

  const fileFilter = (req, file, cb) => {
    const ok = allowed.some(type => file.mimetype.startsWith(type))
    if (ok) cb(null, true)
    else cb(new Error(`File type not allowed`), false)
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSizeMB * 1024 * 1024 }
  })
}

module.exports = uploadFactory
