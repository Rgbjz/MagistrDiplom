import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Serve uploaded files. Anchor to cwd/public (where multer writes via
  // './public/...'), NOT __dirname — the compiled entry lives at dist/src/main.js,
  // so __dirname/../public would resolve to the nonexistent dist/public.
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/public/' });

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(`🚀 Backend on http://localhost:${port}`);
}
void bootstrap();
