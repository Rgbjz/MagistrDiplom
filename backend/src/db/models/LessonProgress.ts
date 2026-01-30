import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional
} from 'sequelize'
import { sequelize } from '../sequelize'

export class LessonProgress extends Model<
  InferAttributes<LessonProgress>,
  InferCreationAttributes<LessonProgress>
> {
  declare id: CreationOptional<number>
  declare userId: number
  declare lessonId: number
  declare status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  declare startedAt: Date | null
  declare completedAt: Date | null

  static associate (models: any) {
    LessonProgress.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'student'
    })

    LessonProgress.belongsTo(models.Lesson, {
      foreignKey: 'lessonId',
      as: 'lesson'
    })
  }
}

LessonProgress.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    lessonId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    status: {
      type: DataTypes.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'),
      allowNull: false,
      defaultValue: 'NOT_STARTED'
    },

    startedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'LessonProgress',
    tableName: 'LessonProgresses'
  }
)
