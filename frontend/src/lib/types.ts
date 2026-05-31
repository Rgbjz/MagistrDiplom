export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type EnrollmentStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'COMPLETED';

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
}

export type QuestionType = 'SINGLE' | 'MULTIPLE';

export interface UserProfile {
  id: number;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  userId: number;
}

export interface Me {
  id: number;
  email: string;
  role: Role;
  profile: UserProfile | null;
}

export interface TestLite {
  id: number;
  lessonId: number;
  title: string;
  timeLimit: number;
  passingScore: number;
}

export interface Lesson {
  id: number;
  title: string;
  content: string | null;
  videoUrl: string | null;
  order: number;
  sectionId: number;
  test: TestLite | null;
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
}

export type ActiveItem =
  | { type: 'SECTION'; id: number }
  | { type: 'LESSON'; id: number }
  | { type: 'TEST'; id: number }
  | null;

export interface Answer {
  id: number;
  questionId: number;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: number;
  testId: number;
  text: string;
  type: QuestionType;
  difficulty: number;
  answers: Answer[];
}

export interface TestFull {
  id: number;
  lessonId: number;
  title: string;
  timeLimit: number;
  passingScore: number;
  questions: Question[];
}

export interface SessionAnswer {
  id: number;
  text: string;
}

export interface SessionQuestion {
  id: number;
  testId: number;
  text: string;
  type: QuestionType;
  difficulty: number;
  answers: SessionAnswer[];
}

export interface TestStartResponse {
  testResultId: number;
  attempt: number;
  timeLimit: number;
  startedAt: string;
  questions: SessionQuestion[];
}

export interface SubmitResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  finishedAt: string;
}

export interface MyTestResultDetail {
  questionId: number;
  correctAnswerIds: number[];
  userAnswerIds: number[];
}

export interface MyTestResult {
  id: number;
  score: number;
  passed: boolean;
  finishedAt: string;
  details: MyTestResultDetail[];
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
