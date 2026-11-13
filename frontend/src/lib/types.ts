export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type EnrollmentStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'COMPLETED';
export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
}

export interface CourseListItem {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  teacherId: number;
  enrollmentStatus?: EnrollmentStatus | null;
  /** The student account is on this course's team (assistant). */
  isStaff?: boolean;
  price: number;
  category?: string | null;
  level?: CourseLevel | null;
  published?: boolean;
  autoApprove?: boolean;
}

export type QuestionType =
  | 'SINGLE'
  | 'MULTIPLE'
  | 'TRUE_FALSE'
  | 'SHORT_TEXT'
  | 'NUMERIC'
  | 'MATCHING'
  | 'ORDERING'
  | 'ESSAY';
export type ShowAnswersMode = 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_PASS' | 'AFTER_CLOSE';

export interface UserProfile {
  id: number;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  userId: number;
  emailNotifications?: boolean;
  deadlineReminders?: boolean;
  /** Saved interface language: uk | en | pl. */
  locale?: string;
}

export interface Me {
  id: number;
  email: string;
  role: Role;
  emailVerified?: boolean;
  createdAt?: string;
  profile: UserProfile | null;
}

export interface TestLite {
  id: number;
  lessonId: number;
  title: string;
  timeLimit: number;
  passingScore: number;
}

export type VideoStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

/** Public shape of an uploaded lesson video (URLs are signed per user). */
export interface LessonVideo {
  id: number;
  lessonId: number;
  status: VideoStatus;
  progress: number;
  hlsUrl: string | null;
  posterUrl: string | null;
  mp4FallbackUrl: string | null;
  qualities: number[];
  durationSec: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  error: string | null;
}

export interface LessonFile {
  id: number;
  lessonId: number;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface Lesson {
  id: number;
  title: string;
  content: string | null;
  videoUrl: string | null;
  order: number;
  sectionId: number;
  test: TestLite | null;
  files?: LessonFile[];
  /** Uploaded video (transcoded to HLS); YouTube/Vimeo links stay in videoUrl. */
  video?: LessonVideo | null;
  assignment?: AssignmentLite | null;
}

// ===== Assignments =====
export interface AssignmentLite {
  id: number;
  title: string;
  dueAt: string | null;
  maxScore: number;
}

export type SubmissionStatus = 'SUBMITTED' | 'GRADED' | 'RETURNED';

export interface SubmissionFile {
  id: number;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface Submission {
  id: number;
  assignmentId: number;
  userId: number;
  comment: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
  late: boolean;
  files: SubmissionFile[];
}

export interface AssignmentDetail {
  id: number;
  lessonId: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  maxScore: number;
  maxFiles: number;
  lessonTitle: string;
  courseId: number;
  courseTitle: string;
  submission: Submission | null;
}

export interface SubmissionWithStudent extends Submission {
  student: { id: number; name: string; email: string; avatarUrl: string | null };
}

export interface AssignmentSummary {
  assignmentId: number;
  title: string;
  lessonTitle: string;
  dueAt: string | null;
  maxScore: number;
  total: number;
  pending: number;
  graded: number;
  returned: number;
  late: number;
}

export interface UpcomingAssignment {
  assignmentId: number;
  title: string;
  courseId: number;
  courseTitle: string;
  dueAt: string | null;
  status: SubmissionStatus | null;
}

export interface Section {
  id: number;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface CourseProgress {
  percent: number;
  total: number;
  completed: number;
  lessons: number[];
  tests: number[];
  assignments?: number[];
}

/** The viewer's role on a course team; ADMIN = platform administrator. */
export type CourseStaffRole = 'OWNER' | 'TEACHER' | 'ASSISTANT';
export type CourseRole = CourseStaffRole | 'ADMIN';

export interface CourseStaffMember {
  userId: number;
  role: CourseStaffRole;
  addedAt: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  accountRole: Role;
}

export interface CourseStaffList {
  myRole: CourseRole;
  staff: CourseStaffMember[];
}

export interface AssistingCourse {
  id: number;
  title: string;
  imageUrl: string | null;
  role: CourseStaffRole;
}

export interface CourseDetail {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  teacherId: number;
  sections: Section[];
  enrollmentStatus: EnrollmentStatus | null;
  progress: CourseProgress | null;
  price: number;
  category?: string | null;
  level?: CourseLevel | null;
  published?: boolean;
  autoApprove?: boolean;
  testsWeight?: number;
  assignmentsWeight?: number;
  gradePassThreshold?: number;
  gradingScale?: GradingScaleKind;
  gradingScaleConfig?: ScaleBand[] | null;
  /** The viewer's role on the course team, null when not on it. */
  myRole?: CourseRole | null;
}

export type ActiveItem =
  | { type: 'SECTION'; id: number }
  | { type: 'LESSON'; id: number }
  | { type: 'TEST'; id: number }
  | { type: 'ASSIGNMENT'; id: number }
  | null;

export interface Answer {
  id: number;
  questionId: number;
  text: string;
  isCorrect: boolean;
}

/** Type-specific settings of a question (see backend question-types.ts). */
export interface QuestionConfig {
  correct?: boolean;
  accepted?: string[];
  caseSensitive?: boolean;
  value?: number;
  tolerance?: number;
  pairs?: { left: string; right: string }[];
  items?: string[];
  maxWords?: number | null;
  rubric?: string;
}

export interface Question {
  id: number;
  testId: number | null;
  categoryId?: number | null;
  text: string;
  type: QuestionType;
  difficulty: number;
  points: number;
  partialCredit: boolean;
  config: QuestionConfig | null;
  answers: Answer[];
}

export interface TestRandomRule {
  id: number;
  categoryId: number;
  categoryName: string;
  count: number;
  available: number;
}

export interface TestFull {
  id: number;
  lessonId: number;
  title: string;
  timeLimit: number;
  passingScore: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  maxAttempts: number | null;
  questionsPerAttempt: number | null;
  showCorrectAnswers: ShowAnswersMode;
  /** Questions in one attempt (subset + bank rules). */
  questionCount: number;
  questions: Question[];
  randomRules: TestRandomRule[];
  /** Student view only. */
  attemptsUsed?: number;
  attemptsLeft?: number | null;
}

export interface QuestionBankCategory {
  id: number;
  name: string;
  questions: Question[];
}

export interface GiftImportResult {
  imported: number;
  skipped: { line: number; reason: string; text: string }[];
  categoryIds: number[];
}

export interface PendingReview {
  id: number;
  testId: number;
  testTitle: string;
  attempt: number;
  submittedAt: string;
  student: { id: number; name: string; email: string; avatarUrl: string | null };
  question: string;
  rubric: string | null;
  answer: string;
  maxPoints: number;
}

export interface SessionAnswer {
  id: number;
  text: string;
}

export interface SessionQuestion {
  id: number;
  text: string;
  type: QuestionType;
  points: number;
  answers: SessionAnswer[];
  /** MATCHING: left items in order, right items shuffled. */
  left?: SessionAnswer[];
  right?: SessionAnswer[];
  /** ORDERING: items shuffled. */
  items?: SessionAnswer[];
  /** ESSAY */
  maxWords?: number | null;
}

/** What a student submits per question. */
export type QuestionResponse =
  | { answerIds: number[] }
  | { value: boolean }
  | { value: number }
  | { text: string }
  | { pairs: Record<number, number> }
  | { order: number[] };

export interface TestStartResponse {
  testResultId: number;
  attempt: number;
  timeLimit: number;
  startedAt: string;
  questions: SessionQuestion[];
}

export interface SubmitResult {
  score: number;
  passed: boolean | null;
  pendingReview: boolean;
  correct: number;
  total: number;
  finishedAt: string;
}

export interface MyTestResultDetail {
  questionId: number;
  correctAnswerIds: number[];
  userAnswerIds: number[];
  text: string;
  type: QuestionType;
  answers: { id: number; text: string }[];
  isCorrect: boolean;
  points: number;
  earned: number;
  status: 'AUTO' | 'PENDING' | 'GRADED';
  feedback: string | null;
  /** The student's response with texts (matching pairs, ordered items…). */
  response: {
    answerIds?: number[];
    value?: boolean | number;
    text?: string;
    pairs?: { left: string; right: string | null }[];
    items?: string[];
  } | null;
  /** The key — null unless the test settings allow showing it. */
  correct: {
    answerIds?: number[];
    value?: boolean | number;
    tolerance?: number;
    accepted?: string[];
    pairs?: { left: string; right: string }[];
    items?: string[];
    rubric?: string;
  } | null;
}

export interface MyTestResult {
  id: number;
  score: number;
  passed: boolean | null;
  pendingReview: boolean;
  showCorrectAnswers: boolean;
  earnedPoints: number;
  totalPoints: number;
  maxAttempts: number | null;
  finishedAt: string;
  startedAt: string;
  attempt: number;
  correct: number;
  total: number;
  passingScore: number;
  timeLimit: number;
  testId: number;
  testTitle: string;
  courseId: number;
  courseTitle: string;
  lessonId: number;
  details: MyTestResultDetail[];
}

export interface TestAttempt {
  id: number;
  attempt: number;
  score: number | null;
  passed: boolean | null;
  pendingReview?: boolean;
  startedAt: string;
  finishedAt: string | null;
}

export interface EnrollRequest {
  id: number;
  userId: number;
  courseId: number;
  status: EnrollmentStatus;
  student: {
    id: number;
    email: string;
    profile: {
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    } | null;
  };
}

export interface StudentProgress {
  userId: number;
  name: string;
  email: string;
  lessons: { completed: number; total: number };
  tests: { completed: number; total: number };
  averageScore: number | null;
  status: EnrollmentStatus;
  percent: number;
  avatarUrl: string | null;
  lastActivityAt: string | null;
}

export interface TestSummary {
  testId: number;
  title: string;
  lessonTitle: string;
  attempts: number;
  students: number;
  passRate: number | null;
  avgScore: number | null;
}

export interface ChatSender {
  id: number;
  email: string;
  profile: { firstName: string | null; lastName: string | null } | null;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  createdAt: string;
  sender: ChatSender;
}

export interface Conversation {
  id: number;
  type: 'COURSE' | 'DIRECT';
  courseId: number | null;
  title: string;
  lastMessage: { content: string; createdAt: string } | null;
}

export interface DashboardStats {
  enrolled: number;
  completed: number;
  lessonsCompleted: number;
  testsPassed: number;
  avgScore: number | null;
}

export interface ContinueCourse {
  id: number;
  title: string;
  imageUrl: string | null;
  percent: number;
  nextLesson: { id: number; title: string } | null;
  completedLessons: number;
  totalLessons: number;
}

export interface UpcomingTest {
  testId: number;
  title: string;
  courseId: number;
  courseTitle: string;
  questionsCount: number;
  timeLimit: number;
}

export interface TeachingCourse {
  id: number;
  title: string;
  myRole: CourseStaffRole;
  imageUrl: string | null;
  published: boolean;
  price: number;
  studentsCount: number;
  avgProgress: number;
  pendingCount: number;
}

export interface TeacherStats {
  students: number;
  activeCourses: number;
  pendingRequests: number;
  avgScore: number | null;
}

export interface PendingRequest {
  courseId: number;
  courseTitle: string;
  userId: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  requestedAt: string;
}

export interface WeeklyActivityDay {
  date: string;
  label: string;
  count: number;
}

export interface AttentionTest {
  testId: number;
  title: string;
  courseId: number;
  courseTitle: string;
  passRate: number;
  attempts: number;
}

export interface DashboardData {
  role: Role;
  name: string | null;
  stats?: DashboardStats;
  continueLearning?: ContinueCourse[];
  upcomingTests?: UpcomingTest[];
  upcomingAssignments?: UpcomingAssignment[];
  teacherStats?: TeacherStats;
  teachingCourses?: TeachingCourse[];
  pendingRequests?: PendingRequest[];
  weeklyActivity?: WeeklyActivityDay[];
  attentionTests?: AttentionTest[];
  /** Student accounts that help on a course team (e.g. as assistants). */
  assistingCourses?: AssistingCourse[];
  recentConversations: Conversation[];
}

export interface PublicCourseLesson {
  title: string;
  hasTest: boolean;
  /** YouTube thumbnail of a linked video; null for uploaded or no video. */
  previewUrl?: string | null;
}

export interface PublicCourseSection {
  title: string;
  lessons: PublicCourseLesson[];
}

export interface PublicCourse {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  category: string | null;
  level: CourseLevel | null;
  autoApprove: boolean;
  sectionsCount: number;
  lessonsCount: number;
  testsCount: number;
  studentsCount: number;
  teacher: { name: string; bio: string | null; avatarUrl: string | null };
  sections: PublicCourseSection[];
}

export interface MyStatus {
  enrollmentStatus: EnrollmentStatus | null;
}

export interface Purchase {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  course: { id: number; title: string; imageUrl: string | null };
}

// ===== Catalog =====
export interface CatalogCourse {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  category: string | null;
  level: CourseLevel | null;
  teacher: { name: string };
  sectionsCount: number;
  lessonsCount: number;
  studentsCount: number;
}

export interface CatalogResponse {
  items: CatalogCourse[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
}

// ===== My courses =====
export interface MyCourse {
  course: {
    id: number;
    title: string;
    imageUrl: string | null;
    price: number;
    teacher: { name: string };
  };
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt: string | null;
  progress: { percent: number; completed: number; total: number };
  nextLesson: { id: number; title: string } | null;
  lastActivityAt: string | null;
  avgScore: number | null;
  certificateCode: string | null;
}

// ===== Account =====
export interface UserSession {
  id: number;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  updatedAt: string;
  /** True for the session of the token making the request. */
  current?: boolean;
}

// ===== Certificates =====
export interface CertificateInfo {
  code: string;
  issuedAt: string;
  avgScore: number | null;
  student: { name: string };
  course: { id: number; title: string; lessonsCount: number };
  teacher: { name: string };
}

// ===== Notifications =====
export type NotificationType =
  | 'ENROLLMENT_REQUEST'
  | 'ENROLLMENT_APPROVED'
  | 'ENROLLMENT_REJECTED'
  | 'NEW_LESSON'
  | 'TEST_RESULT'
  | 'NEW_MESSAGE'
  | 'PAYMENT'
  | 'CERTIFICATE'
  | 'ASSIGNMENT_SUBMITTED'
  | 'ASSIGNMENT_GRADED'
  | 'COURSE_STAFF_ADDED';

export type NotificationFilter = 'all' | 'unread' | 'courses' | 'tests' | 'messages';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

// ===== Admin =====
export interface AdminStats {
  users: number;
  students: number;
  teachers: number;
  admins: number;
  courses: number;
  publishedCourses: number;
  paymentsMonthCount: number;
  paymentsMonthSum: number;
}

export interface AdminUser {
  id: number;
  email: string;
  role: Role;
  emailVerified: boolean;
  blocked: boolean;
  createdAt: string;
  name: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminPayment {
  id: number;
  amount: number;
  createdAt: string;
  user: { id: number; email: string; name: string | null };
  course: { id: number; title: string };
}

export interface AdminCourse {
  id: number;
  title: string;
  published: boolean;
  price: number;
  teacher: { name: string };
  studentsCount: number;
  createdAt: string;
}

// ===== Gradebook =====
export type GradeCellState = 'graded' | 'submitted' | 'returned' | 'missing' | 'late';

export interface GradebookColumn {
  key: string;
  kind: 'test' | 'assignment';
  id: number;
  title: string;
  sectionTitle: string;
  max: number;
  dueAt?: string | null;
}

/** Set when course staff replaced the computed value by hand. */
export interface OverrideMark {
  value: number;
  original: number | null;
  reason: string;
  by: string;
  at: string;
}

export interface GradebookCell {
  value: number | null;
  state: GradeCellState;
  late?: boolean;
  overridden?: OverrideMark;
}

export type GradingScaleKind = 'PERCENT' | 'FIVE_POINT' | 'ECTS' | 'PASS_FAIL';

export interface ScaleBand {
  code: string;
  min: number;
}

export interface OverrideHistoryEntry {
  id: number;
  itemKey: string;
  oldValue: number | null;
  newValue: number | null;
  reason: string;
  by: string;
  at: string;
}

export interface GradebookRow {
  userId: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: EnrollmentStatus;
  cells: Record<string, GradebookCell>;
  testsAvg: number | null;
  assignmentsAvg: number | null;
  final: number | null;
  finalOverridden?: OverrideMark;
  scaleGrade: { code: string; passed: boolean } | null;
  passed: boolean;
  progress: number;
}

export interface GradebookCourse {
  id: number;
  title: string;
  testsWeight: number;
  assignmentsWeight: number;
  gradePassThreshold: number;
  gradingScale: GradingScaleKind;
  /** Effective thresholds; null for percent and pass/fail. */
  scaleBands: ScaleBand[] | null;
}

export interface Gradebook {
  course: GradebookCourse;
  columns: GradebookColumn[];
  rows: GradebookRow[];
  stats: {
    studentsCount: number;
    avgFinal: number | null;
    passRate: number | null;
    perColumn: Record<string, { avg: number | null; submitted: number }>;
  };
}

export interface MyGrades {
  course: GradebookCourse;
  columns: GradebookColumn[];
  row: GradebookRow | null;
}

// ===== Calendar =====
export type CourseEventKind = 'LECTURE' | 'ONLINE_LESSON' | 'DEADLINE' | 'OTHER';
export type CalendarItemKind = 'ASSIGNMENT' | CourseEventKind;

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  description: string | null;
  courseId: number;
  courseTitle: string;
  startsAt: string;
  endsAt: string | null;
  link: string;
  done: boolean | null;
  role: 'student' | 'staff';
  eventId: number | null;
  canEdit: boolean;
}

export interface CalendarResponse {
  from: string;
  to: string;
  items: CalendarItem[];
  courses: { id: number; title: string }[];
  canCreateIn: { id: number; title: string; published?: boolean; updatedAt?: string | null }[];
}
