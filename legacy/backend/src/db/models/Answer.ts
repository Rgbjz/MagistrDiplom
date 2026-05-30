import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional
} from 'sequelize'
import { sequelize } from '../sequelize'

export class Answer extends Model<
  InferAttributes<Answer>,
  InferCreationAttributes<Answer>
> {
  declare id: CreationOptional<number>
  declare questionId: number
  declare text: string
  declare isCorrect: boolean

  static associate (models: any) {
    Answer.belongsTo(models.Question, {
      foreignKey: 'questionId',
      as: 'question'
    })
  }
}

Answer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    questionId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    text: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    isCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    sequelize,
    modelName: 'Answer',
    tableName: 'Answers'
  }
)
