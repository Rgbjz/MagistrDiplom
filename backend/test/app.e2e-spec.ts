/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- loose Prisma mocks */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Route smoke test without a database: every route from the API contract
 * must be registered (guards answer 401, never 404).
 */
describe('API routes (e2e, no DB)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const protectedRoutes: [string, string][] = [
    ['get', '/api/users/me'],
    ['post', '/api/users/me/password'],
    ['get', '/api/users/me/sessions'],
    ['delete', '/api/users/me/sessions/1'],
    ['delete', '/api/users/me'],
    ['get', '/api/users/me/courses'],
    ['get', '/api/notifications'],
    ['get', '/api/notifications/unread-count'],
    ['patch', '/api/notifications/1/read'],
    ['post', '/api/notifications/read-all'],
    ['get', '/api/certificates/me'],
    ['post', '/api/courses/1/certificate'],
    ['get', '/api/courses/1/tests-summary'],
    ['get', '/api/courses/1/enrollments'],
    ['get', '/api/courses/1/students/progress'],
    ['get', '/api/tests/1/my-result'],
    ['get', '/api/tests/1/my-attempts'],
    ['get', '/api/courses/1/question-bank'],
    ['post', '/api/courses/1/question-bank/import'],
    ['get', '/api/courses/1/question-bank/export'],
    ['get', '/api/tests/reviews/course/1'],
    ['patch', '/api/tests/attempt-questions/1/grade'],
    ['put', '/api/tests/1/random-rules'],
    ['delete', '/api/tests/1'],
    ['get', '/api/admin/stats'],
    ['get', '/api/admin/users'],
    ['patch', '/api/admin/users/1'],
    ['get', '/api/admin/payments'],
    ['get', '/api/admin/courses'],
    ['get', '/api/dashboard'],
    ['post', '/api/store/courses/1/purchase'],
    ['get', '/api/store/me/purchases'],
    ['get', '/api/chat/conversations/1/call'],
    ['get', '/api/chat/contacts?q=a'],
    ['get', '/api/calls/ice-servers'],
    ['post', '/api/chat/groups'],
    ['get', '/api/chat/groups/1'],
    ['patch', '/api/chat/groups/1'],
    ['post', '/api/chat/groups/1/members'],
    ['delete', '/api/chat/groups/1/members/2'],
    ['post', '/api/chat/groups/1/leave'],
    ['post', '/api/lessons/1/assignment'],
    ['get', '/api/assignments/1'],
    ['patch', '/api/assignments/1'],
    ['delete', '/api/assignments/1'],
    ['post', '/api/assignments/1/submission'],
    ['get', '/api/assignments/1/submissions'],
    ['patch', '/api/submissions/1/grade'],
    ['patch', '/api/submissions/1/return'],
    ['get', '/api/courses/1/assignments-summary'],
    ['get', '/api/courses/1/gradebook'],
    ['get', '/api/courses/1/gradebook/export?format=xlsx'],
    ['put', '/api/courses/1/gradebook/overrides'],
    ['delete', '/api/courses/1/gradebook/overrides?userId=1&itemKey=final'],
    ['get', '/api/courses/1/gradebook/overrides/history?userId=1'],
    ['get', '/api/courses/1/staff'],
    ['post', '/api/courses/1/staff'],
    ['patch', '/api/courses/1/staff/2'],
    ['delete', '/api/courses/1/staff/2'],
    ['post', '/api/courses/1/staff/transfer'],
    ['get', '/api/courses/1/my-grades'],
    ['get', '/api/calendar'],
    ['get', '/api/calendar/ical-url'],
    ['post', '/api/calendar/ical/reset'],
    ['post', '/api/courses/1/events'],
    ['patch', '/api/courses/1/events/1'],
    ['delete', '/api/courses/1/events/1'],
    ['post', '/api/calendar/dev/remind'],
    ['post', '/api/lessons/1/video/uploads'],
    ['get', '/api/lessons/1/video'],
    ['delete', '/api/lessons/1/video'],
    ['post', '/api/lessons/1/video/retry'],
    ['post', '/api/lessons/1/video/complete'],
    ['get', '/api/videos/uploads/0123456789abcdef0123456789abcdef'],
    ['put', '/api/videos/uploads/0123456789abcdef0123456789abcdef/chunks/0'],
    ['post', '/api/videos/uploads/0123456789abcdef0123456789abcdef/complete'],
  ];

  it.each(protectedRoutes)('%s %s requires auth', async (method, path) => {
    const res = await (request(app.getHttpServer()) as any)[method](path);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid iCal feed token without auth', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/calendar/ical/not-a-token.ics',
    );
    expect(res.status).toBe(404);
  });

  it('validates public auth bodies', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/auth/forgot-password')
      .send({})
      .expect(400);
    await request(server)
      .post('/api/auth/resend-confirmation')
      .send({ email: 'x' })
      .expect(400);
    await request(server)
      .post('/api/auth/reset-password')
      .send({ token: 't', password: '1' })
      .expect(400);
  });

  it('protects lesson and submission files', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/files/lesson-file/1').expect(401);
    await request(server).get('/api/files/submission-file/1').expect(401);
    await request(server)
      .get('/api/files/lesson-video/1?u=1&exp=9999999999&sig=forged')
      .expect(401);
    await request(server).get('/api/files/other/1').expect(400);
  });

  it('protects HLS playlists and segments', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/files/hls/1/master.m3u8').expect(401);
    await request(server).get('/api/files/hls/1/720p_000.ts').expect(401);
    await request(server)
      .get('/api/files/hls/1/master.m3u8?u=1&exp=9999999999&sig=forged')
      .expect(401);
    await request(server).get('/api/files/hls/1/..%2Fsecret').expect(404);
  });

  it('validates catalog query params', async () => {
    await request(app.getHttpServer())
      .get('/api/store/catalog?sort=bogus')
      .expect(400);
  });
});
