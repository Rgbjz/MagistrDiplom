import * as Yup from 'yup'

const FILE_SIZE = 2 * 1024 * 1024
const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp']

export const profileSchema = Yup.object({
  firstName: Yup.string().max(50, 'Too long'),
  lastName: Yup.string().max(50, 'Too long'),
  bio: Yup.string().max(500, 'Bio too long'),
  avatar: Yup.mixed()
    .nullable()
    .test('fileSize', 'Max size 2MB', value => {
      if (!value) return true
      return value.size <= FILE_SIZE
    })
    .test('fileType', 'Unsupported format', value => {
      if (!value) return true
      return SUPPORTED_FORMATS.includes(value.type)
    })
})
