import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  NonAttribute,
  Association
} from 'sequelize'
import { sequelize } from '../sequelize'
import { Question } from './Question'
import { TestResult } from './TestResult'
import { Lesson } from './Lesson'

export class Test extends Model<
  InferAttributes<Test, { omit: 'questions' | 'results' | 'lesson' }>,
  InferCreationAttributes<Test, { omit: 'questions' | 'results' | 'lesson' }>
> {
  declare id: CreationOptional<number>
  declare lessonId: number
  declare title: string
  declare timeLimit: number
  declare passingScore: number

  // 👇 ассоциации
  declare questions?: NonAttribute<Question[]>
  declare results?: NonAttribute<TestResult[]>
  declare lesson?: NonAttribute<Lesson>

  declare static associations: {
    questions: Association<Test, Question>
    results: Association<Test, TestResult>
    lesson: Association<Test, Lesson>
  }

  static associate (models: any) {
    Test.belongsTo(models.Lesson, {
      foreignKey: 'lessonId',
      as: 'lesson'
    })

    Test.hasMany(models.Question, {
      foreignKey: 'testId',
      as: 'questions'
    })

    Test.hasMany(models.TestResult, {
      foreignKey: 'testId',
      as: 'results'
    })
  }
}

Test.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    lessonId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    title: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Test'
    },

    timeLimit: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    passingScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60
    }
  },
  {
    sequelize,
    modelName: 'Test',
    tableName: 'Tests'
  }
)
