import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional
} from 'sequelize'
import { sequelize } from '../sequelize'

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN'

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>
  declare email: string
  declare password: string
  declare role: UserRole

  static associate (models: any) {
    User.hasOne(models.UserProfile, {
      foreignKey: 'userId',
      as: 'profile',
      onDelete: 'CASCADE'
    })

    User.hasMany(models.Session, {
      foreignKey: 'userId',
      as: 'sessions',
      onDelete: 'CASCADE'
    })

    User.hasMany(models.Course, {
      foreignKey: 'teacherId',
      as: 'courses'
    })

    User.hasMany(models.TestResult, {
      foreignKey: 'userId',
      as: 'testResults'
    })

    User.hasMany(models.LessonProgress, {
      foreignKey: 'userId',
      as: 'lessonProgresses'
    })

    User.hasMany(models.UserAnswer, {
      foreignKey: 'userId',
      as: 'answers'
    })

    User.hasMany(models.Enrollment, {
      foreignKey: 'userId',
      as: 'enrollments'
    })
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    password: {
      type: DataTypes.STRING,
      allowNull: false
    },

    role: {
      type: DataTypes.ENUM('STUDENT', 'TEACHER', 'ADMIN'),
      allowNull: false,
      defaultValue: 'STUDENT'
    }
  },
  {
    sequelize,
    tableName: 'Users',
    modelName: 'User'
  }
)
