import { Sequelize } from 'sequelize'
import { sequelize } from './sequelize'

import { User } from './models/User'
import { UserProfile } from './models/UserProfile'
import { Session } from './models/Session'
import { Course } from './models/Course'
import { Section } from './models/Section'
import { Lesson } from './models/Lesson'
import { Test } from './models/Test'
import { Question } from './models/Question'
import { Answer } from './models/Answer'
import { Enrollment } from './models/Enrollment'
import { LessonProgress } from './models/LessonProgress'
import { TestResult } from './models/TestResult'
import { UserAnswer } from './models/UserAnswer'

export {
  User,
  UserProfile,
  Session,
  Course,
  Section,
  Lesson,
  Test,
  Question,
  Answer,
  Enrollment,
  LessonProgress,
  TestResult,
  UserAnswer
}

/* =====================
   Associations
===================== */

const models = {
  User,
  UserProfile,
  Session,
  Course,
  Section,
  Lesson,
  Test,
  Question,
  Answer,
  Enrollment,
  LessonProgress,
  TestResult,
  UserAnswer
}

Object.values(models).forEach(model => {
  model.associate?.(models)
})

export { sequelize, Sequelize }
