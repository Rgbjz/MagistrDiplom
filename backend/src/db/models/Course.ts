import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  NonAttribute,
  ForeignKey,
  Association
} from 'sequelize'
import { sequelize } from '../sequelize'
import { User } from './User'
import { Section } from './Section'
import { Enrollment } from './Enrollment'

export class Course extends Model<
  InferAttributes<
    Course,
    {
      omit:
        | 'teacher'
        | 'sections'
        | 'students'
        | 'enrollments'
        | 'createdAt'
        | 'updatedAt'
    }
  >,
  InferCreationAttributes<
    Course,
    {
      omit:
        | 'teacher'
        | 'sections'
        | 'students'
        | 'enrollments'
        | 'createdAt'
        | 'updatedAt'
    }
  >
> {
  declare id: CreationOptional<number>
  declare title: string
  declare description: string | null
  declare imageUrl: string | null

  declare teacherId: ForeignKey<User['id']>

  // ===== associations (TS only) =====
  declare teacher?: NonAttribute<User>
  declare sections?: NonAttribute<Section[]>
  declare students?: NonAttribute<User[]>
  declare enrollments?: NonAttribute<Enrollment[]>

  // ===== timestamps =====
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare static associations: {
    teacher: Association<Course, User>
    sections: Association<Course, Section>
    students: Association<Course, User>
    enrollments: Association<Course, Enrollment>
  }

  static associate (models: {
    User: typeof User
    Section: typeof Section
    Enrollment: typeof Enrollment
  }) {
    Course.belongsTo(models.User, {
      foreignKey: 'teacherId',
      as: 'teacher'
    })

    Course.hasMany(models.Section, {
      foreignKey: 'courseId',
      as: 'sections'
    })

    Course.belongsToMany(models.User, {
      through: models.Enrollment,
      foreignKey: 'courseId',
      otherKey: 'userId',
      as: 'students'
    })

    Course.hasMany(models.Enrollment, {
      foreignKey: 'courseId',
      as: 'enrollments'
    })
  }
}

Course.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    title: {
      type: DataTypes.STRING,
      allowNull: false
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    teacherId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'Courses',
    timestamps: true
  }
)
