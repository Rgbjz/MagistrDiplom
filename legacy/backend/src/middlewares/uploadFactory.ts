import multer, { FileFilterCallback } from 'multer'
import path from 'path'
import fs from 'fs'
import { Request } from 'express'

interface UploadFactoryOptions {
  maxSizeMB?: number
  allowed?: string[] // например ['image/']
}

export default function uploadFactory (
  folder: string,
  { maxSizeMB = 5, allowed = ['image/'] }: UploadFactoryOptions = {}
) {
  const uploadDir = path.join(__dirname, '..', 'public', folder)

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      cb(null, `${folder}-${Date.now()}${ext}`)
    }
  })

  const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    const ok = allowed.some(type => file.mimetype.startsWith(type))

    if (ok) cb(null, true)
    else cb(new Error('File type not allowed'))
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSizeMB * 1024 * 1024 }
  })
}
