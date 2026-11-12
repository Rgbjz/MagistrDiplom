/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import { StoreService } from './store.service';

describe('StoreService.catalog', () => {
  let prisma: any;
  let service: StoreService;

  beforeEach(() => {
    prisma = {
      course: {
        count: jest.fn().mockResolvedValue(30),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 1,
              title: 'SQL',
              description: null,
              imageUrl: null,
              price: 0,
              category: 'Бази даних',
              level: 'BEGINNER',
              teacher: {
                email: 't@x.io',
                profile: { firstName: 'Ira', lastName: 'M' },
              },
              sections: [
                { _count: { lessons: 3 } },
                { _count: { lessons: 2 } },
              ],
              _count: { sections: 2, enrollments: 4 },
            },
          ])
          .mockResolvedValueOnce([
            { category: 'Бази даних' },
            { category: 'Дизайн' },
          ]),
      },
    };
    service = new StoreService(prisma, {} as any);
  });

  it('builds filters, sorting and pagination from the query', async () => {
    const res = await service.catalog({
      search: 'sql',
      category: 'Бази даних',
      level: 'BEGINNER',
      price: 'paid',
      sort: 'price_asc',
      page: 3,
      pageSize: 5,
    });

    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      published: true,
      category: 'Бази даних',
      level: 'BEGINNER',
      price: { gt: 0 },
    });
    expect(args.where.OR).toHaveLength(2);
    expect(args.orderBy[0]).toEqual({ price: 'asc' });
    expect(args.skip).toBe(10);
    expect(args.take).toBe(5);
    expect(prisma.course.count).toHaveBeenCalledWith({ where: args.where });

    expect(res).toMatchObject({ total: 30, page: 3, pageSize: 5 });
    expect(res.categories).toEqual(['Бази даних', 'Дизайн']);
    expect(res.items[0]).toMatchObject({
      teacher: { name: 'Ira M' },
      sectionsCount: 2,
      lessonsCount: 5,
      studentsCount: 4,
    });
  });

  it('defaults to newest published courses, first page of 12', async () => {
    await service.catalog({ price: 'free' });
    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ published: true, price: 0 });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(12);
  });

  it('sorts by enrollments for "popular"', async () => {
    await service.catalog({ sort: 'popular' });
    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.orderBy[0]).toEqual({ enrollments: { _count: 'desc' } });
  });
});
