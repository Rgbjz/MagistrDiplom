import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { allowedOrigins } from './common/utils/origins';
import { RedisService } from './common/redis/redis.service';
import { RedisIoAdapter } from './common/redis/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  // Behind Render's proxy: trust X-Forwarded-* so req.ip is the client.
  app.set('trust proxy', 1);
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    // Lets the browser read the file name of gradebook exports.
    exposedHeaders: ['Content-Disposition'],
  });
  // Security headers. The API serves JSON and media only, so no CSP; images
  // and videos are embedded by the frontend origin, hence cross-origin CORP.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  // With Redis, Socket.IO rooms span every backend instance.
  const redis = app.get(RedisService);
  if (redis.enabled) app.useWebSocketAdapter(new RedisIoAdapter(app, redis));
  // Local-disk uploads (when Vercel Blob isn't configured). Anchor to
  // cwd/public, NOT __dirname — the compiled entry lives at dist/src/main.js.
  // Only avatars and course covers are public; lesson files, uploaded videos
  // and submissions are served by /api/files with an access check.
  for (const folder of ['avatars', 'courses']) {
    app.useStaticAssets(join(process.cwd(), 'public', folder), {
      prefix: `/public/${folder}/`,
    });
  }

  const port = Number(process.env.PORT ?? 5000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Backend listening on port ${port}`);
}
void bootstrap();
