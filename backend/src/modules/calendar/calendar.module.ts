import { Global, Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { RemindersService } from './reminders.service';

/** Global so assignment services can (re)schedule deadline reminders. */
@Global()
@Module({
  controllers: [CalendarController],
  providers: [CalendarService, RemindersService],
  exports: [RemindersService, CalendarService],
})
export class CalendarModule {}
