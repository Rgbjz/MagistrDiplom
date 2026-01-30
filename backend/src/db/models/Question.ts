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
import { Answer } from './Answer'

export class Question extends Model<
  InferAttributes<Question, { omit: 'answers' }>,
  InferCreationAttributes<Question, { omit: 'answers' }>
> {
  declare id: CreationOptional<number>
  declare testId: number
  declare text: string
  declare type: string
  declare difficulty: number

  // 👇 ВАЖНО
  declare answers?: NonAttribute<Answer[]>

  declare static associations: {
    answers: Association<Question, Answer>
  }

  static associate (models: any) {
    Question.belongsTo(models.Test, {
      foreignKey: 'testId',
      as: 'test'
    })

    Question.hasMany(models.Answer, {
      foreignKey: 'questionId',
      as: 'answers'
    })
  }
}

Question.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    testId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    text: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'SINGLE'
    },

    difficulty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    }
  },
  {
    sequelize,
    modelName: 'Question',
    tableName: 'Questions'
  }
)
