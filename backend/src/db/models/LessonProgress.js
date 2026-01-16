'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class LessonProgress extends Model {
    static associate (models) {
      LessonProgress.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'student'
      })

      LessonProgress.belongsTo(models.Lesson, {
        foreignKey: 'lessonId',
        as: 'lesson'
      })
    }
  }

  LessonProgress.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      lessonId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      status: {
        type: DataTypes.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'NOT_STARTED'
      },

      startedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },

      completedAt: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'LessonProgress',
      tableName: 'LessonProgresses'
    }
  )

  return LessonProgress
}
