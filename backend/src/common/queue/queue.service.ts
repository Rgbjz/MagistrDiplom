import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export type JobProcessor<T = unknown> = (data: T) => Promise<void>;

export interface EnqueueOptions {
  /** Run after this many milliseconds. */
  delay?: number;
  /** Deduplication id: a job with the same id isn't added twice. */
  jobId?: string;
  attempts?: number;
}

export interface RegisterOptions {
  /**
   * Process this queue inside every API instance even when WORKER_ENABLED is
   * false — for jobs that need the instance's sockets (e.g. call timeouts).
   */
  inApi?: boolean;
  /** Jobs of this queue processed at once per worker (default 5). */
  concurrency?: number;
}

/**
 * Named background-job queues. With REDIS_URL they are BullMQ queues shared
 * by all instances (delayed jobs survive restarts); without it an in-process
 * fallback runs jobs with setTimeout. Features register processors in
 * onModuleInit: `queue.register('reminders', 'deadline', fn)`, then
 * `queue.enqueue('reminders', 'deadline', data, { delay })`.
 */
@Injectable()
export class QueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly processors = new Map<string, Map<string, JobProcessor>>();
  private readonly apiQueues = new Set<string>();
  private readonly concurrency = new Map<string, number>();
  /** In-process fallback: tail of the chain for queues with concurrency 1. */
  private readonly serial = new Map<string, Promise<void>>();
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Set by the standalone worker process: process every registered queue. */
  standalone = false;

  constructor(
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  get distributed(): boolean {
    return this.redis.enabled;
  }

  register<T>(
    queue: string,
    name: string,
    processor: JobProcessor<T>,
    opts: RegisterOptions = {},
  ) {
    const byName =
      this.processors.get(queue) ?? new Map<string, JobProcessor>();
    byName.set(name, processor);
    this.processors.set(queue, byName);
    if (opts.inApi) this.apiQueues.add(queue);
    if (opts.concurrency) this.concurrency.set(queue, opts.concurrency);
  }

  async enqueue<T>(
    queue: string,
    name: string,
    data: T,
    opts: EnqueueOptions = {},
  ): Promise<void> {
    if (this.distributed) {
      await this.queue(queue).add(name, data, {
        delay: opts.delay,
        jobId: opts.jobId,
        attempts: opts.attempts ?? 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      return;
    }
    this.runLocal(queue, name, data, opts);
  }

  onApplicationBootstrap() {
    if (!this.distributed) return;
    const workerEnabled =
      this.standalone ||
      this.config.get<string>('WORKER_ENABLED', 'true') !== 'false';
    for (const queue of this.processors.keys()) {
      if (workerEnabled || this.apiQueues.has(queue)) this.startWorker(queue);
    }
  }

  async onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }

  private queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis.connect(`queue-${name}`, { bullmq: true }),
      });
      this.queues.set(name, q);
    }
    return q;
  }

  private startWorker(queue: string) {
    const worker = new Worker(
      queue,
      async (job: Job) => {
        const processor = this.processors.get(queue)?.get(job.name);
        if (!processor)
          throw new Error(`No processor for ${queue}/${job.name}`);
        await processor(job.data);
      },
      {
        connection: this.redis.connect(`worker-${queue}`, { bullmq: true }),
        concurrency: this.concurrency.get(queue) ?? 5,
        // Long jobs (video transcoding) keep the lock renewed while running.
        lockDuration: 60_000,
      },
    );
    worker.on('failed', (job, err) =>
      this.logger.warn(`Job ${queue}/${job?.name} failed: ${err.message}`),
    );
    this.workers.push(worker);
    this.logger.log(`Worker started for queue "${queue}"`);
  }

  /** In-process fallback with the same semantics (delay, jobId dedup). */
  private runLocal<T>(
    queue: string,
    name: string,
    data: T,
    opts: EnqueueOptions,
  ) {
    const key = opts.jobId ? `${queue}:${opts.jobId}` : null;
    if (key && this.timers.has(key)) return;
    const run = () => {
      if (key) this.timers.delete(key);
      const processor = this.processors.get(queue)?.get(name);
      if (!processor) {
        this.logger.warn(`No processor for ${queue}/${name}`);
        return;
      }
      const exec = () =>
        processor(data).catch((err: unknown) =>
          this.logger.warn(
            `Job ${queue}/${name} failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      if (this.concurrency.get(queue) === 1) {
        const tail = (this.serial.get(queue) ?? Promise.resolve()).then(exec);
        this.serial.set(queue, tail);
      } else {
        void exec();
      }
    };
    const timer = setTimeout(run, opts.delay ?? 0);
    if (key) this.timers.set(key, timer);
  }
}
