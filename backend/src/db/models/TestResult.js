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

      attempt: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      startedAt: {
        type: DataTypes.DATE,
        allowNull: false
      },

      finishedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },

      score: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      passed: {
        type: DataTypes.BOOLEAN,
        allowNull: true
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
