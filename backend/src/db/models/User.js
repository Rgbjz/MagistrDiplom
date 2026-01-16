'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate (models) {
      User.hasOne(models.UserProfile, {
        foreignKey: 'userId',
        as: 'profile',
        onDelete: 'CASCADE'
      })
      User.hasMany(models.Session, {
        foreignKey: 'userId',
        as: 'sessions',
        onDelete: 'CASCADE'
      })

      User.hasMany(models.Course, {
        foreignKey: 'teacherId',
        as: 'courses'
      })

      User.hasMany(models.TestResult, {
        foreignKey: 'userId',
        as: 'testResults'
      })
      User.hasMany(models.LessonProgress, {
        foreignKey: 'userId',
        as: 'lessonProgresses'
      })
      User.hasMany(models.UserAnswer, {
        foreignKey: 'userId',
        as: 'answers'
      })
      User.hasMany(models.Enrollment, {
        foreignKey: 'userId',
        as: 'enrollments'
      })
    }
  }

  User.init(
    {
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },

      password: {
        type: DataTypes.STRING,
        allowNull: false
      },

      role: {
        type: DataTypes.ENUM('STUDENT', 'TEACHER', 'ADMIN'),
        allowNull: false,
        defaultValue: 'STUDENT'
      }
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'Users'
    }
  )

  return User
}
