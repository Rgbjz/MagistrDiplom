/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- loose Prisma mocks */
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  AuthService,
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
} from './auth.service';

describe('AuthService login lockout', () => {
  let prisma: any;
  let service: AuthService;
  let user: any;

  beforeAll(async () => {
    user = {
      id: 1,
      email: 'a@x.io',
      role: 'STUDENT',
      password: await bcrypt.hash('right', 4),
    };
  });

  beforeEach(() => {
    user = {
      ...user,
      emailVerified: true,
      blocked: false,
      failedLoginCount: 0,
      lockedUntil: null,
    };
    prisma = {
      user: {
        findUnique: jest.fn(() => Promise.resolve(user)),
        update: jest.fn(({ data }) => {
          user = { ...user, ...data };
          return Promise.resolve(user);
        }),
      },
      session: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = { sign: jest.fn().mockReturnValue('token') };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    service = new AuthService(prisma, jwt as any, config as any, {} as any);
  });

  it(`locks the account after ${MAX_FAILED_LOGINS} wrong passwords`, async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await expect(
        service.login({ email: user.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(user.lockedUntil.getTime()).toBeGreaterThan(
      Date.now() + (LOCKOUT_MINUTES - 1) * 60_000,
    );
    // Even the right password is refused while locked.
    await expect(
      service.login({ email: user.email, password: 'right' }),
    ).rejects.toMatchObject({
      status: HttpStatus.LOCKED,
    });
  });

  it('resets the counter after a successful login', async () => {
    await expect(
      service.login({ email: user.email, password: 'wrong' }),
    ).rejects.toBeTruthy();
    expect(user.failedLoginCount).toBe(1);
    await service.login({ email: user.email, password: 'right' });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it('lets the user in once the lock has expired', async () => {
    user.lockedUntil = new Date(Date.now() - 1000);
    await expect(
      service.login({ email: user.email, password: 'right' }),
    ).resolves.toBeTruthy();
  });

  it('reports the lock as HTTP 423', async () => {
    user.lockedUntil = new Date(Date.now() + 60_000);
    const err = await service
      .login({ email: user.email, password: 'right' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(423);
  });
});
