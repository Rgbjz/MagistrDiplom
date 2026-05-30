import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  NonAttribute,
  ForeignKey,
  DataTypes,
  Association
} from 'sequelize'
import { sequelize } from '../sequelize'
import { Course } from './Course'
import { Lesson } from './Lesson'

export class Section extends Model<
  InferAttributes<
    Section,
    {
      omit: 'course' | 'createdAt' | 'updatedAt'
    }
  >,
  InferCreationAttributes<
    Section,
    {
      omit: 'course' | 'createdAt' | 'updatedAt'
    }
  >
> {
  declare id: CreationOptional<number>
  declare title: string
  declare order: number

  declare courseId: ForeignKey<Course['id']>

  // ✅ association
  declare course?: NonAttribute<Course>
  declare lessons?: NonAttribute<Lesson[]>

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare static associations: {
    course: Association<Section, Course>
  }

  static associate (models: { Course: typeof Course; Lesson: typeof Lesson }) {
    Section.belongsTo(models.Course, {
      foreignKey: 'courseId',
      as: 'course'
    })
    Section.hasMany(models.Lesson, {
      foreignKey: 'sectionId',
      as: 'lessons'
    })
  }
}

Section.init(
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
    order: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'Sections',
    timestamps: true
  }
)
