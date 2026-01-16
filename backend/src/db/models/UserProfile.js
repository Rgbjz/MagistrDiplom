'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class UserProfile extends Model {
    static associate (models) {
      UserProfile.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      })
    }
  }

  UserProfile.init(
    {
      firstName: {
        type: DataTypes.STRING,
        allowNull: true
      },

      lastName: {
        type: DataTypes.STRING,
        allowNull: true
      },

      avatarUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },

      bio: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
      }
    },
    {
      sequelize,
      modelName: 'UserProfile',
      tableName: 'UserProfiles'
    }
  )

  return UserProfile
}
