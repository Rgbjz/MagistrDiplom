import type { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import type { RedisService } from '../redis/redis.service';

const config = {
  get: (_k: string, d?: unknown) => d,
} as unknown as ConfigService;
const noRedis = { client: null, enabled: false } as unknown as RedisService;

describe('QueueService in-process fallback (no REDIS_URL)', () => {
  let queue: QueueService;

  beforeEach(() => {
    jest.useFakeTimers();
    queue = new QueueService(noRedis, config);
  });

  afterEach(async () => {
    await queue.onModuleDestroy();
    jest.useRealTimers();
  });

  it('is not distributed and runs immediate jobs on the next tick', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    queue.register('mail', 'send', fn);
    expect(queue.distributed).toBe(false);
    await queue.enqueue('mail', 'send', { to: 'a@b.c' });
    expect(fn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledWith({ to: 'a@b.c' });
  });

  it('honours the delay', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    queue.register('reminders', 'deadline', fn);
    await queue.enqueue('reminders', 'deadline', { id: 1 }, { delay: 5_000 });
    await jest.advanceTimersByTimeAsync(4_999);
    expect(fn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('deduplicates pending jobs by jobId', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    queue.register('reminders', 'deadline', fn);
    await queue.enqueue(
      'reminders',
      'deadline',
      { id: 1 },
      { delay: 100, jobId: 'x' },
    );
    await queue.enqueue(
      'reminders',
      'deadline',
      { id: 2 },
      { delay: 100, jobId: 'x' },
    );
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ id: 1 });
    // After it ran, the same id may be scheduled again.
    await queue.enqueue(
      'reminders',
      'deadline',
      { id: 3 },
      { delay: 1, jobId: 'x' },
    );
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('routes by job name and survives a failing processor', async () => {
    const a = jest.fn().mockRejectedValue(new Error('boom'));
    const b = jest.fn().mockResolvedValue(undefined);
    queue.register('q', 'a', a);
    queue.register('q', 'b', b);
    await queue.enqueue('q', 'a', {});
    await queue.enqueue('q', 'b', {});
    await queue.enqueue('q', 'missing', {});
    await jest.advanceTimersByTimeAsync(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not start BullMQ workers without Redis', () => {
    queue.register('q', 'a', jest.fn());
    expect(() => queue.onApplicationBootstrap()).not.toThrow();
  });
});
