'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Section extends Model {
    static associate (models) {
      Section.belongsTo(models.Course, {
        foreignKey: 'courseId',
        as: 'course'
      })

      Section.hasMany(models.Lesson, {
        foreignKey: 'sectionId',
        as: 'lessons'
      })
    }
  }

  Section.init(
    {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },

      order: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      courseId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'Section',
      tableName: 'Sections'
    }
  )

  return Section
}
