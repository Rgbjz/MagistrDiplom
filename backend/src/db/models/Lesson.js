'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Lesson extends Model {
    static associate (models) {
      Lesson.belongsTo(models.Section, {
        foreignKey: 'sectionId',
        as: 'section'
      })

      Lesson.hasMany(models.LessonProgress, {
        foreignKey: 'lessonId',
        as: 'progresses'
      })

      Lesson.hasOne(models.Test, {
        foreignKey: 'lessonId',
        as: 'test'
      })
    }
  }

  Lesson.init(
    {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },

      content: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      videoUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },

      order: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      sectionId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'Lesson',
      tableName: 'Lessons'
    }
  )

  return Lesson
}
