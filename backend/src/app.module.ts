import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { SectionsModule } from './modules/sections/sections.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { ProgressModule } from './modules/progress/progress.module';
import { TestsModule } from './modules/tests/tests.module';
import { ChatModule } from './modules/chat/chat.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { StoreModule } from './modules/store/store.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { AdminModule } from './modules/admin/admin.module';
import { GradebookModule } from './modules/gradebook/gradebook.module';
import { MailModule } from './modules/mail/mail.module';
import { StorageModule } from './modules/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { ThrottleModule } from './common/throttle/throttle.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
import { FilesModule } from './modules/files/files.module';

import { CourseStaffModule } from './modules/course-staff/course-staff.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { VideosModule } from './modules/videos/videos.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdaptiveModule } from './modules/adaptive/adaptive.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    QueueModule,
    ThrottleModule,
    FilesModule,
    MailModule,
    StorageModule,
    HealthModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    SectionsModule,
    LessonsModule,
    ProgressModule,
    TestsModule,
    ChatModule,
    DashboardModule,
    StoreModule,
    AssignmentsModule,
    CertificatesModule,
    AdminModule,
    GradebookModule,
    CourseStaffModule,
    CalendarModule,
    VideosModule,
    AnalyticsModule,
    AdaptiveModule,
  ],
})
export class AppModule {}
