'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Course extends Model {
    static associate (models) {
      Course.belongsTo(models.User, {
        foreignKey: 'teacherId',
        as: 'teacher'
      })

      Course.hasMany(models.Section, {
        foreignKey: 'courseId',
        as: 'sections'
      })

      Course.belongsToMany(models.User, {
        through: models.Enrollment,
        foreignKey: 'courseId',
        otherKey: 'userId', // 🔥 ВАЖНО
        as: 'students'
      })

      Course.hasMany(models.Enrollment, {
        foreignKey: 'courseId',
        as: 'enrollments'
      })
    }
  }

  Course.init(
    {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      imageUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },

      teacherId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'Course',
      tableName: 'Courses'
    }
  )

  return Course
}
