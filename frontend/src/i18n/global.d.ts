// Typed messages: the Ukrainian files are the source of truth. A key used with
// t() must exist in src/messages/uk/<namespace>.json, otherwise tsc fails.
import type { Locale } from './config';
import type commonMessages from '../messages/uk/common.json';
import type navMessages from '../messages/uk/nav.json';
import type errorsMessages from '../messages/uk/errors.json';
import type metaMessages from '../messages/uk/meta.json';
import type publicMessages from '../messages/uk/public.json';
import type authMessages from '../messages/uk/auth.json';
import type catalogMessages from '../messages/uk/catalog.json';
import type landingMessages from '../messages/uk/landing.json';
import type dashboardMessages from '../messages/uk/dashboard.json';
import type courseMessages from '../messages/uk/course.json';
import type testMessages from '../messages/uk/test.json';
import type assignmentMessages from '../messages/uk/assignment.json';
import type gradesMessages from '../messages/uk/grades.json';
import type certificateMessages from '../messages/uk/certificate.json';
import type profileMessages from '../messages/uk/profile.json';
import type checkoutMessages from '../messages/uk/checkout.json';
import type purchasesMessages from '../messages/uk/purchases.json';
import type notificationsMessages from '../messages/uk/notifications.json';
import type chatMessages from '../messages/uk/chat.json';
import type callMessages from '../messages/uk/call.json';
import type teacherMessages from '../messages/uk/teacher.json';
import type builderMessages from '../messages/uk/builder.json';
import type manageMessages from '../messages/uk/manage.json';
import type gradebookMessages from '../messages/uk/gradebook.json';
import type adminMessages from '../messages/uk/admin.json';
import type statesMessages from '../messages/uk/states.json';
import type calendarMessages from '../messages/uk/calendar.json';
import type videoMessages from '../messages/uk/video.json';
import type analyticsMessages from '../messages/uk/analytics.json';

export interface Messages {
  common: typeof commonMessages;
  nav: typeof navMessages;
  errors: typeof errorsMessages;
  meta: typeof metaMessages;
  public: typeof publicMessages;
  auth: typeof authMessages;
  catalog: typeof catalogMessages;
  landing: typeof landingMessages;
  dashboard: typeof dashboardMessages;
  course: typeof courseMessages;
  test: typeof testMessages;
  assignment: typeof assignmentMessages;
  grades: typeof gradesMessages;
  certificate: typeof certificateMessages;
  profile: typeof profileMessages;
  checkout: typeof checkoutMessages;
  purchases: typeof purchasesMessages;
  notifications: typeof notificationsMessages;
  chat: typeof chatMessages;
  call: typeof callMessages;
  teacher: typeof teacherMessages;
  builder: typeof builderMessages;
  manage: typeof manageMessages;
  gradebook: typeof gradebookMessages;
  admin: typeof adminMessages;
  states: typeof statesMessages;
  calendar: typeof calendarMessages;
  video: typeof videoMessages;
  analytics: typeof analyticsMessages;
}

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
