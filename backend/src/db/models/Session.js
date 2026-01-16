'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Session extends Model {
    static associate (models) {
      Session.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
        onDelete: 'CASCADE'
      })
    }
  }

  Session.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      refreshTokenHash: {
        type: DataTypes.STRING,
        allowNull: false
      },

      userAgent: {
        type: DataTypes.STRING,
        allowNull: true
      },

      ip: {
        type: DataTypes.STRING,
        allowNull: true
      },

      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'Session',
      tableName: 'Sessions'
    }
  )

  return Session
}
