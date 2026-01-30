import { User, UserProfile, Course, Enrollment } from '../db'

interface UpdateProfileInput {
  firstName?: string
  lastName?: string
  avatar?: string
  bio?: string
}

class UserService {
  async getMe (userId: number) {
    return User.findByPk(userId, {
      attributes: ['id', 'email', 'role'],
      include: [
        {
          model: UserProfile,
          as: 'profile'
        }
      ]
    })
  }

  async updateProfile (userId: number, profileData: UpdateProfileInput) {
    const [profile] = await UserProfile.findOrCreate({
      where: { userId }
    })

    await profile.update(profileData)
    return profile
  }

  async getMyCourses (userId: number) {
    return Course.findAll({
      include: [
        {
          model: Enrollment,
          as: 'enrollments',
          where: { userId },
          attributes: []
        },
        {
          model: User,
          as: 'teacher',
          attributes: ['id', 'email']
        }
      ]
    })
  }
}

export default new UserService()
