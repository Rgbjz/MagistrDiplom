import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { SignedFilesInterceptor } from './signed-files.interceptor';

@Module({
  imports: [JwtModule.register({})],
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: APP_INTERCEPTOR, useClass: SignedFilesInterceptor },
  ],
  exports: [FilesService],
})
export class FilesModule {}
