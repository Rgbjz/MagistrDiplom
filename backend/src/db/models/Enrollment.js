'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Enrollment extends Model {
    static associate (models) {
      Enrollment.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'student'
      })

      Enrollment.belongsTo(models.Course, {
        foreignKey: 'courseId',
        as: 'course'
      })
    }
  }

  Enrollment.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      courseId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      status: {
        type: DataTypes.ENUM('ACTIVE', 'PENDING', 'REJECTED', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },

      enrolledAt: {
        type: DataTypes.DATE,
        allowNull: false
      },

      completedAt: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'Enrollment',
      tableName: 'Enrollments'
    }
  )

  return Enrollment
}
