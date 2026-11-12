/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { originalName } from '../storage/storage.service';

const teacher = { id: 7, role: 'TEACHER' as const, email: 't@x.io' };
const stranger = { id: 8, role: 'TEACHER' as const, email: 'o@x.io' };

const lesson = {
  id: 3,
  videoUrl: '/public/videos/old.mp4',
  section: { course: { id: 1, teacherId: 7 } },
};

function upload(name = 'slides.pdf'): Express.Multer.File {
  return {
    originalname: name,
    mimetype: 'application/pdf',
    size: 1234,
    buffer: Buffer.from('x'),
  } as Express.Multer.File;
}

describe('LessonsService attachments', () => {
  let prisma: any;
  let storage: { save: jest.Mock; remove: jest.Mock; isStored: jest.Mock };
  let service: LessonsService;

  beforeEach(() => {
    prisma = {
      courseStaff: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      lesson: {
        findUnique: jest.fn().mockResolvedValue(lesson),
        update: jest.fn().mockResolvedValue({ ...lesson, videoUrl: 'new' }),
      },
      lessonFile: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          id: 1,
          ...data,
        })),
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          lessonId: 3,
          url: '/public/lessons/a.pdf',
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    storage = {
      save: jest.fn().mockResolvedValue('/public/lessons/stored.pdf'),
      remove: jest.fn().mockResolvedValue(undefined),
      isStored: jest.fn((url: string | null) => !!url?.startsWith('/public/')),
    };
    service = new LessonsService(
      prisma,
      { notifyMany: jest.fn() } as any,
      storage as any,
      { removeForLesson: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  it('stores an attachment for the course owner', async () => {
    const file = await service.addFile(3, upload(), teacher);
    expect(storage.save).toHaveBeenCalledWith(expect.anything(), 'lessons');
    expect(file).toMatchObject({
      lessonId: 3,
      name: 'slides.pdf',
      url: '/public/lessons/stored.pdf',
      size: 1234,
    });
  });

  it('rejects uploads to someone else’s course', async () => {
    await expect(service.addFile(3, upload(), stranger)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('rejects a missing file and the 21st attachment', async () => {
    await expect(service.addFile(3, undefined, teacher)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.lessonFile.count.mockResolvedValue(20);
    await expect(service.addFile(3, upload(), teacher)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes the record and the stored file', async () => {
    await service.deleteFile(5, teacher);
    expect(prisma.lessonFile.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(storage.remove).toHaveBeenCalledWith('/public/lessons/a.pdf');
  });

  it('404s for an unknown file', async () => {
    prisma.lessonFile.findUnique.mockResolvedValue(null);
    await expect(service.deleteFile(99, teacher)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('originalName', () => {
  it('re-decodes UTF-8 names that multer read as latin1', () => {
    const garbled = Buffer.from('Конспект уроку.pdf', 'utf8').toString(
      'latin1',
    );
    expect(originalName({ originalname: garbled } as Express.Multer.File)).toBe(
      'Конспект уроку.pdf',
    );
  });

  it('strips path separators', () => {
    expect(
      originalName({ originalname: '../../etc/passwd' } as Express.Multer.File),
    ).toBe('.._.._etc_passwd');
  });
});
