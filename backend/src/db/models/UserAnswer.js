'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class UserAnswer extends Model {
    static associate (models) {
      UserAnswer.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      })

      UserAnswer.belongsTo(models.Question, {
        foreignKey: 'questionId',
        as: 'question'
      })

      UserAnswer.belongsTo(models.Answer, {
        foreignKey: 'answerId',
        as: 'answer'
      })

      UserAnswer.belongsTo(models.TestResult, {
        foreignKey: 'testResultId',
        as: 'testResult'
      })
    }
  }

  UserAnswer.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      questionId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      answerId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      testResultId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'UserAnswer',
      tableName: 'UserAnswers'
    }
  )

  return UserAnswer
}
