import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute
} from 'sequelize'
import { sequelize } from '../sequelize'

import { Section } from './Section'
import { LessonProgress } from './LessonProgress'
import { Test } from './Test'

export class Lesson extends Model<
  InferAttributes<Lesson>,
  InferCreationAttributes<Lesson>
> {
  declare id: CreationOptional<number>
  declare title: string
  declare content: string | null
  declare videoUrl: string | null
  declare order: number

  // ===== FK =====
  declare sectionId: ForeignKey<Section['id']>

  // ===== ASSOCIATIONS (ВАЖНО) =====
  declare section?: NonAttribute<Section>
  declare progresses?: NonAttribute<LessonProgress[]>
  declare test?: NonAttribute<Test>

  static associate (models: any) {
    Lesson.belongsTo(models.Section, {
      foreignKey: 'sectionId',
      as: 'section'
    })

    Lesson.hasMany(models.LessonProgress, {
      foreignKey: 'lessonId',
      as: 'progresses'
    })

    Lesson.hasOne(models.Test, {
      foreignKey: 'lessonId',
      as: 'test'
    })
  }
}

Lesson.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    title: {
      type: DataTypes.STRING,
      allowNull: false
    },

    content: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    videoUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    order: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    sectionId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  {
    sequelize,
    modelName: 'Lesson',
    tableName: 'Lessons'
  }
)
