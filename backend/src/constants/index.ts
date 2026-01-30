/* =========================
   USER
========================= */
export const USER_ROLES = {
  STUDENT: 'STUDENT',
  TEACHER: 'TEACHER',
  ADMIN: 'ADMIN'
} as const

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES]

/* =========================
   ENROLLMENT
========================= */
export const ENROLLMENT_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED'
} as const

export type EnrollmentStatus =
  typeof ENROLLMENT_STATUS[keyof typeof ENROLLMENT_STATUS]

/* =========================
   LESSON PROGRESS
========================= */
export const LESSON_PROGRESS_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED'
} as const

export type LessonProgressStatus =
  typeof LESSON_PROGRESS_STATUS[keyof typeof LESSON_PROGRESS_STATUS]

/* =========================
   QUESTIONS / TESTS
========================= */
export const QUESTION_TYPE = {
  SINGLE: 'SINGLE',
  MULTIPLE: 'MULTIPLE'
} as const

export type QuestionType = typeof QUESTION_TYPE[keyof typeof QUESTION_TYPE]

/* =========================
   DEFAULTS
========================= */
export const DEFAULT_TEST = {
  TITLE: 'Test',
  TIME_LIMIT: 10,
  PASSING_SCORE: 60
} as const
