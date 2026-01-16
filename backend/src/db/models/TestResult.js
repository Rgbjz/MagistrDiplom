'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class TestResult extends Model {
    static associate (models) {
      TestResult.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      })

      TestResult.belongsTo(models.Test, {
        foreignKey: 'testId',
        as: 'test'
      })
      TestResult.hasMany(models.UserAnswer, {
        foreignKey: 'testResultId',
        as: 'answers'
      })
    }
  }

  TestResult.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      testId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      score: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      passed: {
        type: DataTypes.BOOLEAN,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'TestResult',
      tableName: 'TestResults'
    }
  )

  return TestResult
}
