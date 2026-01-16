'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Question extends Model {
    static associate (models) {
      Question.belongsTo(models.Test, {
        foreignKey: 'testId',
        as: 'test'
      })

      Question.hasMany(models.Answer, {
        foreignKey: 'questionId',
        as: 'answers'
      })

      Question.hasMany(models.UserAnswer, {
        foreignKey: 'questionId',
        as: 'userAnswers'
      })
    }
  }

  Question.init(
    {
      testId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      text: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      type: {
        type: DataTypes.ENUM('SINGLE', 'MULTIPLE'),
        allowNull: false,
        defaultValue: 'SINGLE'
      },

      difficulty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      }
    },
    {
      sequelize,
      modelName: 'Question',
      tableName: 'Questions'
    }
  )

  return Question
}
