import { RedisThrottlerStorage } from './redis-throttler.storage';
import { FakeRedis } from '../redis/fake-redis.testing';
import type Redis from 'ioredis';
import { throttlerOptions } from './throttle.module';

describe('RedisThrottlerStorage', () => {
  let redis: FakeRedis;
  let storage: RedisThrottlerStorage;
  let now = 1_000_000;

  beforeEach(() => {
    redis = new FakeRedis();
    now = 1_000_000;
    redis.now = () => now;
    storage = new RedisThrottlerStorage(redis as unknown as Redis);
  });

  it('counts hits in a fixed window shared by every instance', async () => {
    const other = new RedisThrottlerStorage(redis as unknown as Redis);
    expect(
      (await storage.increment('ip', 60_000, 3, 0, 'auth')).totalHits,
    ).toBe(1);
    expect((await other.increment('ip', 60_000, 3, 0, 'auth')).totalHits).toBe(
      2,
    );
    const third = await storage.increment('ip', 60_000, 3, 0, 'auth');
    expect(third).toMatchObject({
      totalHits: 3,
      isBlocked: false,
      timeToExpire: 60,
    });
  });

  it('resets after the window', async () => {
    await storage.increment('ip', 1_000, 1, 0, 'auth');
    now += 1_000;
    expect((await storage.increment('ip', 1_000, 1, 0, 'auth')).totalHits).toBe(
      1,
    );
  });

  it('keeps separate counters per throttler and key', async () => {
    await storage.increment('ip', 60_000, 5, 0, 'auth');
    expect(
      (await storage.increment('ip', 60_000, 5, 0, 'default')).totalHits,
    ).toBe(1);
    expect(
      (await storage.increment('ip2', 60_000, 5, 0, 'auth')).totalHits,
    ).toBe(1);
  });

  it('blocks for blockDuration once the limit is exceeded', async () => {
    await storage.increment('ip', 60_000, 1, 0, 'auth');
    const over = await storage.increment('ip', 60_000, 1, 30_000, 'auth');
    expect(over).toMatchObject({ isBlocked: true, timeToBlockExpire: 30 });
    now += 10_000;
    expect(
      (await storage.increment('ip', 60_000, 1, 30_000, 'auth')).isBlocked,
    ).toBe(true);
    now += 21_000;
    expect(
      (await storage.increment('ip', 60_000, 1, 30_000, 'auth')).isBlocked,
    ).toBe(
      true, // still over the limit within the 60 s window → blocked again
    );
  });
});

describe('throttlerOptions', () => {
  it('uses Redis storage only when Redis is configured', () => {
    expect(throttlerOptions({ client: null }).storage).toBeUndefined();
    expect(
      throttlerOptions({ client: new FakeRedis() as unknown as Redis }).storage,
    ).toBeInstanceOf(RedisThrottlerStorage);
  });
});
