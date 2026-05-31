import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

const senderSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true } },
};

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  private async courseConversationAccess(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role === 'ADMIN' || course.teacherId === user.id) return;
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId: user.id, courseId, status: 'ACTIVE' },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled in this course');
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

  async listConversations(userId: number) {
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

  async createMessage(conversationId: number, sender: AuthUser, content: string) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Empty message');
    await this.assertAccess(conversationId, sender);
    const message = await this.prisma.message.create({
      data: { conversationId, senderId: sender.id, content: text },
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
        user: { id: number; email: string; profile: { firstName: string | null; lastName: string | null } | null };
      }[];
      messages: { id: number; content: string; createdAt: Date }[];
    },
    viewerId: number,
  ) {
    let title: string;
    if (c.type === 'COURSE') {
      title = c.course ? `Course: ${c.course.title}` : 'Course chat';
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
