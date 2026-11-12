/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- in-memory Prisma mock */
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService session-bound tokens', () => {
  let sessions: any[];
  let service: AuthService;
  const user = {
    id: 7,
    email: 's@x.io',
    role: 'STUDENT',
    blocked: false,
    emailVerified: true,
    failedLoginCount: 0,
    lockedUntil: null,
    password: '',
  };

  beforeAll(async () => {
    user.password = await bcrypt.hash('pw', 4);
  });

  beforeEach(() => {
    sessions = [];
    let nextId = 1;
    const prisma: any = {
      user: {
        findUnique: jest.fn(() => Promise.resolve(user)),
        update: jest.fn(() => Promise.resolve(user)),
      },
      session: {
        create: jest.fn(({ data }) => {
          const row = { id: nextId++, ...data };
          sessions.push(row);
          return Promise.resolve(row);
        }),
        update: jest.fn(({ where, data }) => {
          const row = sessions.find((s) => s.id === where.id);
          Object.assign(row, data);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(sessions.find((s) => s.id === where.id) ?? null),
        ),
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            sessions.find(
              (s) =>
                s.userId === where.userId &&
                s.refreshTokenHash === where.refreshTokenHash,
            ) ?? null,
          ),
        ),
      },
    };
    const config = {
      get: (k: string) =>
        (
          ({ JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'r' }) as Record<
            string,
            string
          >
        )[k],
    };
    service = new AuthService(
      prisma,
      new JwtService(),
      config as any,
      {} as any,
    );
  });

  it('two logins in the same second get different tokens and sessions', async () => {
    const a = await service.login({ email: user.email, password: 'pw' });
    const b = await service.login({ email: user.email, password: 'pw' });
    expect(a.refreshToken).not.toBe(b.refreshToken);
    expect(a.accessToken).not.toBe(b.accessToken);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].refreshTokenHash).not.toBe(sessions[1].refreshTokenHash);
  });

  it('revoking one session leaves the other working', async () => {
    const a = await service.login({ email: user.email, password: 'pw' });
    const b = await service.login({ email: user.email, password: 'pw' });
    sessions.splice(1, 1); // device B revoked
    await expect(service.refresh(b.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const next = await service.refresh(a.refreshToken);
    expect(next.accessToken).toBeTruthy();
  });

  it('a rotated refresh token cannot be reused', async () => {
    const a = await service.login({ email: user.email, password: 'pw' });
    await service.refresh(a.refreshToken);
    await expect(service.refresh(a.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
