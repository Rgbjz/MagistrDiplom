import {
  Optional,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService, originalName } from '../storage/storage.service';
import { RemindersService } from '../calendar/reminders.service';
import { displayName } from '../../common/utils/names';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type {
  CreateAssignmentDto,
  GradeSubmissionDto,
  ReturnSubmissionDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';
import { msg } from '../../common/i18n';
import {
  assertRoleOnCourse,
  can,
  courseStaffIds,
  getCourseRole,
  type CoursePermission,
} from '../../common/access/course-access';

const withCourse = {
  lesson: {
    select: {
      title: true,
      section: {
        select: {
          course: { select: { id: true, title: true, teacherId: true } },
        },
      },
    },
  },
} as const;

const fileSelect = {
  id: true,
  name: true,
  url: true,
  size: true,
  mimeType: true,
  createdAt: true,
} as const;

const submissionInclude = {
  files: { select: fileSelect, orderBy: { id: 'asc' } },
} satisfies Prisma.SubmissionInclude;

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: StorageService,
    @Optional() private reminders?: RemindersService,
  ) {}

  // ===== access helpers =====

  private async assertTeacher(
    course: { id: number; teacherId: number },
    user: AuthUser,
    permission: CoursePermission = 'content',
  ) {
    await assertRoleOnCourse(this.prisma, course, user, permission);
  }

  private async loadAssignment(id: number) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: withCourse,
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    return assignment;
  }

  private async assertActiveStudent(courseId: number, userId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not enrolled in this course');
    }
  }

  // ===== teacher: CRUD =====

  async create(lessonId: number, dto: CreateAssignmentDto, user: AuthUser) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } }, assignment: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    await this.assertTeacher(lesson.section.course, user);
    if (lesson.assignment) {
      throw new BadRequestException(
        'Assignment already exists for this lesson',
      );
    }
    const created = await this.prisma.assignment.create({
      data: {
        lessonId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        maxScore: dto.maxScore ?? 100,
        maxFiles: dto.maxFiles ?? 5,
      },
    });
    await this.reminders?.scheduleAssignment(created.id);
    return created;
  }

  async update(id: number, dto: UpdateAssignmentDto, user: AuthUser) {
    const assignment = await this.loadAssignment(id);
    await this.assertTeacher(assignment.lesson.section.course, user);
    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        dueAt:
          dto.dueAt === undefined
            ? undefined
            : dto.dueAt
              ? new Date(dto.dueAt)
              : null,
        maxScore: dto.maxScore,
        maxFiles: dto.maxFiles,
      },
    });
    // A moved deadline gets new reminder jobs; old ones skip themselves.
    if (dto.dueAt !== undefined) await this.reminders?.scheduleAssignment(id);
    return updated;
  }

  async remove(id: number, user: AuthUser) {
    const assignment = await this.loadAssignment(id);
    await this.assertTeacher(assignment.lesson.section.course, user);
    const files = await this.prisma.submissionFile.findMany({
      where: { submission: { assignmentId: id } },
      select: { url: true },
    });
    await this.prisma.assignment.delete({ where: { id } });
    await Promise.all(files.map((f) => this.storage.remove(f.url)));
  }

  // ===== read =====

  async getOne(id: number, user: AuthUser) {
    const assignment = await this.loadAssignment(id);
    const course = assignment.lesson.section.course;
    let submission: Awaited<ReturnType<typeof this.ownSubmission>> = null;
    // Team members (incl. assistants with a student account) get the teacher view.
    const role = await getCourseRole(this.prisma, course.id, user);
    if (user.role === 'STUDENT' && !can(role, 'view')) {
      await this.assertActiveStudent(course.id, user.id);
      submission = await this.ownSubmission(id, user.id);
    } else {
      await this.assertTeacher(course, user, 'view');
    }
    const { lesson, ...rest } = assignment;
    return {
      ...rest,
      lessonTitle: lesson.title,
      courseId: course.id,
      courseTitle: course.title,
      submission,
    };
  }

  private ownSubmission(assignmentId: number, userId: number) {
    return this.prisma.submission.findUnique({
      where: { assignmentId_userId: { assignmentId, userId } },
      include: submissionInclude,
    });
  }

  // ===== student: submit =====

  async submit(
    id: number,
    files: Express.Multer.File[] | undefined,
    comment: string | undefined,
    user: AuthUser,
  ) {
    const assignment = await this.loadAssignment(id);
    const course = assignment.lesson.section.course;
    await this.assertActiveStudent(course.id, user.id);

    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    if (files.length > assignment.maxFiles) {
      throw new BadRequestException(
        `At most ${assignment.maxFiles} files can be submitted`,
      );
    }

    const existing = await this.prisma.submission.findUnique({
      where: { assignmentId_userId: { assignmentId: id, userId: user.id } },
      include: { files: { select: { url: true } } },
    });
    if (existing?.status === 'GRADED') {
      throw new BadRequestException('Submission already graded');
    }

    const now = new Date();
    const late = !!assignment.dueAt && now > assignment.dueAt;
    const stored = await Promise.all(
      files.map(async (f) => ({
        name: originalName(f),
        url: await this.storage.save(f, 'submissions'),
        size: f.size,
        mimeType: f.mimetype || 'application/octet-stream',
      })),
    );

    const data = {
      comment: comment?.trim() || null,
      status: 'SUBMITTED' as const,
      submittedAt: now,
      late,
      score: null,
      gradedAt: null,
    };
    const submission = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.submissionFile.deleteMany({
          where: { submissionId: existing.id },
        });
        return tx.submission.update({
          where: { id: existing.id },
          data: { ...data, files: { create: stored } },
          include: submissionInclude,
        });
      }
      return tx.submission.create({
        data: {
          ...data,
          assignmentId: id,
          userId: user.id,
          files: { create: stored },
        },
        include: submissionInclude,
      });
    });

    // Old files are only removed once the new submission is safely stored.
    if (existing) {
      await Promise.all(existing.files.map((f) => this.storage.remove(f.url)));
    }

    const student = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, profile: true },
    });
    await this.notifications.notifyMany(
      await courseStaffIds(this.prisma, course),
      {
        type: 'ASSIGNMENT_SUBMITTED',
        title: msg('notify.assignmentSubmitted.title', {
          student: student ? displayName(student) : (user.email ?? ''),
          assignment: assignment.title,
        }),
        body: msg(late ? 'notify.courseBodyLate' : 'notify.courseBody', {
          course: course.title,
        }),
        link: `/courses/${course.id}/manage?tab=assignments`,
      },
    );
    return submission;
  }

  // ===== teacher: review =====

  async submissions(id: number, user: AuthUser) {
    const assignment = await this.loadAssignment(id);
    await this.assertTeacher(assignment.lesson.section.course, user, 'grade');
    const rows = await this.prisma.submission.findMany({
      where: { assignmentId: id },
      orderBy: { submittedAt: 'desc' },
      include: {
        ...submissionInclude,
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
      },
    });
    return rows.map(({ user: u, ...s }) => ({
      ...s,
      student: {
        id: u.id,
        name: displayName(u),
        email: u.email,
        avatarUrl: u.profile?.avatarUrl ?? null,
      },
    }));
  }

  private async loadSubmission(id: number, user: AuthUser) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: { assignment: { include: withCourse } },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    await this.assertTeacher(
      submission.assignment.lesson.section.course,
      user,
      'grade',
    );
    return submission;
  }

  async grade(id: number, dto: GradeSubmissionDto, user: AuthUser) {
    const submission = await this.loadSubmission(id, user);
    const { assignment } = submission;
    if (dto.score < 0 || dto.score > assignment.maxScore) {
      throw new BadRequestException(
        `Score must be between 0 and ${assignment.maxScore}`,
      );
    }
    const updated = await this.prisma.submission.update({
      where: { id },
      data: {
        status: 'GRADED',
        score: dto.score,
        feedback: dto.feedback?.trim() || null,
        gradedAt: new Date(),
      },
      include: submissionInclude,
    });
    const course = assignment.lesson.section.course;
    await this.notifications.notify(submission.userId, {
      type: 'ASSIGNMENT_GRADED',
      title: msg('notify.assignmentGraded.title', {
        assignment: assignment.title,
        score: dto.score,
        max: assignment.maxScore,
      }),
      body: msg('notify.courseBody', { course: course.title }),
      link: `/courses/${course.id}?assignment=${assignment.id}`,
    });
    return updated;
  }

  async returnForRevision(
    id: number,
    dto: ReturnSubmissionDto,
    user: AuthUser,
  ) {
    const submission = await this.loadSubmission(id, user);
    const { assignment } = submission;
    const updated = await this.prisma.submission.update({
      where: { id },
      data: {
        status: 'RETURNED',
        score: null,
        feedback: dto.feedback.trim(),
        gradedAt: new Date(),
      },
      include: submissionInclude,
    });
    const course = assignment.lesson.section.course;
    await this.notifications.notify(submission.userId, {
      type: 'ASSIGNMENT_GRADED',
      title: msg('notify.assignmentReturned.title', {
        assignment: assignment.title,
      }),
      body: msg('notify.courseBody', { course: course.title }),
      link: `/courses/${course.id}?assignment=${assignment.id}`,
    });
    return updated;
  }

  async courseSummary(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    await this.assertTeacher(course, user, 'view');
    const assignments = await this.prisma.assignment.findMany({
      where: { lesson: { section: { courseId } } },
      orderBy: [
        { lesson: { section: { order: 'asc' } } },
        { lesson: { order: 'asc' } },
      ],
      include: {
        lesson: { select: { title: true } },
        submissions: { select: { status: true, late: true } },
      },
    });
    return assignments.map((a) => {
      const count = (status: string) =>
        a.submissions.filter((s) => s.status === status).length;
      return {
        assignmentId: a.id,
        title: a.title,
        lessonTitle: a.lesson.title,
        dueAt: a.dueAt,
        maxScore: a.maxScore,
        total: a.submissions.length,
        pending: count('SUBMITTED'),
        graded: count('GRADED'),
        returned: count('RETURNED'),
        late: a.submissions.filter((s) => s.late).length,
      };
    });
  }
}
