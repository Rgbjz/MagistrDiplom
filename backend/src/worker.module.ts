import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
import { MailModule } from './modules/mail/mail.module';
import { VideoWorkerModule } from './modules/videos/video-worker.module';

/**
 * Modules loaded by the standalone worker. Feature modules that register
 * background processors (deadline reminders, video transcoding…) are added
 * here so their jobs run in this process. Socket-bound queues (`calls`) stay
 * in the API instances.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    QueueModule,
    MailModule,
    VideoWorkerModule,
  ],
})
export class WorkerModule {}
