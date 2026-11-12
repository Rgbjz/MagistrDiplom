import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { NotificationsService } from '../notifications/notifications.service';
import { displayName, nameSelect } from '../../common/utils/names';
import { msg } from '../../common/i18n';

const certificateInclude = {
  user: { select: nameSelect },
  course: {
    select: {
      id: true,
      title: true,
      teacher: { select: nameSelect },
      sections: { select: { _count: { select: { lessons: true } } } },
    },
  },
} as const;

type CertificateRow = {
  code: string;
  issuedAt: Date;
  avgScore: number | null;
  user: {
    email: string;
    profile: { firstName: string | null; lastName: string | null } | null;
  };
  course: {
    id: number;
    title: string;
    teacher: {
      email: string;
      profile: { firstName: string | null; lastName: string | null } | null;
    };
    sections: { _count: { lessons: number } }[];
  };
};

@Injectable()
export class CertificatesService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
    private notifications: NotificationsService,
  ) {}

  private toDto(c: CertificateRow) {
    return {
      code: c.code,
      issuedAt: c.issuedAt,
      avgScore: c.avgScore,
      student: { name: displayName(c.user) },
      course: {
        id: c.course.id,
        title: c.course.title,
        lessonsCount: c.course.sections.reduce(
          (sum, s) => sum + s._count.lessons,
          0,
        ),
      },
      teacher: { name: displayName(c.course.teacher) },
    };
  }

  /** Issues the certificate once the course is 100% complete; idempotent. */
  async issue(courseId: number, userId: number) {
    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: certificateInclude,
    });
    if (existing) {
      return this.toDto(existing);
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not enrolled in this course');
    }
    const p = await this.progress.getProgress(courseId, userId);
    if (p.percent < 100) {
      throw new BadRequestException('Course is not completed yet');
    }

    const agg = await this.prisma.testResult.aggregate({
      where: {
        userId,
        finishedAt: { not: null },
        test: { lesson: { section: { courseId } } },
      },
      _avg: { score: true },
    });

    // Temporary unique code, replaced by a readable one derived from the id.
    const created = await this.prisma.certificate.create({
      data: {
        userId,
        courseId,
        code: `TMP-${crypto.randomUUID()}`,
        avgScore: agg._avg.score === null ? null : Math.round(agg._avg.score),
      },
    });
    const code = `LMS-${created.issuedAt.getFullYear()}-${String(created.id).padStart(6, '0')}`;
    const certificate = await this.prisma.certificate.update({
      where: { id: created.id },
      data: { code },
      include: certificateInclude,
    });
    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { completedAt: new Date() },
    });
    await this.notifications.notify(userId, {
      type: 'CERTIFICATE',
      title: msg('notify.certificate.title', {
        course: certificate.course.title,
      }),
      body: msg('notify.certificate.body', { code }),
      link: `/certificates/${code}`,
    });
    return this.toDto(certificate);
  }

  async listMine(userId: number) {
    const rows = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: certificateInclude,
    });
    return rows.map((r) => this.toDto(r));
  }

  async getByCode(code: string) {
    const row = await this.prisma.certificate.findUnique({
      where: { code },
      include: certificateInclude,
    });
    if (!row) {
      throw new NotFoundException('Certificate not found');
    }
    return this.toDto(row);
  }
}
