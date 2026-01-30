// db/models/Enrollment.ts
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
import { User } from './User'
import { Course } from './Course'

export type EnrollmentStatus = 'ACTIVE' | 'PENDING' | 'REJECTED' | 'COMPLETED'

export class Enrollment extends Model<
  InferAttributes<Enrollment, { omit: 'student' | 'course' }>,
  InferCreationAttributes<Enrollment, { omit: 'student' | 'course' }>
> {
  declare id: CreationOptional<number>

  declare userId: ForeignKey<User['id']>
  declare courseId: ForeignKey<Course['id']>

  declare status: EnrollmentStatus
  declare enrolledAt: CreationOptional<Date>
  declare completedAt: CreationOptional<Date | null>

  // 🔥 ассоциации ДЛЯ TS
  declare student?: NonAttribute<User>
  declare course?: NonAttribute<Course>

  static associate (models: any) {
    Enrollment.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'student'
    })

    Enrollment.belongsTo(models.Course, {
      foreignKey: 'courseId',
      as: 'course'
    })
  }
}

Enrollment.init(
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

    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    status: {
      type: DataTypes.ENUM('ACTIVE', 'PENDING', 'REJECTED', 'COMPLETED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },

    enrolledAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Enrollment',
    tableName: 'Enrollments'
  }
)
