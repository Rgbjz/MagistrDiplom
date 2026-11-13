/**
 * Server-generated user-facing text (emails, notifications, chat service
 * messages) in every supported language. `{name}` placeholders are filled by
 * `t()`. The Ukrainian strings match what the app showed before i18n.
 */
export const MESSAGES = {
  uk: {
    // --- calendar (deadline reminders, iCal)
    'notify.reminder.assignment24h':
      'Дедлайн завдання «{assignment}» — через 24 години',
    'notify.reminder.assignment1h':
      'Дедлайн завдання «{assignment}» — через годину',
    'notify.reminder.event24h': 'Подія «{event}» — через 24 години',
    'notify.reminder.event1h': 'Подія «{event}» — через годину',
    'notify.reminder.body': 'Курс «{course}» · {date}',
    'ical.calendarName': 'LMS — мій календар',
    'ical.deadline': 'Дедлайн',
    'ical.kind.LECTURE': 'Лекція',
    'ical.kind.ONLINE_LESSON': 'Онлайн-заняття',
    'ical.kind.DEADLINE': 'Дедлайн',
    'ical.kind.OTHER': 'Подія',
    'notify.staffAdded.title': 'Вас додано до команди курсу «{course}»',
    'notify.staffAdded.body.TEACHER':
      'Роль: викладач. Ви можете редагувати матеріали й оцінювати роботи.',
    'notify.staffAdded.body.ASSISTANT':
      'Роль: асистент. Ви можете перевіряти роботи й розглядати заявки.',
    'notify.staffOwner.title': 'Тепер ви власник курсу «{course}»',
    // --- notifications
    'notify.enrollmentRequest.title': 'Нова заявка на курс «{course}»',
    'notify.enrollmentApproved.title': 'Заявку на курс «{course}» схвалено',
    'notify.enrollmentApproved.body': 'Курс уже доступний у вашому кабінеті.',
    'notify.enrollmentRejected.title': 'Заявку на курс «{course}» відхилено',
    'notify.newLesson.title': 'У курсі «{course}» новий урок',
    'notify.newLesson.body': 'Розділ «{section}»',
    'notify.testPassed.title': 'Тест «{test}» складено: {score}%',
    'notify.testPending.title': 'Тест «{test}» надіслано на перевірку',
    'notify.testReviewed.title': 'Тест «{test}» перевірено: {score}%',
    'notify.testReviewRequest.title':
      '{student}: відповідь у тесті «{test}» чекає перевірки',
    'notify.testFailed.title': 'Тест «{test}» не складено: {score}%',
    'notify.courseBody': 'Курс «{course}»',
    'notify.courseBodyLate': 'Курс «{course}» · із запізненням',
    'notify.assignmentSubmitted.title': '{student} здав роботу «{assignment}»',
    'notify.assignmentGraded.title':
      'Роботу «{assignment}» перевірено: {score}/{max}',
    'notify.assignmentReturned.title':
      'Роботу «{assignment}» повернуто на доопрацювання',
    'notify.gradeUpdated.title': 'Оцінку за «{item}» змінено',
    'notify.gradeUpdated.reset': 'Оцінку за «{item}» повернуто до автоматичної',
    'notify.gradeUpdated.finalTitle': 'Підсумкову оцінку змінено',
    'notify.gradeUpdated.finalReset':
      'Підсумкову оцінку повернуто до автоматичної',
    'notify.gradeUpdated.body': 'Курс «{course}». Причина: {reason}',
    'notify.newMessage.title': 'Нове повідомлення від {sender}',
    'notify.groupMessage.title':
      'Нове повідомлення в групі «{group}» від {sender}',
    'notify.groupAdded.title': 'Вас додали до групи «{group}»',
    'notify.groupAdded.body': '{sender} додає вас до розмови',
    'notify.payment.title': 'Оплату курсу «{course}» підтверджено',
    'notify.payment.body': 'Сума {amount} ₴. Курс уже у вашому кабінеті.',
    'notify.certificate.title': 'Сертифікат за курс «{course}» готовий',
    'notify.certificate.body': 'Номер сертифіката {code}',
    // --- chat service messages (call log)
    'call.ended': 'Відеодзвінок завершено · {duration}',
    'call.missed': 'Пропущений відеодзвінок',
    'call.declined': 'Відеодзвінок відхилено',
    'call.audioEnded': 'Аудіодзвінок завершено · {duration}',
    'call.audioMissed': 'Пропущений аудіодзвінок',
    'call.audioDeclined': 'Аудіодзвінок відхилено',
    // --- email layout
    'mail.buttonFallback': 'Якщо кнопка не працює, скопіюйте посилання:',
    'mail.defaultFooter': 'Ви отримали цей лист, бо зареєстровані в LMS.',
    'mail.confirm.subject': 'Підтвердження email — LMS',
    'mail.confirm.title': 'Підтвердіть email',
    'mail.confirm.preheader': 'Залишився один крок, щоб почати навчання.',
    'mail.confirm.body':
      'Дякуємо за реєстрацію! Натисніть кнопку нижче, щоб підтвердити адресу та увійти до кабінету.',
    'mail.confirm.button': 'Підтвердити email',
    'mail.confirm.note':
      'Якщо ви не реєструвалися в LMS, просто проігноруйте цей лист.',
    'mail.confirm.text':
      'Дякуємо за реєстрацію! Перейдіть за посиланням, щоб підтвердити адресу:',
    'mail.confirm.textNote':
      'Якщо ви не реєструвалися в LMS, проігноруйте цей лист.',
    'mail.reset.subject': 'Відновлення пароля — LMS',
    'mail.reset.title': 'Відновлення пароля',
    'mail.reset.preheader': 'Посилання для встановлення нового пароля.',
    'mail.reset.body':
      'Ми отримали запит на зміну пароля до вашого акаунта. Натисніть кнопку, щоб встановити новий пароль.',
    'mail.reset.button': 'Встановити новий пароль',
    'mail.reset.note':
      'Посилання діє 1 годину. Якщо ви не надсилали запит, нічого робити не потрібно — пароль залишиться без змін.',
    'mail.reset.text': 'Встановіть новий пароль за посиланням (діє 1 годину):',
    'mail.reset.textNote': 'Якщо ви не надсилали запит, проігноруйте цей лист.',
    'mail.notification.button': 'Відкрити в LMS',
    'mail.notification.open': 'Відкрити:',
    'mail.notification.footer': 'Вимкнути листи можна в профілі:',
    'mail.notification.footerLink': 'налаштування сповіщень',
  },
  en: {
    // --- calendar (deadline reminders, iCal)
    'notify.reminder.assignment24h':
      'Assignment “{assignment}” is due in 24 hours',
    'notify.reminder.assignment1h':
      'Assignment “{assignment}” is due in an hour',
    'notify.reminder.event24h': '“{event}” starts in 24 hours',
    'notify.reminder.event1h': '“{event}” starts in an hour',
    'notify.reminder.body': 'Course “{course}” · {date}',
    'ical.calendarName': 'LMS — my calendar',
    'ical.deadline': 'Deadline',
    'ical.kind.LECTURE': 'Lecture',
    'ical.kind.ONLINE_LESSON': 'Online lesson',
    'ical.kind.DEADLINE': 'Deadline',
    'ical.kind.OTHER': 'Event',
    'notify.staffAdded.title':
      'You were added to the team of the course “{course}”',
    'notify.staffAdded.body.TEACHER':
      'Role: teacher. You can edit materials and grade work.',
    'notify.staffAdded.body.ASSISTANT':
      'Role: assistant. You can grade work and review enrollment requests.',
    'notify.staffOwner.title': 'You are now the owner of the course “{course}”',
    'notify.enrollmentRequest.title': 'New enrollment request for “{course}”',
    'notify.enrollmentApproved.title':
      'Your request for “{course}” was approved',
    'notify.enrollmentApproved.body':
      'The course is now available in your dashboard.',
    'notify.enrollmentRejected.title':
      'Your request for “{course}” was declined',
    'notify.newLesson.title': 'New lesson in “{course}”',
    'notify.newLesson.body': 'Section “{section}”',
    'notify.testPassed.title': 'Test “{test}” passed: {score}%',
    'notify.testPending.title': 'Test “{test}” sent for review',
    'notify.testReviewed.title': 'Test “{test}” reviewed: {score}%',
    'notify.testReviewRequest.title':
      '{student}: an answer in “{test}” awaits review',
    'notify.testFailed.title': 'Test “{test}” not passed: {score}%',
    'notify.courseBody': 'Course “{course}”',
    'notify.courseBodyLate': 'Course “{course}” · late',
    'notify.assignmentSubmitted.title': '{student} submitted “{assignment}”',
    'notify.assignmentGraded.title': '“{assignment}” graded: {score}/{max}',
    'notify.assignmentReturned.title':
      '“{assignment}” was returned for revision',
    'notify.gradeUpdated.title': 'Your grade for “{item}” was changed',
    'notify.gradeUpdated.reset':
      'Your grade for “{item}” was reset to automatic',
    'notify.gradeUpdated.finalTitle': 'Your final grade was changed',
    'notify.gradeUpdated.finalReset': 'Your final grade was reset to automatic',
    'notify.gradeUpdated.body': 'Course “{course}”. Reason: {reason}',
    'notify.newMessage.title': 'New message from {sender}',
    'notify.groupMessage.title': 'New message in «{group}» from {sender}',
    'notify.groupAdded.title': 'You were added to the group «{group}»',
    'notify.groupAdded.body': '{sender} added you to the conversation',
    'notify.payment.title': 'Payment for “{course}” confirmed',
    'notify.payment.body':
      'Amount: {amount} ₴. The course is now in your dashboard.',
    'notify.certificate.title': 'Your certificate for “{course}” is ready',
    'notify.certificate.body': 'Certificate number {code}',
    'call.ended': 'Video call ended · {duration}',
    'call.missed': 'Missed video call',
    'call.declined': 'Video call declined',
    'call.audioEnded': 'Audio call ended · {duration}',
    'call.audioMissed': 'Missed audio call',
    'call.audioDeclined': 'Audio call declined',
    'mail.buttonFallback': 'If the button doesn’t work, copy this link:',
    'mail.defaultFooter':
      'You received this email because you have an LMS account.',
    'mail.confirm.subject': 'Confirm your email — LMS',
    'mail.confirm.title': 'Confirm your email',
    'mail.confirm.preheader': 'One more step and you can start learning.',
    'mail.confirm.body':
      'Thanks for signing up! Click the button below to confirm your address and open your dashboard.',
    'mail.confirm.button': 'Confirm email',
    'mail.confirm.note':
      'If you didn’t sign up for LMS, just ignore this email.',
    'mail.confirm.text':
      'Thanks for signing up! Follow this link to confirm your address:',
    'mail.confirm.textNote':
      'If you didn’t sign up for LMS, ignore this email.',
    'mail.reset.subject': 'Reset your password — LMS',
    'mail.reset.title': 'Password reset',
    'mail.reset.preheader': 'A link to set a new password.',
    'mail.reset.body':
      'We received a request to change your account password. Click the button to set a new one.',
    'mail.reset.button': 'Set a new password',
    'mail.reset.note':
      'The link is valid for 1 hour. If you didn’t request it, no action is needed — your password stays the same.',
    'mail.reset.text': 'Set a new password using this link (valid for 1 hour):',
    'mail.reset.textNote': 'If you didn’t request it, ignore this email.',
    'mail.notification.button': 'Open in LMS',
    'mail.notification.open': 'Open:',
    'mail.notification.footer':
      'You can turn off these emails in your profile:',
    'mail.notification.footerLink': 'notification settings',
  },
  pl: {
    // --- calendar (deadline reminders, iCal)
    'notify.reminder.assignment24h':
      'Termin zadania „{assignment}” mija za 24 godziny',
    'notify.reminder.assignment1h':
      'Termin zadania „{assignment}” mija za godzinę',
    'notify.reminder.event24h': 'Wydarzenie „{event}” — za 24 godziny',
    'notify.reminder.event1h': 'Wydarzenie „{event}” — za godzinę',
    'notify.reminder.body': 'Kurs „{course}” · {date}',
    'ical.calendarName': 'LMS — mój kalendarz',
    'ical.deadline': 'Termin',
    'ical.kind.LECTURE': 'Wykład',
    'ical.kind.ONLINE_LESSON': 'Zajęcia online',
    'ical.kind.DEADLINE': 'Termin',
    'ical.kind.OTHER': 'Wydarzenie',
    'notify.staffAdded.title': 'Dodano Cię do zespołu kursu „{course}”',
    'notify.staffAdded.body.TEACHER':
      'Rola: prowadzący. Możesz edytować materiały i oceniać prace.',
    'notify.staffAdded.body.ASSISTANT':
      'Rola: asystent. Możesz oceniać prace i rozpatrywać zgłoszenia.',
    'notify.staffOwner.title': 'Jesteś teraz właścicielem kursu „{course}”',
    'notify.enrollmentRequest.title': 'Nowe zgłoszenie na kurs „{course}”',
    'notify.enrollmentApproved.title':
      'Zgłoszenie na kurs „{course}” zostało zaakceptowane',
    'notify.enrollmentApproved.body': 'Kurs jest już dostępny w Twoim panelu.',
    'notify.enrollmentRejected.title':
      'Zgłoszenie na kurs „{course}” zostało odrzucone',
    'notify.newLesson.title': 'Nowa lekcja w kursie „{course}”',
    'notify.newLesson.body': 'Sekcja „{section}”',
    'notify.testPassed.title': 'Test „{test}” zaliczony: {score}%',
    'notify.testPending.title': 'Test „{test}” wysłany do sprawdzenia',
    'notify.testReviewed.title': 'Test „{test}” sprawdzony: {score}%',
    'notify.testReviewRequest.title':
      '{student}: odpowiedź w teście „{test}” czeka na sprawdzenie',
    'notify.testFailed.title': 'Test „{test}” niezaliczony: {score}%',
    'notify.courseBody': 'Kurs „{course}”',
    'notify.courseBodyLate': 'Kurs „{course}” · po terminie',
    'notify.assignmentSubmitted.title':
      '{student} oddał(a) pracę „{assignment}”',
    'notify.assignmentGraded.title':
      'Praca „{assignment}” oceniona: {score}/{max}',
    'notify.assignmentReturned.title':
      'Praca „{assignment}” została zwrócona do poprawy',
    'notify.gradeUpdated.title': 'Ocena za „{item}” została zmieniona',
    'notify.gradeUpdated.reset':
      'Ocena za „{item}” przywrócona do automatycznej',
    'notify.gradeUpdated.finalTitle': 'Ocena końcowa została zmieniona',
    'notify.gradeUpdated.finalReset':
      'Ocena końcowa przywrócona do automatycznej',
    'notify.gradeUpdated.body': 'Kurs „{course}”. Powód: {reason}',
    'notify.newMessage.title': 'Nowa wiadomość od {sender}',
    'notify.groupMessage.title':
      'Nowa wiadomość w grupie «{group}» od {sender}',
    'notify.groupAdded.title': 'Dodano cię do grupy «{group}»',
    'notify.groupAdded.body': '{sender} dodaje cię do rozmowy',
    'notify.payment.title': 'Płatność za kurs „{course}” potwierdzona',
    'notify.payment.body': 'Kwota: {amount} ₴. Kurs jest już w Twoim panelu.',
    'notify.certificate.title': 'Certyfikat za kurs „{course}” jest gotowy',
    'notify.certificate.body': 'Numer certyfikatu {code}',
    'call.ended': 'Rozmowa wideo zakończona · {duration}',
    'call.missed': 'Nieodebrana rozmowa wideo',
    'call.declined': 'Rozmowa wideo odrzucona',
    'call.audioEnded': 'Rozmowa głosowa zakończona · {duration}',
    'call.audioMissed': 'Nieodebrana rozmowa głosowa',
    'call.audioDeclined': 'Rozmowa głosowa odrzucona',
    'mail.buttonFallback': 'Jeśli przycisk nie działa, skopiuj link:',
    'mail.defaultFooter':
      'Otrzymujesz tę wiadomość, ponieważ masz konto w LMS.',
    'mail.confirm.subject': 'Potwierdź adres e-mail — LMS',
    'mail.confirm.title': 'Potwierdź adres e-mail',
    'mail.confirm.preheader': 'Jeszcze jeden krok i możesz zacząć naukę.',
    'mail.confirm.body':
      'Dziękujemy za rejestrację! Kliknij przycisk poniżej, aby potwierdzić adres i przejść do panelu.',
    'mail.confirm.button': 'Potwierdź e-mail',
    'mail.confirm.note':
      'Jeśli nie rejestrowałeś(-aś) się w LMS, po prostu zignoruj tę wiadomość.',
    'mail.confirm.text':
      'Dziękujemy za rejestrację! Kliknij link, aby potwierdzić adres:',
    'mail.confirm.textNote':
      'Jeśli nie rejestrowałeś(-aś) się w LMS, zignoruj tę wiadomość.',
    'mail.reset.subject': 'Resetowanie hasła — LMS',
    'mail.reset.title': 'Resetowanie hasła',
    'mail.reset.preheader': 'Link do ustawienia nowego hasła.',
    'mail.reset.body':
      'Otrzymaliśmy prośbę o zmianę hasła do Twojego konta. Kliknij przycisk, aby ustawić nowe hasło.',
    'mail.reset.button': 'Ustaw nowe hasło',
    'mail.reset.note':
      'Link jest ważny 1 godzinę. Jeśli to nie Ty, nic nie musisz robić — hasło pozostanie bez zmian.',
    'mail.reset.text':
      'Ustaw nowe hasło, korzystając z linku (ważny 1 godzinę):',
    'mail.reset.textNote': 'Jeśli to nie Ty, zignoruj tę wiadomość.',
    'mail.notification.button': 'Otwórz w LMS',
    'mail.notification.open': 'Otwórz:',
    'mail.notification.footer': 'Możesz wyłączyć te wiadomości w profilu:',
    'mail.notification.footerLink': 'ustawienia powiadomień',
  },
} as const;
