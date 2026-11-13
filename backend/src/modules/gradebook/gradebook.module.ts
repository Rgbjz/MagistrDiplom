import { Module } from '@nestjs/common';
import { ProgressModule } from '../progress/progress.module';
import { GradebookController } from './gradebook.controller';
import { GradebookService } from './gradebook.service';

@Module({
  imports: [ProgressModule],
  controllers: [GradebookController],
  providers: [GradebookService],
  exports: [GradebookService],
})
export class GradebookModule {}
