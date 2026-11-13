import { AdaptiveModule } from '../adaptive/adaptive.module';
import { Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { TestsController } from './tests.controller';
import { QuestionBankService } from './question-bank.service';
import { QuestionBankController } from './question-bank.controller';

@Module({
  imports: [AdaptiveModule],
  controllers: [TestsController, QuestionBankController],
  providers: [TestsService, QuestionBankService],
})
export class TestsModule {}
