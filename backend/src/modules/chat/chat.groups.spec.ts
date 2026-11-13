/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- in-memory Prisma mock */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Group chats over a tiny in-memory stand-in for the Prisma calls the group
 * code uses. Users: 1 teacher of course 100; 2, 3 students of course 100;
 * 4 a student of another course (no shared course with 1–3); 9 an admin.
 */
type Row = Record<string, any>;

function makeDb() {
  const users: Row[] = [1, 2, 3, 4, 9].map((id) => ({
    id,
    email: `u${id}@lms.local`,
    role: id === 1 ? 'TEACHER' : id === 9 ? 'ADMIN' : 'STUDENT',
    blocked: false,
    profile: { firstName: `User${id}`, lastName: '', avatarUrl: null },
  }));
  const enrollments = [
    { userId: 2, courseId: 100, status: 'ACTIVE' },
    { userId: 3, courseId: 100, status: 'ACTIVE' },
    { userId: 4, courseId: 200, status: 'ACTIVE' },
  ];
  const courses = [
    { id: 100, teacherId: 1 },
    { id: 200, teacherId: 5 },
  ];
  const conversations: Row[] = [];
  let participants: Row[] = [];
  let nextConv = 1;
  let tick = 0;

  const inList = (v: unknown, f: any) =>
    f === undefined ||
    (typeof f === 'object' && f !== null
      ? (f.in ? f.in.includes(v) : true) && (f.not === undefined || f.not !== v)
      : f === v);

  const withParticipants = (c: Row) => ({
    ...c,
    participants: participants
      .filter((p) => p.conversationId === c.id)
      .map((p) => ({
        ...p,
        user: users.find((u) => u.id === p.userId),
      })),
    course: null,
    messages: [],
  });

  const prisma: any = {
    enrollment: {
      findMany: jest.fn(({ where }) =>
        enrollments.filter(
          (e) =>
            inList(e.userId, where.userId) &&
            inList(e.courseId, where.courseId) &&
            inList(e.status, where.status),
        ),
      ),
    },
    course: {
      findMany: jest.fn(({ where }) =>
        where.OR
          ? courses.filter((c) => c.teacherId === where.OR[0].teacherId)
          : courses.filter((c) => inList(c.id, where.id)),
      ),
    },
    courseStaff: { findMany: jest.fn(() => []) },
    user: {
      findMany: jest.fn(({ where }) =>
        users.filter((u) => inList(u.id, where.id) && !u.blocked),
      ),
      findUnique: jest.fn(({ where }) => users.find((u) => u.id === where.id)),
    },
    conversation: {
      create: jest.fn(({ data }) => {
        const c = {
          id: nextConv++,
          type: data.type,
          title: data.title,
          ownerId: data.ownerId,
          courseId: null,
        };
        conversations.push(c);
        for (const p of data.participants.create) {
          participants.push({
            conversationId: c.id,
            userId: p.userId,
            createdAt: tick++,
          });
        }
        return c;
      }),
      findUnique: jest.fn(({ where }) => {
        const c = conversations.find((x) => x.id === where.id);
        return c ? withParticipants(c) : null;
      }),
      update: jest.fn(({ where, data }) => {
        const c = conversations.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      }),
      delete: jest.fn(({ where }) => {
        conversations.splice(
          conversations.findIndex((x) => x.id === where.id),
          1,
        );
        participants = participants.filter(
          (p) => p.conversationId !== where.id,
        );
      }),
    },
    conversationParticipant: {
      findMany: jest.fn(({ where }) => {
        if (where.conversation) return []; // direct chats: none in this fixture
        return participants
          .filter((p) => p.conversationId === where.conversationId)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((p) => ({ ...p, user: users.find((u) => u.id === p.userId) }));
      }),
      findFirst: jest.fn(
        ({ where }) =>
          participants
            .filter((p) => p.conversationId === where.conversationId)
            .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
      ),
      createMany: jest.fn(({ data }) => {
        for (const d of data) participants.push({ ...d, createdAt: tick++ });
      }),
      delete: jest.fn(({ where }) => {
        const { conversationId, userId } = where.conversationId_userId;
        participants = participants.filter(
          (p) => !(p.conversationId === conversationId && p.userId === userId),
        );
      }),
    },
  };
  return { prisma, participants: () => participants, conversations };
}

const as = (id: number, role: AuthUser['role'] = 'STUDENT'): AuthUser => ({
  id,
  role,
});

describe('ChatService groups', () => {
  let db: ReturnType<typeof makeDb>;
  let service: ChatService;
  let notifyMany: jest.Mock;

  beforeEach(() => {
    db = makeDb();
    notifyMany = jest.fn();
    service = new ChatService(db.prisma, { notifyMany } as any);
  });

  it('a student creates a group with classmates and the teacher', async () => {
    const group = await service.createGroup(
      as(2),
      '  Команда проєкту ',
      [3, 1],
    );
    expect(group).toMatchObject({
      type: 'GROUP',
      title: 'Команда проєкту',
      memberCount: 3,
      ownerId: 2,
    });
    expect(notifyMany).toHaveBeenCalledWith(
      [3, 1],
      expect.objectContaining({ type: 'NEW_MESSAGE' }),
    );
  });

  it('only people from shared courses can be added', async () => {
    await expect(service.createGroup(as(2), 'G', [4])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.createGroup(as(2), 'G', [77])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('admins may add anyone', async () => {
    const group = await service.createGroup(as(9, 'ADMIN'), 'Admins', [4, 2]);
    expect(group.memberCount).toBe(3);
  });

  it('contacts list only shows shared-course people', async () => {
    const contacts = await service.contacts(as(2));
    expect(contacts.map((c) => c.id).sort()).toEqual([1, 3]);
  });

  it('only the owner renames and manages members', async () => {
    const { id } = await service.createGroup(as(1, 'TEACHER'), 'Пара', [2]);
    await expect(service.renameGroup(id, as(2), 'X')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.addMembers(id, as(2), [3])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const renamed = await service.renameGroup(
      id,
      as(1, 'TEACHER'),
      'Нова назва',
    );
    expect(renamed.title).toBe('Нова назва');
    const added = await service.addMembers(id, as(1, 'TEACHER'), [3]);
    expect(added.members.map((m) => m.id)).toEqual([1, 2, 3]);
    const removed = await service.removeMember(id, as(1, 'TEACHER'), 2);
    expect(removed.members.map((m) => m.id)).toEqual([1, 3]);
  });

  it('non-members cannot read a group', async () => {
    const { id } = await service.createGroup(as(2), 'G', [3]);
    await expect(
      service.groupDetails(id, as(1, 'TEACHER')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('owner leaving hands the group over; the last one out deletes it', async () => {
    const { id } = await service.createGroup(as(2), 'G', [3]);
    await service.leaveGroup(id, as(2));
    expect(db.conversations[0].ownerId).toBe(3);
    await service.leaveGroup(id, as(3));
    expect(db.conversations).toHaveLength(0);
  });
});
