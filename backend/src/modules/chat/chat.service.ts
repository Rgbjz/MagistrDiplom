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
import { MAX_GROUP_MEMBERS } from './dto/group.dto';

const senderSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true } },
};

const memberSelect = {
  id: true,
  email: true,
  role: true,
  profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
};

type MemberRow = {
  id: number;
  email: string;
  role: string;
  profile: {
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
};

function memberCard(u: MemberRow) {
  return {
    id: u.id,
    name: displayName(u),
    email: u.email,
    role: u.role,
    avatarUrl: u.profile?.avatarUrl ?? null,
  };
}

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

  async getOrCreateDirect(user: AuthUser, otherUserId: number) {
    const userId = user.id;
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot message yourself');
    }
    const other = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, role: true, blocked: true },
    });
    if (!other || other.blocked) throw new NotFoundException('User not found');

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
      if (!(await this.canStartDirect(user, other))) {
        throw new ForbiddenException(
          'You can message teachers and people from your courses',
        );
      }
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
    if (conversation.type === 'DIRECT' || conversation.type === 'GROUP') {
      await this.notifyDirectRecipients(
        conversationId,
        sender.id,
        message,
        conversation.type === 'GROUP' ? (conversation.title ?? '') : null,
      );
    }
    return message;
  }

  /**
   * One unread notification per direct or group conversation, not one per
   * message. `group` is the group title (null for a direct chat).
   */
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
    group: string | null = null,
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
        title:
          group === null
            ? msg('notify.newMessage.title', {
                sender: displayName(message.sender),
              })
            : msg('notify.groupMessage.title', {
                sender: displayName(message.sender),
                group,
              }),
        body: message.content.slice(0, 140),
        link,
      });
    }
  }

  /**
   * Who gets rung for a call and how the ring is titled. DIRECT/GROUP: the
   * other participants; COURSE: the course team and ACTIVE students (minus the
   * caller).
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
      groupTitle: conversation.type === 'GROUP' ? conversation.title : null,
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

  // ===== Group chats =====

  /**
   * People the user may put into a group: everyone they share a course with
   * (classmates, the course team, students of courses they teach) and people
   * they already have a direct chat with. Admins may add anyone. Mirrors who
   * a user meets in chats anyway, so groups don't open a new contact channel.
   */
  private async contactIds(user: AuthUser): Promise<Set<number> | 'all'> {
    if (user.role === 'ADMIN') return 'all';
    const [enrollments, taught, directs] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId: user.id, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { courseId: true },
      }),
      this.prisma.course.findMany({
        where: {
          OR: [
            { teacherId: user.id },
            { staff: { some: { userId: user.id } } },
          ],
        },
        select: { id: true },
      }),
      this.prisma.conversationParticipant.findMany({
        where: {
          conversation: {
            type: 'DIRECT',
            participants: { some: { userId: user.id } },
          },
        },
        select: { userId: true },
      }),
    ]);
    const courseIds = [
      ...new Set([
        ...enrollments.map((e) => e.courseId),
        ...taught.map((c) => c.id),
      ]),
    ];
    const ids = new Set<number>(directs.map((d) => d.userId));
    if (courseIds.length) {
      const [students, courses] = await Promise.all([
        this.prisma.enrollment.findMany({
          where: {
            courseId: { in: courseIds },
            status: { in: ['ACTIVE', 'COMPLETED'] },
          },
          select: { userId: true },
        }),
        this.prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, teacherId: true },
        }),
      ]);
      students.forEach((s) => ids.add(s.userId));
      for (const course of courses) {
        (await courseStaffIds(this.prisma, course)).forEach((id) =>
          ids.add(id),
        );
      }
    }
    ids.delete(user.id);
    return ids;
  }

  /**
   * Who may open a new direct chat: teachers and admins with anyone; a
   * student with any teacher/admin and with people from their courses or
   * earlier chats — not with unrelated students.
   */
  private async canStartDirect(
    user: AuthUser,
    other: { id: number; role: string },
  ): Promise<boolean> {
    if (user.role !== 'STUDENT') return true;
    if (other.role !== 'STUDENT') return true;
    const allowed = await this.contactIds(user);
    return allowed === 'all' || allowed.has(other.id);
  }

  /**
   * Contacts matching a name/email query. `group`: people who can be added
   * to a group chat; `direct`: people the user can start a chat with.
   */
  async contacts(
    user: AuthUser,
    query = '',
    scope: 'group' | 'direct' = 'group',
  ) {
    const allowed =
      scope === 'direct' && user.role !== 'STUDENT'
        ? 'all'
        : await this.contactIds(user);
    const q = query.trim();
    const users = await this.prisma.user.findMany({
      where: {
        blocked: false,
        ...(allowed === 'all'
          ? { id: { not: user.id } }
          : scope === 'direct'
            ? // A student may also start a chat with any teacher or admin.
              {
                AND: [
                  { id: { not: user.id } },
                  {
                    OR: [
                      { id: { in: [...allowed] } },
                      { role: { not: 'STUDENT' as const } },
                    ],
                  },
                ],
              }
            : { id: { in: [...allowed] } }),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' as const } },
                {
                  profile: {
                    OR: [
                      {
                        firstName: {
                          contains: q,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        lastName: { contains: q, mode: 'insensitive' as const },
                      },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      select: memberSelect,
      orderBy: [{ profile: { firstName: 'asc' } }, { email: 'asc' }],
      take: 30,
    });
    return users.map(memberCard);
  }

  private async assertContacts(user: AuthUser, userIds: number[]) {
    const allowed = await this.contactIds(user);
    const existing = await this.prisma.user.findMany({
      where: { id: { in: userIds }, blocked: false },
      select: { id: true },
    });
    if (existing.length !== userIds.length) {
      throw new NotFoundException('User not found');
    }
    if (allowed !== 'all' && userIds.some((id) => !allowed.has(id))) {
      throw new ForbiddenException('You can only add people from your courses');
    }
  }

  /** The group, if the user is in it; owner-only actions pass `ownerOnly`. */
  private async groupFor(id: number, user: AuthUser, ownerOnly = false) {
    const group = await this.prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } },
    });
    if (!group || group.type !== 'GROUP') {
      throw new NotFoundException('Group not found');
    }
    if (!group.participants.some((p) => p.userId === user.id)) {
      throw new ForbiddenException('Not a participant');
    }
    if (ownerOnly && group.ownerId !== user.id) {
      throw new ForbiddenException('Only the group owner can do this');
    }
    return group;
  }

  async createGroup(user: AuthUser, title: string, memberIds: number[]) {
    const ids = [...new Set(memberIds)].filter((id) => id !== user.id);
    if (!ids.length) throw new BadRequestException('Add at least one member');
    if (ids.length + 1 > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(
        `A group can have at most ${MAX_GROUP_MEMBERS} members`,
      );
    }
    await this.assertContacts(user, ids);
    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: title.trim(),
        ownerId: user.id,
        participants: {
          create: [{ userId: user.id }, ...ids.map((userId) => ({ userId }))],
        },
      },
    });
    await this.notifyAdded(
      conversation.id,
      conversation.title ?? '',
      user,
      ids,
    );
    return this.dto(conversation.id, user.id);
  }

  async groupDetails(id: number, user: AuthUser) {
    const group = await this.groupFor(id, user);
    const members = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: memberSelect } },
    });
    return {
      id: group.id,
      title: group.title ?? '',
      ownerId: group.ownerId,
      members: members.map((m) => memberCard(m.user)),
    };
  }

  async renameGroup(id: number, user: AuthUser, title: string) {
    await this.groupFor(id, user, true);
    await this.prisma.conversation.update({
      where: { id },
      data: { title: title.trim() },
    });
    return this.groupDetails(id, user);
  }

  async addMembers(id: number, user: AuthUser, userIds: number[]) {
    const group = await this.groupFor(id, user, true);
    const current = new Set(group.participants.map((p) => p.userId));
    const ids = [...new Set(userIds)].filter((uid) => !current.has(uid));
    if (!ids.length) return this.groupDetails(id, user);
    if (current.size + ids.length > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(
        `A group can have at most ${MAX_GROUP_MEMBERS} members`,
      );
    }
    await this.assertContacts(user, ids);
    await this.prisma.conversationParticipant.createMany({
      data: ids.map((userId) => ({ conversationId: id, userId })),
      skipDuplicates: true,
    });
    await this.notifyAdded(id, group.title ?? '', user, ids);
    return this.groupDetails(id, user);
  }

  async removeMember(id: number, user: AuthUser, memberId: number) {
    if (memberId === user.id) return this.leaveGroup(id, user);
    const group = await this.groupFor(id, user, true);
    if (!group.participants.some((p) => p.userId === memberId)) {
      throw new NotFoundException('Not a member');
    }
    await this.prisma.conversationParticipant.delete({
      where: {
        conversationId_userId: { conversationId: id, userId: memberId },
      },
    });
    return this.groupDetails(id, user);
  }

  /**
   * Leaves the group. An owner hands the group to the longest-standing
   * member; the last member leaving deletes the group with its messages.
   */
  async leaveGroup(id: number, user: AuthUser) {
    const group = await this.groupFor(id, user);
    await this.prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
    });
    const next = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    if (!next) {
      await this.prisma.conversation.delete({ where: { id } });
    } else if (group.ownerId === user.id) {
      await this.prisma.conversation.update({
        where: { id },
        data: { ownerId: next.userId },
      });
    }
    return { left: true };
  }

  private async notifyAdded(
    conversationId: number,
    group: string,
    by: AuthUser,
    userIds: number[],
  ) {
    const sender = await this.prisma.user.findUnique({
      where: { id: by.id },
      select: senderSelect,
    });
    await this.notifications.notifyMany(userIds, {
      type: 'NEW_MESSAGE',
      title: msg('notify.groupAdded.title', { group }),
      body: msg('notify.groupAdded.body', {
        sender: sender ? displayName(sender) : '',
      }),
      link: `/chat?c=${conversationId}`,
    });
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
      title?: string | null;
      ownerId?: number | null;
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
    } else if (c.type === 'GROUP') {
      title = c.title ?? '';
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
      memberCount: c.participants.length,
      ownerId: c.type === 'GROUP' ? (c.ownerId ?? null) : null,
      lastMessage: last
        ? { content: last.content, createdAt: last.createdAt }
        : null,
    };
  }
}
