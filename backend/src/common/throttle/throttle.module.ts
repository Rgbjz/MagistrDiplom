import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisService } from '../redis/redis.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { ClientIpThrottlerGuard, globalLimit, THROTTLE_TTL } from './throttle';

/**
 * Counters live in Redis when it's configured, so every instance sees the
 * same per-client totals; otherwise the built-in memory storage.
 */
export function throttlerOptions(redis: Pick<RedisService, 'client'>) {
  return {
    throttlers: [
      { name: 'default', ttl: THROTTLE_TTL, limit: () => globalLimit() },
    ],
    storage: redis.client ? new RedisThrottlerStorage(redis.client) : undefined,
  };
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: throttlerOptions,
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
export class ThrottleModule {}
