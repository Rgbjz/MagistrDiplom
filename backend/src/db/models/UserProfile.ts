import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional
} from 'sequelize'
import { sequelize } from '../sequelize'

export class UserProfile extends Model<
  InferAttributes<UserProfile>,
  InferCreationAttributes<UserProfile>
> {
  declare id: CreationOptional<number>
  declare firstName: string | null
  declare lastName: string | null
  declare avatarUrl: string | null
  declare bio: string | null
  declare userId: number

  static associate (models: any) {
    UserProfile.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    })
  }
}

UserProfile.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    firstName: {
      type: DataTypes.STRING,
      allowNull: true
    },

    lastName: {
      type: DataTypes.STRING,
      allowNull: true
    },

    avatarUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    }
  },
  {
    sequelize,
    modelName: 'UserProfile',
    tableName: 'UserProfiles'
  }
)
