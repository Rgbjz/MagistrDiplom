import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ProgressModule } from '../progress/progress.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ProgressModule, ChatModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
