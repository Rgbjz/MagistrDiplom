import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional
} from 'sequelize'
import { sequelize } from '../sequelize'

export class Session extends Model<
  InferAttributes<Session>,
  InferCreationAttributes<Session>
> {
  declare id: CreationOptional<number>
  declare userId: number
  declare refreshTokenHash: string
  declare userAgent: string | null
  declare ip: string | null
  declare expiresAt: Date

  static associate (models: any) {
    Session.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE'
    })
  }
}

Session.init(
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

    refreshTokenHash: {
      type: DataTypes.STRING,
      allowNull: false
    },

    userAgent: {
      type: DataTypes.STRING,
      allowNull: true
    },

    ip: {
      type: DataTypes.STRING,
      allowNull: true
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  },
  {
    sequelize,
    modelName: 'Session',
    tableName: 'Sessions'
  }
)
