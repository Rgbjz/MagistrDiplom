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
import { Test } from './Test'
import { UserAnswer } from './UserAnswer'

export class TestResult extends Model<
  InferAttributes<TestResult, { omit: 'test' | 'answers' }>,
  InferCreationAttributes<TestResult, { omit: 'test' | 'answers' }>
> {
  declare id: CreationOptional<number>
  declare userId: number
  declare testId: number
  declare attempt: number
  declare startedAt: Date
  declare finishedAt: Date | null
  declare score: number | null
  declare passed: boolean | null

  // 👇 ассоциации
  declare test?: NonAttribute<Test>
  declare answers?: NonAttribute<UserAnswer[]>

  declare static associations: {
    test: Association<TestResult, Test>
    answers: Association<TestResult, UserAnswer>
  }

  static associate (models: any) {
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
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

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
