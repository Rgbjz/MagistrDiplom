import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { displayName } from '../../common/utils/names';
import { msg, render, type LocalizedText } from '../../common/i18n';
import {
  can,
  courseStaffIds,
  getCourseRole,
} from '../../common/access/course-access';

const senderSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true } },
};

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async courseConversationAccess(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (can(await getCourseRole(this.prisma, courseId, user), 'manage')) return;
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId: user.id, courseId, status: 'ACTIVE' },
    });
    if (!enrollment)
      throw new ForbiddenException('Not enrolled in this course');
  }

  /** Throws unless the user may access the conversation; lazily adds them to a COURSE room they can access. */
  async assertAccess(conversationId: number, user: AuthUser) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: user.id } },
    });
    if (participant) return;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.type === 'COURSE' && conversation.courseId) {
      await this.courseConversationAccess(conversation.courseId, user);
      await this.prisma.conversationParticipant.create({
        data: { conversationId, userId: user.id },
      });
      return;
    }
    throw new ForbiddenException('Not a participant');
  }

  async getCourseConversation(courseId: number, user: AuthUser) {
    await this.courseConversationAccess(courseId, user);
    let conversation = await this.prisma.conversation.findFirst({
      where: { type: 'COURSE', courseId },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { type: 'COURSE', courseId },
      });
    }
    await this.prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: user.id,
        },
      },
      create: { conversationId: conversation.id, userId: user.id },
      update: {},
    });
    return this.dto(conversation.id, user.id);
  }

  async getOrCreateDirect(userId: number, otherUserId: number) {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot message yourself');
    }
    const other = await this.prisma.user.findUnique({
      where: { id: otherUserId },
    });
    if (!other) throw new NotFoundException('User not found');

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: otherUserId } } },
        ],
      },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          type: 'DIRECT',
          participants: { create: [{ userId }, { userId: otherUserId }] },
        },
      });
    }
    return this.dto(conversation.id, userId);
  }

  /**
   * Makes the user a participant of the chat of every course they study in
   * (ACTIVE/COMPLETED enrollment) or teach, so course chats appear in the list
   * without first opening them from the course page.
   */
  private async ensureCourseMemberships(userId: number) {
    const [enrollments, staff] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { courseId: true },
      }),
      this.prisma.courseStaff.findMany({
        where: { userId },
        select: { courseId: true },
      }),
    ]);
    const courseIds = [
      ...new Set([...enrollments, ...staff].map((e) => e.courseId)),
    ];
    if (!courseIds.length) return;
    const existing = await this.prisma.conversation.findMany({
      where: { type: 'COURSE', courseId: { in: courseIds } },
      select: {
        id: true,
        courseId: true,
        participants: { where: { userId }, select: { id: true } },
      },
    });
    const byCourse = new Map(existing.map((c) => [c.courseId, c]));
    for (const courseId of courseIds) {
      let conv = byCourse.get(courseId);
      if (!conv) {
        const created = await this.prisma.conversation.create({
          data: { type: 'COURSE', courseId },
        });
        conv = { id: created.id, courseId, participants: [] };
      }
      if (conv.participants.length) continue;
      await this.prisma.conversationParticipant.upsert({
        where: {
          conversationId_userId: { conversationId: conv.id, userId },
        },
        create: { conversationId: conv.id, userId },
        update: {},
      });
    }
  }

  async listConversations(userId: number) {
    await this.ensureCourseMemberships(userId);
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        course: { select: { id: true, title: true } },
        participants: { include: { user: { select: senderSelect } } },
        messages: { orderBy: { id: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return conversations.map((c) => this.toDto(c, userId));
  }

  async getMessages(conversationId: number, user: AuthUser, cursor?: number) {
    await this.assertAccess(conversationId, user);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { id: 'desc' },
      take: 30,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sender: { select: senderSelect } },
    });
    return messages.reverse();
  }

  async createMessage(
    conversationId: number,
    sender: AuthUser,
    content: string,
  ) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Empty message');
    await this.assertAccess(conversationId, sender);
    const message = await this.prisma.message.create({
      data: { conversationId, senderId: sender.id, content: text },
      include: { sender: { select: senderSelect } },
    });
    const conversation = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    if (conversation.type === 'DIRECT') {
      await this.notifyDirectRecipients(conversationId, sender.id, message);
    }
    return message;
  }

  /** One unread notification per direct conversation, not one per message. */
  private async notifyDirectRecipients(
    conversationId: number,
    senderId: number,
    message: {
      content: string;
      sender: {
        email: string;
        profile: { firstName: string | null; lastName: string | null } | null;
      };
    },
  ) {
    const link = `/chat?c=${conversationId}`;
    const recipients = (await this.participantIds(conversationId)).filter(
      (id) => id !== senderId,
    );
    for (const userId of recipients) {
      const pending = await this.prisma.notification.findFirst({
        where: { userId, type: 'NEW_MESSAGE', link, readAt: null },
      });
      if (pending) continue;
      await this.notifications.notify(userId, {
        type: 'NEW_MESSAGE',
        title: msg('notify.newMessage.title', {
          sender: displayName(message.sender),
        }),
        body: message.content.slice(0, 140),
        link,
      });
    }
  }

  /**
   * Who gets rung for a call and how the ring is titled. DIRECT: the other
   * participant; COURSE: the course team and ACTIVE students (minus the caller).
   */
  async callContext(conversationId: number, callerId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    let invited: number[];
    if (conversation.type === 'COURSE' && conversation.courseId) {
      const students = await this.prisma.enrollment.findMany({
        where: { courseId: conversation.courseId, status: 'ACTIVE' },
        select: { userId: true },
      });
      invited = [
        ...(conversation.course
          ? await courseStaffIds(this.prisma, conversation.course)
          : []),
        ...students.map((s) => s.userId),
      ];
    } else {
      invited = await this.participantIds(conversationId);
    }
    return {
      type: conversation.type,
      courseTitle: conversation.course?.title ?? null,
      invited: [...new Set(invited)].filter((id) => id !== callerId),
    };
  }

  /** Name and avatar shown on the incoming-call dialog and video tiles. */
  async userCard(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        profile: {
          select: { firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      name: displayName(user),
      avatarUrl: user.profile?.avatarUrl ?? null,
    };
  }

  /**
   * Stores a service message (call summary) without notifying anyone. Localized
   * text is rendered in the sender's (call initiator's) language.
   */
  async createServiceMessage(
    conversationId: number,
    senderId: number,
    content: string | LocalizedText,
  ) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: senderId },
      select: { locale: true },
    });
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: render(content, profile?.locale),
      },
      include: { sender: { select: senderSelect } },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return message;
  }

  /** Participant user ids (for targeted gateway broadcast if needed). */
  async participantIds(conversationId: number): Promise<number[]> {
    const ps = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return ps.map((p) => p.userId);
  }

  private async dto(conversationId: number, viewerId: number) {
    const c = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        course: { select: { id: true, title: true } },
        participants: { include: { user: { select: senderSelect } } },
        messages: { orderBy: { id: 'desc' }, take: 1 },
      },
    });
    return this.toDto(c!, viewerId);
  }

  private toDto(
    c: {
      id: number;
      type: string;
      courseId: number | null;
      course: { id: number; title: string } | null;
      participants: {
        user: {
          id: number;
          email: string;
          profile: { firstName: string | null; lastName: string | null } | null;
        };
      }[];
      messages: { id: number; content: string; createdAt: Date }[];
    },
    viewerId: number,
  ) {
    let title: string;
    if (c.type === 'COURSE') {
      title = c.course ? c.course.title : 'Чат курсу';
    } else {
      const other = c.participants.find((p) => p.user.id !== viewerId)?.user;
      const prof = other?.profile;
      title =
        prof && (prof.firstName || prof.lastName)
          ? `${prof.firstName ?? ''} ${prof.lastName ?? ''}`.trim()
          : (other?.email ?? 'Direct message');
    }
    const last = c.messages[0];
    return {
      id: c.id,
      type: c.type,
      courseId: c.courseId,
      title,
      lastMessage: last
        ? { content: last.content, createdAt: last.createdAt }
        : null,
    };
  }
}
