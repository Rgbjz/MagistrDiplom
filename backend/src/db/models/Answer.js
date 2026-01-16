'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Answer extends Model {
    static associate (models) {
      Answer.belongsTo(models.Question, {
        foreignKey: 'questionId',
        as: 'question'
      })
    }
  }

  Answer.init(
    {
      questionId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      text: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      isCorrect: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    },
    {
      sequelize,
      modelName: 'Answer',
      tableName: 'Answers'
    }
  )

  return Answer
}
