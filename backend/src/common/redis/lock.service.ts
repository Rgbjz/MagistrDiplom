import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from './redis.service';

const LOCK_TTL_MS = 5_000;
const RETRY_MS = 25;
const MAX_WAIT_MS = 5_000;

/**
 * Short mutual-exclusion sections keyed by name: a Redis lock (SET NX PX)
 * shared by all backend instances, or an in-process promise chain.
 */
@Injectable()
export class LockService {
  private readonly local = new Map<string, Promise<unknown>>();

  constructor(private redis: RedisService) {}

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const client = this.redis.client;
    if (!client) return this.runLocal(name, fn);

    const key = `lock:${name}`;
    const token = randomBytes(8).toString('hex');
    const deadline = Date.now() + MAX_WAIT_MS;
    while ((await client.set(key, token, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') {
      if (Date.now() > deadline) throw new Error(`Lock timeout: ${name}`);
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
    try {
      return await fn();
    } finally {
      // Release only our own lock (it may have expired and been re-taken).
      if ((await client.get(key)) === token) await client.del(key);
    }
  }

  private runLocal<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.local.get(name) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.local.set(name, tail);
    void tail.then(() => {
      if (this.local.get(name) === tail) this.local.delete(name);
    });
    return next;
  }
}
