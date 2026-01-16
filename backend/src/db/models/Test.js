'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Test extends Model {
    static associate (models) {
      Test.belongsTo(models.Lesson, {
        foreignKey: 'lessonId',
        as: 'lesson'
      })

      Test.hasMany(models.Question, {
        foreignKey: 'testId',
        as: 'questions'
      })

      Test.hasMany(models.TestResult, {
        foreignKey: 'testId',
        as: 'results'
      })
    }
  }

  Test.init(
    {
      lessonId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Test'
      },

      timeLimit: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      passingScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60
      }
    },
    {
      sequelize,
      modelName: 'Test',
      tableName: 'Tests'
    }
  )

  return Test
}
