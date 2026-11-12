import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { QueueService } from './common/queue/queue.service';

/**
 * Standalone background worker: `node dist/src/worker.js`. Processes every
 * queue registered by the modules in WorkerModule. Use it with
 * WORKER_ENABLED=false on the API instances to keep heavy jobs (e.g. video
 * transcoding) off the web process. Requires REDIS_URL.
 */
async function bootstrap() {
  if (!process.env.REDIS_URL) {
    throw new Error('The standalone worker needs REDIS_URL (BullMQ).');
  }
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  app.get(QueueService).standalone = true;
  await app.init();
  app.enableShutdownHooks();
  new Logger('Worker').log('Background worker started');
}
void bootstrap();
