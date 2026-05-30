import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional
} from 'sequelize'
import { sequelize } from '../sequelize'

export class UserAnswer extends Model<
  InferAttributes<UserAnswer>,
  InferCreationAttributes<UserAnswer>
> {
  declare id: CreationOptional<number>
  declare userId: number
  declare questionId: number
  declare answerId: number
  declare testResultId: number

  static associate (models: any) {
    UserAnswer.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    })

    UserAnswer.belongsTo(models.Question, {
      foreignKey: 'questionId',
      as: 'question'
    })

    UserAnswer.belongsTo(models.Answer, {
      foreignKey: 'answerId',
      as: 'answer'
    })

    UserAnswer.belongsTo(models.TestResult, {
      foreignKey: 'testResultId',
      as: 'testResult'
    })
  }
}

UserAnswer.init(
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

    questionId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    answerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    testResultId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  {
    sequelize,
    modelName: 'UserAnswer',
    tableName: 'UserAnswers'
  }
)
