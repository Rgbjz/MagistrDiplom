const { User, UserProfile, Course, Enrollment } = require('../db/models')

class UserService {
  async getMe (userId) {
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

  async updateProfile (userId, profileData) {
    const [profile] = await UserProfile.findOrCreate({
      where: { userId }
    })

    await profile.update(profileData)
    return profile
  }

  async getMyCourses (userId) {
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

module.exports = new UserService()
