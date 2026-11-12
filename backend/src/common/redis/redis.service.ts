import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Shared Redis connection (REDIS_URL). Without REDIS_URL the app keeps its
 * single-instance in-memory behaviour: chat/calls, throttling, email throttle
 * and background jobs all fall back to process memory.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly url: string | undefined;
  /** Main connection for commands; null when Redis isn't configured. */
  readonly client: Redis | null;
  private readonly extra: Redis[] = [];

  constructor(config: ConfigService) {
    this.url = config.get<string>('REDIS_URL') || undefined;
    if (this.url) {
      this.client = this.connect('main');
    } else {
      this.client = null;
      this.logger.warn(
        'REDIS_URL is not set: using in-memory state (single backend instance only).',
      );
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * A new connection (pub/sub, BullMQ). BullMQ needs
   * maxRetriesPerRequest = null on its connections.
   */
  connect(name: string, opts: { bullmq?: boolean } = {}): Redis {
    if (!this.url) throw new Error('REDIS_URL is not set');
    const conn = new Redis(this.url, {
      lazyConnect: false,
      connectionName: `lms-${name}`,
      maxRetriesPerRequest: opts.bullmq ? null : 3,
    });
    conn.on('error', (err) =>
      this.logger.warn(`Redis (${name}) error: ${err.message}`),
    );
    this.extra.push(conn);
    return conn;
  }

  /** true/false when Redis is configured, null when it isn't. */
  async ping(): Promise<boolean | null> {
    if (!this.client) return null;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await Promise.all(
      this.extra.map((c) => c.quit().catch(() => c.disconnect())),
    );
  }
}
