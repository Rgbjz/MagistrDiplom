# Повний продукт за дизайном Claude Design — специфікація (підпроект D)

**Дата:** 2026-11-02
**Дизайн:** https://claude.ai/artifact/374NqXJTpCp6kQ2o7Q9oDD (холст «LMS — дизайн інтерфейсу», 30 екранів)

## 1. Мета

Реалізувати у коді всі екрани з холсту: гість/авторизація, студент, викладач, адміністратор,
спільні стани та мобільну версію. Інтерфейс — українською (`<html lang="uk">`).
Візуальна мова — токени з `globals.scss` (Polished Blue, Inter, світла/темна тема).

## 2. Зміни схеми БД (Prisma)

```prisma
enum CourseLevel { BEGINNER INTERMEDIATE ADVANCED }
enum NotificationType {
  ENROLLMENT_REQUEST ENROLLMENT_APPROVED ENROLLMENT_REJECTED
  NEW_LESSON TEST_RESULT NEW_MESSAGE PAYMENT CERTIFICATE
}

model User        { + blocked Boolean @default(false)
                    + resetToken String? @unique
                    + resetTokenExpires DateTime?
                    + notifications Notification[]  + certificates Certificate[] }
model UserProfile { + emailNotifications Boolean @default(true) }
model Course      { + category String?  + level CourseLevel?
                    + published Boolean @default(false)   // існуючі курси → true у міграції
                    + autoApprove Boolean @default(false)
                    + certificates Certificate[] }

model Notification {
  id Int @id @default(autoincrement())
  userId Int
  type NotificationType
  title String
  body String?
  link String?
  readAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
}

model Certificate {
  id Int @id @default(autoincrement())
  code String @unique            // LMS-2026-000184
  userId Int
  courseId Int
  avgScore Int?
  issuedAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  @@unique([userId, courseId])
}
```

Міграція генерується без БД: `prisma migrate diff --from-migrations … --to-schema-datamodel …`
і доповнюється `UPDATE "Course" SET "published" = true;`.

## 3. API-контракт (префікс `/api`)

Позначки: 🔓 публічний, 🔑 будь-який автентифікований, S студент, T викладач (власник курсу), A адмін.
Усі тексти помилок — англійською (як зараз), фронтенд показує українські повідомлення.

### 3.1 Auth
| Метод | Шлях | Тіло → Відповідь |
|---|---|---|
| POST 🔓 | `/auth/register` | `{email,password,role?,firstName?,lastName?}` → `{email, confirmToken}` |
| POST 🔓 | `/auth/resend-confirmation` | `{email}` → `{email, confirmToken}`; 400 якщо вже підтверджено |
| POST 🔓 | `/auth/forgot-password` | `{email}` → `{resetToken: string \| null}` (мок: токен повертається для демонстрації; 1 год) |
| POST 🔓 | `/auth/reset-password` | `{token, password}` → `{ok:true}`; 400 невалідний/прострочений |
| POST 🔓 | `/auth/login` | як зараз; 403 `Account blocked` для `blocked`; сесія зберігає `userAgent`, `ip` |

### 3.2 Користувач (🔑)
| Метод | Шлях | Відповідь |
|---|---|---|
| GET | `/users/me` | `{id,email,role,emailVerified,createdAt,profile:{firstName,lastName,avatarUrl,bio,emailNotifications}}` |
| PUT | `/users/me/profile` | multipart: `firstName,lastName,bio,emailNotifications("true"/"false"),avatar` |
| POST | `/users/me/password` | `{currentPassword,newPassword}` → 204; 400 `Wrong password` |
| GET | `/users/me/sessions` | `[{id,userAgent,ip,createdAt,updatedAt}]` (не прострочені) |
| DELETE | `/users/me/sessions/:id` | 204 |
| DELETE | `/users/me` | `{password}` → 204 |
| GET | `/users/me/courses` | `MyCourse[]` (див. 3.9) |

### 3.3 Каталог і магазин
| Метод | Шлях | Відповідь |
|---|---|---|
| GET 🔓 | `/store/catalog?search&category&level&price=free\|paid&sort=new\|popular\|price_asc\|price_desc&page=1&pageSize=12` | `{items: CatalogCourse[], total, page, pageSize, categories: string[]}` — лише `published` |
| GET 🔓 | `/store/public/courses/:id` | `PublicCourse` + `category, level, autoApprove, sectionsCount, lessonsCount, testsCount, studentsCount, teacher:{name,bio,avatarUrl}`; 404 якщо не опубліковано |
| GET 🔑 | `/store/courses/:id/my-status` | як зараз |
| POST S | `/store/courses/:id/purchase` | як зараз, у транзакції + сповіщення `PAYMENT` |
| GET 🔑 | `/store/me/purchases` | як зараз |

### 3.4 Курси
- `POST /courses`, `PATCH /courses/:id` (T): поля `title, description, price, category, level, published("true"/"false"), autoApprove("true"/"false"), image` (multipart). Перевірка власника (ADMIN — будь-який).
- `DELETE /courses/:id` (T/A): власник або адмін.
- `GET /courses` (🔑): лише `published` (+ власні курси викладача).
- `POST /courses/:id/enroll` (S): `autoApprove` → `ACTIVE`, інакше `PENDING` + сповіщення викладачу `ENROLLMENT_REQUEST`; платний курс → 400.
- approve/reject (T): перевірка власника + сповіщення студенту.
- `GET /courses/:id/enrollments`, `GET /courses/:courseId/students/progress` (T): перевірка власника.
  `students/progress` додає: `status, percent, avatarUrl, lastActivityAt`.
- `GET /courses/:id/tests-summary` (T) → `[{testId,title,lessonTitle,attempts,students,passRate,avgScore}]`.
- `POST /courses/:id/certificate` (S) → `Certificate` (ідемпотентно; 400 якщо прогрес < 100%).

### 3.5 Тести
- `GET /tests/:id`: для студента прибрати `isCorrect` з відповідей.
- Створення/редагування тестів, питань, відповідей і `GET /tests/:id/results` — лише власник курсу (або адмін).
- `POST /tests/:id/submit`: валідація, що `answerId` належать питанню; тест без питань → 400; сповіщення `TEST_RESULT`.
- `GET /tests/:id/my-result` → `MyTestResult` (див. 3.9) з текстами питань/відповідей.
- `GET /tests/:id/my-attempts` → `[{id,attempt,score,passed,startedAt,finishedAt}]`.

### 3.6 Сертифікати
- `GET /certificates/me` (🔑) → `CertificateInfo[]`
- `GET /certificates/:code` (🔓) → `CertificateInfo`

### 3.7 Сповіщення (🔑)
- `GET /notifications?filter=all|unread|courses|tests|messages` → `Notification[]` (останні 100)
- `GET /notifications/unread-count` → `{count}`
- `PATCH /notifications/:id/read` → 204; `POST /notifications/read-all` → 204
- Тригери: заявка (викладачу), схвалення/відхилення, новий урок у опублікованому курсі (ACTIVE студентам),
  результат тесту, нове повідомлення в особистому чаті, оплата, сертифікат.

### 3.8 Адмін (A)
- `GET /admin/stats` → `{users,students,teachers,admins,courses,publishedCourses,paymentsMonthCount,paymentsMonthSum}`
- `GET /admin/users?search&role&page=1` → `{items:[{id,email,role,emailVerified,blocked,createdAt,name}],total,page,pageSize}`
- `PATCH /admin/users/:id` `{role?,blocked?}` → user; 400 на себе
- `GET /admin/payments?limit=10` → `[{id,amount,createdAt,user:{id,email,name},course:{id,title}}]`
- `GET /admin/courses` → `[{id,title,published,price,teacher:{name},studentsCount,createdAt}]`

### 3.9 Дашборд і складені типи
`GET /dashboard`:
- студент: як зараз + `continueLearning[i].nextLesson:{id,title}|null, completedLessons, totalLessons`,
  `upcomingTests:[{testId,title,courseId,courseTitle,questionsCount,timeLimit}]` (≤3, ще не складені).
- викладач: `{role:'TEACHER',name,teacherStats:{students,activeCourses,pendingRequests,avgScore},
  teachingCourses:[{id,title,imageUrl,published,price,studentsCount,avgProgress,pendingCount}],
  pendingRequests:[{courseId,courseTitle,userId,name,email,avatarUrl,requestedAt}],
  weeklyActivity:[{date,label,count}] (7 днів, завершені уроки в курсах викладача),
  attentionTests:[{testId,title,courseId,courseTitle,passRate,attempts}], recentConversations}`
- адмін: `{role:'ADMIN', name, recentConversations}` (фронтенд перенаправляє на `/admin`).

Точні TypeScript-типи — `frontend/src/lib/types.ts` (джерело правди для фронтенду).

## 4. Маршрути фронтенду

| Маршрут | Доступ | Екран |
|---|---|---|
| `/` | гість → rewrite на `/welcome`; користувач → дашборд за роллю; адмін → `/admin` | Головна / кабінет |
| `/welcome`, `/catalog`, `/c/[id]`, `/certificates/[code]` | публічні | лендинг, каталог, сторінка курсу, сертифікат |
| `/login`, `/register`, `/confirm`, `/forgot-password`, `/reset-password` | гість | авторизація |
| `/my-courses`, `/courses/[id]`, `/courses/[id]/tests/[testId]/result` | студент | навчання |
| `/profile`, `/checkout/[id]`, `/purchases`, `/notifications`, `/chat` | 🔑 | акаунт |
| `/teacher/courses/new`, `/teacher/courses/[id]/builder`, `/courses/[id]/manage` | викладач | керування |
| `/admin` | адмін | адмін-панель |
| `not-found`, `error`, 403 | — | спільні стани |

Мобільна версія (< 768 px): нижнє меню (Головна, Курси, Чат, Профіль), шапка без навігації.

## 5. Поза скоупом
- Реальна відправка email і реальні платежі (лишаються мок-сценарії з токенами в UI).
- Промокоди, мультимовність (перемикач мови не показуємо), гейміфікація, автоперевірка коду.

## 6. Нотатки реалізації бекенду (відхилення та уточнення)

- **Магазин** доступний лише під `/api/store/...`; фронтенд переведено на ці шляхи.
- `GET /courses/:courseId/students/progress` повертає **всі** записи курсу (будь-який `status`), щоб фронтенд фільтрував за статусом; раніше — лише `ACTIVE`.
- `POST /courses/:id/enroll`: 404 для неопублікованого курсу, 400 `Paid course: purchase it instead`, 400 `Already enrolled` (повторна заявка дозволена після `REJECTED`).
- `POST /tests/:id/start` вимагає `ACTIVE`-запису на курс; тест без питань → 400.
- `DELETE /users/me` → 400 `Delete or transfer your courses first`, якщо викладач має курси.
- Зміна ролі або блокування в адмінці видаляє сесії користувача; `refresh` бере актуальну роль із БД і відмовляє заблокованим.
- Логін бере user agent із заголовка `x-client-user-agent` (Next.js може пересилати браузерний UA), інакше `user-agent`; IP — `x-forwarded-for` або `req.ip`.
- Посилання в сповіщеннях: заявка → `/courses/:id/manage`; схвалення → `/courses/:id`; відхилення → `/c/:id`; новий урок/оплата → `/courses/:id`; результат тесту → `/courses/:courseId/tests/:testId/result`; повідомлення → `/chat?c=:conversationId` (одне непрочитане на розмову); сертифікат → `/certificates/:code`.
- Код сертифіката: `LMS-<рік>-<id з нулями до 6 цифр>`; видача також ставить `Enrollment.completedAt` (статус лишається `ACTIVE`).
- Міграція: `prisma/migrations/20261102120000_full_product/migration.sql` (згенерована `prisma migrate diff`, існуючі курси → `published = true`). Сид: `admin@lms.local / admin123`.

## 7. Файли уроків і власне відео (доповнення)

- Модель `LessonFile {id, lessonId, name, url, size, mimeType, createdAt}`, міграція `20261102130852_lesson_files`.
- `POST /lessons/:id/files` (T, власник; multipart `file`, ≤ 25 МБ, ≤ 20 файлів на урок; документи, таблиці, презентації,
  архіви, зображення, аудіо/відео, вихідний код; SVG/HTML заборонені) → `LessonFile`.
- `DELETE /lessons/files/:fileId` (T, власник) → 204, файл видаляється і зі сховища.
- ~~`POST /lessons/:id/video` (multipart)~~ — замінено прямим завантаженням і HLS, див. розділ «Відео: пряме завантаження і HLS».
- `GET /courses/:id` і `GET /lessons/:id` повертають `lessons[].files`. Імена файлів з кирилицею перекодовуються з latin1 (особливість multer).

## 8. Відеодзвінки

WebRTC-мережа «кожен з кожним» (mesh): медіа йде напряму між браузерами, бекенд лише передає сигнальні
повідомлення через наявний шлюз Socket.IO (`ChatGateway`). Дзвінок прив'язаний до розмови: DIRECT (1:1) або
COURSE (груповий, до 6 учасників). Стан дзвінків — у пам'яті (`CallService`), тому бекенд працює в одному екземплярі.

- Під час підключення сокет приєднується до персональної кімнати `user:{id}` — вхідний дзвінок приходить на будь-якій сторінці.
- Події клієнт → сервер (відповідь — ack `{ok, error?, call?}`; перевірка доступу через `ChatService.assertAccess`):
  - `call:start {conversationId}` — створює дзвінок або приєднує до наявного; новий дзвінок розсилає
    `call:ring {conversationId, type, title, from:{id,name,avatarUrl}}` у `user:{id}` запрошених
    (DIRECT — співрозмовник; COURSE — викладач і ACTIVE-студенти, крім ініціатора).
  - `call:join {conversationId}` — приєднання; ack містить поточних учасників, решта отримує `call:peer-joined {userId,name}`.
    Пропозиції (offer) завжди надсилає той, хто приєднався пізніше, — без колізій.
  - `call:signal {conversationId, toUserId, data}` → адресату `call:signal {conversationId, fromUserId, data}`,
    де `data` = `{type:'offer'|'answer', sdp}` або `{candidate}`; лише між учасниками одного активного дзвінка.
  - `call:state {conversationId, audio?, video?, screen?}` → іншим учасникам `call:state {userId, …}` (індикатори мікрофона/камери).
  - `call:decline {conversationId}` → учасникам `call:declined {userId}`; відхилений DIRECT-дзвінок завершується.
  - `call:leave {conversationId}` і розрив сокета → `call:peer-left {userId}`.
- Завершення: дзвінок закінчується, коли не лишилося учасників, коли одна зі сторін DIRECT-дзвінка поклала слухавку,
  або якщо за 45 с ніхто не відповів. Усім запрошеним надсилається `call:ended {conversationId}` (зупиняє дзвінок),
  а в розмову записується службове повідомлення «Відеодзвінок завершено · 05:32», «Пропущений відеодзвінок»
  чи «Відеодзвінок відхилено» (`message:new`).
- Помилки: `CALL_FULL` (сьомий учасник), `NO_CALL`, `NOT_IN_CALL`, `FORBIDDEN`, `NOT_FOUND`, а також подія `call:error`.
- REST: `GET /api/chat/conversations/:id/call` → активний дзвінок `{conversationId,type,initiatorId,startedAt,connectedAt,participants[]}` або `null`.
- Клієнт: `CallProvider` (у `providers.tsx`) — вхідний дзвінок із мелодією WebAudio, вікно дзвінка (сітка відео, мікрофон,
  камера, демонстрація екрана через `replaceTrack`, таймер, стан з'єднання), банер «Приєднатися до дзвінка» в чаті,
  кнопка «Відеодзвінок» у шапці розмови та «Онлайн-заняття» для викладача на сторінці курсу.
  ICE: публічний STUN Google + необов'язковий TURN (`NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`).
- Заголовок `Permissions-Policy` дозволяє `camera`, `microphone`, `display-capture` лише для власного походження (`self`).
- Сокет-клієнт більше не перепідключається під час оновлення access-токена того самого користувача (інакше дзвінок обривався б щокілька хвилин).

## 9. Домашні завдання (здача робіт файлами)

**Моделі** (міграція `20261110155751_assignments`):
- `Assignment {id, lessonId @unique, title, description?, dueAt?, maxScore=100, maxFiles=5}` — одне практичне завдання на урок.
- `Submission {id, assignmentId, userId, comment?, status SUBMITTED|GRADED|RETURNED, score?, feedback?, submittedAt, gradedAt?, late}`,
  `@@unique([assignmentId, userId])` — одна поточна робота студента; повторна здача замінює файли.
- `SubmissionFile {id, submissionId, name, url, size, mimeType}`; файли зберігає `StorageService` у теці `submissions`.
- `NotificationType` + `ASSIGNMENT_SUBMITTED`, `ASSIGNMENT_GRADED` (фільтр сповіщень «tests»).

**API** (префікс `/api`):

| Метод | Шлях | Доступ | Призначення |
|---|---|---|---|
| POST | `/lessons/:lessonId/assignment` | T (власник) | створити завдання до уроку |
| GET | `/assignments/:id` | S (ACTIVE) / T | завдання + власна робота студента |
| PATCH / DELETE | `/assignments/:id` | T | змінити / видалити (разом із файлами робіт) |
| POST | `/assignments/:id/submission` | S (ACTIVE) | multipart `files` (≤ maxFiles, ≤ 25 МБ, allow-list як у файлів уроку), `comment`; дозволено, поки робота не GRADED; `late = now > dueAt` |
| GET | `/assignments/:id/submissions` | T | усі роботи зі студентами й файлами |
| PATCH | `/submissions/:id/grade` | T | `{score 0..maxScore, feedback?}` → GRADED + сповіщення студенту |
| PATCH | `/submissions/:id/return` | T | `{feedback}` → RETURNED + сповіщення студенту |
| GET | `/courses/:id/assignments-summary` | T | по кожному завданню: total, pending, graded, returned, late |

Прогрес курсу враховує завдання (зараховується після оцінки), `progress.assignments` — id оцінених завдань;
`GET /dashboard` студента повертає `upcomingAssignments` (≤ 3, не оцінені, за терміном).

**Фронтенд:** пункт «Завдання: …» у змісті курсу (`?assignment=:id`), `AssignmentViewer` (опис, термін, здача файлів
перетягуванням, статус і коментар викладача), `AssignmentEditor` у конструкторі, вкладка «Завдання» на сторінці
керування курсом із діалогом оцінювання, блок «Найближче» в кабінеті студента.


## Безпека: обмеження запитів, блокування входу, захищені файли

- **Обмеження запитів** (`@nestjs/throttler`, глобальний guard `ClientIpThrottlerGuard`): ключ — перша адреса з
  `X-Forwarded-For` (браузер за Next.js/Render), інакше `req.ip`. Увесь API — `THROTTLE_LIMIT` запитів/хв
  (типово 300 у production, 5000 в інших середовищах); `/auth/login`, `/register`, `/confirm`, `/resend-confirmation`,
  `/forgot-password`, `/reset-password` — `THROTTLE_AUTH_LIMIT` (10 / 500). Перевищення → 429; фронтенд показує
  «Забагато спроб. Спробуйте за хвилину.». `/files/*` і WebSocket не обмежуються.
- **Блокування входу:** `User.failedLoginCount`, `User.lockedUntil` (міграція `login_lockout`). 5 невдалих паролів
  поспіль → блокування на 15 хв (`423 Account temporarily locked`, навіть із правильним паролем); успішний вхід,
  скидання пароля або дія адміністратора (роль/блокування) скидають лічильник.
- **Заголовки:** `helmet` (без CSP для JSON API, `Cross-Origin-Resource-Policy: cross-origin` для вбудовування медіа).
- **Захищені файли:** `/public/lessons`, `/public/videos`, `/public/submissions` більше не роздаються статично
  (аватари й обкладинки — так само публічні). `GET /api/files/:kind/:id`, `kind` ∈ `lesson-file | lesson-video |
  submission-file`, приймає підписане посилання (`u`, `exp`, `sig` = HMAC-SHA256 від `kind:id:userId:exp` на
  `FILES_SIGNING_SECRET`, строк 1–2 год, вирівняний до години) або Bearer-токен. Доступ: файли/відео уроку —
  викладач курсу, адміністратор, студент з ACTIVE-записом; файли здачі — автор, викладач курсу, адміністратор.
  Локальні файли віддаються з підтримкою Range (206) і `Content-Disposition` (RFC 5987 для кирилиці); Vercel Blob
  проксіюється з передачею Range. Глобальний інтерцептор `SignedFilesInterceptor` замінює в усіх JSON-відповідях
  `url` файлів уроків/здач і `videoUrl` завантажених відео на підписані абсолютні посилання для поточного
  користувача (`API_PUBLIC_URL`); без користувача такі посилання обнуляються.
- **Завантаження:** порожні файли відхиляються; аватари й обкладинки перевіряються за сигнатурою (PNG, JPEG, GIF, WebP).

## 10. Журнал оцінок

**Схема:** `Course` + `testsWeight Int @default(50)`, `assignmentsWeight Int @default(50)`, `gradePassThreshold Int @default(60)`
(міграція `20261111210552_gradebook`). Редагуються через `PATCH /courses/:id` (multipart, 0..100);
сума ваг ≠ 100 → 400 `Grade weights must add up to 100`.

**Правила підрахунку** (`backend/src/modules/gradebook/gradebook.compute.ts`, чиста функція):
- клітинка тесту — найкраща завершена спроба, %; завдання — оцінка в балах (у середнє йде як `score / maxScore`);
- стани клітинки: `graded`, `submitted` (здано, не перевірено), `returned` (на доопрацюванні), `missing`, `late` (не здано після `dueAt`); прапорець `late` у зданих із запізненням;
- незданий або неперевірений елемент рахується як 0 (підсумок відображає весь курс);
- категорія без елементів випадає, вага решти нормується; якщо в усіх наявних категорій вага 0 — звичайне середнє;
- `passed` = `final ≥ gradePassThreshold`. Враховуються записи `ACTIVE` і `COMPLETED`.

| Метод | Шлях | Доступ | Відповідь |
|---|---|---|---|
| GET | `/courses/:id/gradebook` | T (власник) / A | `{course:{id,title,testsWeight,assignmentsWeight,gradePassThreshold}, columns, rows, stats:{studentsCount,avgFinal,passRate,perColumn}}` |
| GET | `/courses/:id/gradebook/export?format=xlsx\|csv` | T / A | файл; `Content-Disposition` з ASCII-іменем і `filename*` (RFC 5987, кирилиця); CORS віддає заголовок через `exposedHeaders` |
| GET | `/courses/:id/my-grades` | S (ACTIVE/COMPLETED) | `{course, columns, row}` — лише власний рядок |

XLSX (`exceljs`): аркуш «Журнал» (жирний закріплений заголовок, автофільтр, ширини колонок, формат `%`)
і «Підсумки» (статистика, ваги, середні по елементах). CSV — UTF-8 з BOM, роздільник `;`, десяткова кома.

**Фронтенд:** вкладка «Журнал оцінок» у `/courses/[id]/manage?tab=gradebook` (закріплена колонка студента,
групування заголовків за розділами, стани текстом і кольором, фільтр «не склали», пошук, рядок середніх,
експорт); група «Оцінювання» у налаштуваннях конструктора; сторінка студента `/courses/[id]/grades`
(посилання «Мої оцінки» у верхній панелі курсу та в «Мої курси»).

## Масштабування: Redis і черга задач

- **RedisModule** (глобальний, `ioredis`, змінна `REDIS_URL`). Без `REDIS_URL` — режим одного екземпляра: усе нижче працює в памʼяті процесу (попередження в лозі один раз).
- **Socket.IO Redis adapter** (`@socket.io/redis-adapter`, `RedisIoAdapter` у `main.ts`): `server.to(room).emit` доходить до сокетів на будь-якому екземплярі — кімнати `user:{id}`, `conversation:{id}`, `call:{id}` і кімната сокета (її id).
- **Стан дзвінків** — `CallStore`: `MemoryCallStore` або `RedisCallStore` (JSON `call:{conversationId}` з TTL 6 год, множина `call-socket:{socketId}` для очищення при відʼєднанні). Зміни виконуються під блокуванням `lock:call:{id}` (`LockService`: Redis `SET NX PX` або ланцюжок промісів у памʼяті). Сигналінг адресується id сокета — з адаптером він доставляється на інший екземпляр.
- **Таймаут дзвінка (45 с)** — відкладена задача `calls/ring-timeout` у BullMQ (`jobId` = `ring-{conversationId}-{startedAt}`). Задача перевіряє, що дзвінок той самий і досі без відповіді; виконується будь-яким API-екземпляром (черга `calls` позначена `inApi`), тож спрацьовує, навіть якщо екземпляр, що почав дзвінок, зупинився.
- **Обмеження запитів** — `RedisThrottlerStorage` (фіксоване вікно `INCR` + `PEXPIRE NX`, блокування окремим ключем), спільні лічильники для всіх екземплярів.
- **Обмеження листів про нові повідомлення** (15 хв на розмову й отримувача) — `SET mail-throttle:message:{userId}|{link} NX PX`.
- **Черги** — `QueueService`: `register(queue, name, processor, { inApi? })` в `onModuleInit` модулів і `enqueue(queue, name, data, { delay, jobId, attempts })`. З Redis — BullMQ (воркери стартують в API, якщо `WORKER_ENABLED` ≠ `false`, або в окремому процесі `node dist/src/worker.js` з `WorkerModule`); без Redis — запуск у процесі через `setTimeout` з тією ж семантикою (затримка, дедуплікація за `jobId`).
- **Health:** `GET /api/health` → `{ status, db, redis: true | false | null }`.
- **Локально:** `docker-compose.yml` (Postgres 16 + Redis 7, `noeviction`). **Render:** Key Value `lms-redis` у `render.yaml`, `REDIS_URL` підставляється автоматично; альтернатива — Upstash.

## Команда курсу

Курс може мати кількох викладачів і асистентів. Модель `CourseStaff {courseId, userId, role: OWNER | TEACHER | ASSISTANT}`
(`@@unique([courseId, userId])`, міграція `*_course_staff` з backfill власника). `Course.teacherId` лишається власником
(сумісність: сертифікати, лендинг, видалення акаунта), у таблиці йому відповідає рядок `OWNER`.

Права перевіряються в одному місці — `backend/src/common/access/course-access.ts` (`getCourseRole`, `assertCourseRole`,
`assertRoleOnCourse`, `courseStaffIds`, `staffCourseWhere`); фронтенд дзеркалить матрицю в `frontend/src/lib/courseRole.ts`.

| Право | OWNER | TEACHER | ASSISTANT | Що дає |
|---|---|---|---|---|
| view | ✓ | ✓ | ✓ | курс без запису, прогрес студентів, результати тестів, журнал + експорт, файли курсу |
| manage | ✓ | ✓ | ✓ | схвалення/відхилення заявок, чат курсу, онлайн-дзвінок курсу (як учасник) |
| grade | ✓ | ✓ | ✓ | оцінювання й повернення робіт |
| content | ✓ | ✓ | — | розділи, уроки, файли, відео, тести, завдання, публікація, ваги оцінювання |
| owner | ✓ | — | — | ціна, видалення курсу, склад команди, передача курсу |

ADMIN проходить усі перевірки. Викладачем курсу може бути лише обліковий запис `TEACHER`; асистентом — `TEACHER` або `STUDENT`
(наприклад, старшокурсник). Студентський акаунт-асистент лишається студентом в інших курсах; маршрути для команди
(`/courses/:id/manage`, оцінювання, журнал) не мають обмеження за роллю акаунта, рішення ухвалює роль у курсі. Конструктор
(`/teacher/...`) доступний лише OWNER/TEACHER.

API (власник або адмін, крім GET):
- `GET /courses/:id/staff` (будь-хто з команди) → `{ myRole, staff: [{userId, role, addedAt, name, email, avatarUrl, accountRole}] }`
- `POST /courses/:id/staff` `{email, role: TEACHER|ASSISTANT}` → список; 404 — немає користувача, 400 — уже в команді / студент як TEACHER / адмін
- `PATCH /courses/:id/staff/:userId` `{role}`; `DELETE /courses/:id/staff/:userId` (власника не можна видалити чи понизити)
- `POST /courses/:id/staff/transfer` `{userId}` — передати курс викладачу з команди (колишній власник стає TEACHER)
- Сповіщення `COURSE_STAFF_ADDED` (uk/en/pl, з дублюванням на пошту).

Зміни у відповідях: `GET /courses/:id` → `myRole`; `GET /dashboard` викладача — курси, де він у команді, з `myRole`; студента —
`assistingCourses`. Заявки на запис сповіщають OWNER+TEACHER, здані роботи — усю команду. `GET /courseProgress/courses/:id/progress/:userId`
тепер вимагає ролі в курсі (раніше будь-який викладач бачив прогрес будь-якого студента).

## Календар і нагадування

Сторінка `/calendar` (пункт «Календар» у десктопній навігації студента й викладача; на мобільному — посилання «Календар»
у блоці «Найближче» на дашборді та в меню профілю). Перемикач «Місяць / Список», фільтр за курсом, позначка сьогоднішнього
дня (`aria-current="date"`), клітинки днів — кнопки з підписом «дата, N подій»; кольори типів продубльовані текстовими мітками.
Дати й час — у часовому поясі Europe/Kyiv. Стан (вигляд, місяць, день, курс) — у query-параметрах (`?view=agenda&date=…&course=…`).

Що потрапляє в календар:
- дедлайни завдань (`Assignment.dueAt`) з курсів, де користувач має активний/завершений запис або роль у команді; студенту —
  позначка «Здано / Не здано»;
- події курсу `CourseEvent {id, courseId, title, description?, kind: LECTURE | ONLINE_LESSON | DEADLINE | OTHER, startsAt,
  endsAt?, createdById?}` (міграція `*_calendar`). Створюють і редагують їх члени команди з правом `content`
  (кнопка «Додати подію» в календарі з вибором курсу).
- Тести поки не показуються: у моделі `Test` немає вікна доступності (`opensAt/closesAt`).

API:
- `GET /calendar?from&to` (діапазон ≤ 400 днів, за замовчуванням −7…+60 днів) → `{from, to, items: [{id, kind, title,
  description, courseId, courseTitle, startsAt, endsAt, link, done, role, eventId, canEdit}], courses, canCreateIn}`
- `GET /courses/:id/events` (view), `POST /courses/:id/events`, `PATCH|DELETE /courses/:id/events/:eventId` (content)
- `GET /calendar/ical-url` → `{url}`; `POST /calendar/ical/reset` — нове посилання, старе одразу перестає працювати
- `GET /calendar/ical/:token.ics` — публічна iCal-підписка (RFC 5545: UTC-час, CRLF, згортання рядків по 75 байт,
  екранування TEXT, стабільні UID `assignment-N@lms` / `event-N@lms`). Токен `userId.version.hmac` підписаний
  `CALENDAR_SECRET` (або `FILES_SIGNING_SECRET`); відкликання — інкремент `UserProfile.calendarTokenVersion`.
- `POST /calendar/dev/remind {kind: 'assignment'|'event', id}` — лише поза `NODE_ENV=production` і для команди курсу:
  надсилає нагадування одразу (для e2e та демо), повертає `{notified}`.

Нагадування (`backend/src/modules/calendar/reminders.service.ts`, черга BullMQ `reminders`): за 24 год і за 1 год до дедлайну
завдання чи початку події. Створення/зміна дати завдання або події ставить відкладені задачі з `jobId`
`deadline-<kind>-<id>-<24h|1h>-<timestamp>`: зміна дати просто додає нові задачі, а старі під час виконання бачать іншу дату
й нічого не роблять (так само для видалених). У чергу потрапляє лише те, що настане в найближчі 8 днів; решту ставить
узгодження (`reconcile`) — під час старту бекенду й кожні 6 год (на випадок порожнього Redis або перезапуску без Redis).
Отримувачі: для завдань — активні студенти опублікованого курсу без зданої роботи; для подій — активні студенти й команда.
Сповіщення типу `DEADLINE_REMINDER` (мова отримувача uk/en/pl, фільтр «Тести й завдання»), лист — якщо увімкнено
`emailNotifications`. Вимкнути нагадування: Профіль → Налаштування → «Нагадування про дедлайни»
(`UserProfile.deadlineReminders`). Студентський дашборд у «Найближче» показує й найближчі події курсів.

## Відео: пряме завантаження і HLS

Власне відео уроку більше не проходить через памʼять API одним multipart-запитом: файл завантажується напряму
в сховище, а потім фоново перекодовується в HLS (адаптивний потік 720p/360p).

**Модель** `LessonVideo {id, lessonId @unique, status: UPLOADING | PROCESSING | READY | FAILED, progress 0–100,
sourceUrl, mp4Url, hlsPrefix, renditions ("720,360"), hasPoster, durationSec, width, height, sizeBytes, error}`
(міграція `20261111233228_video_hls`; старі завантажені `Lesson.videoUrl` перенесено в `LessonVideo` як READY з `mp4Url`
і перекодовуються в HLS під час старту бекенду). `Lesson.videoUrl` лишився лише для посилань YouTube/Vimeo.

**Завантаження** (право `content` у курсі, `common/access/course-access.ts`):
- `POST /lessons/:id/video/uploads` `{size, mime, name}` (MP4/WebM/MOV ≤ 2 ГБ) →
  - без Blob (локально): `{mode: 'chunked', uploadId, chunkSize: 8 МБ, totalChunks}`;
  - з `BLOB_READ_WRITE_TOKEN`: `{mode: 'blob', pathname, handleUploadUrl, maxSize}` — браузер вантажить напряму у Vercel Blob
    (`@vercel/blob/client` `upload`, multipart для > 100 МБ), токен видає `POST /lessons/:id/video/upload-token`
    (`handleUpload`; Bearer перевіряється в `onBeforeGenerateToken`), після чого клієнт викликає
    `POST /lessons/:id/video/complete {url}` (URL перевіряється: лише свій Blob-store і шлях `video-src/`).
- Локальний режим із відновленням: `PUT /videos/uploads/:uploadId/chunks/:index` (сирий потік ≤ 8 МБ, довжина має
  точно збігатися, пишеться на диск у `backend/private/video-uploads/`), `GET /videos/uploads/:uploadId` → `{received: [..]}`
  для продовження після паузи/обриву, `POST /videos/uploads/:uploadId/complete` — склеює частини, перевіряє розмір і сигнатуру
  контейнера (ftyp/EBML) → `LessonVideo` зі статусом PROCESSING. Сесії старші за 24 год прибираються при старті.
- `GET /lessons/:id/video` (хто може дивитись урок) → `{video}`; `POST /lessons/:id/video/retry` (FAILED → PROCESSING);
  `DELETE /lessons/:id/video` → 204 (видаляє джерело, HLS і постер). Видалення уроку теж прибирає відео.

**Перекодування** — черга BullMQ `video` / задача `transcode` (без Redis — у процесі, послідовно), concurrency 1.
`ffmpeg` запускається через `spawn` без shell: метадані з `ffmpeg -i` (тривалість, розмір, поворот), рендиції 720p
(якщо джерело ≥ 720) і 360p, H.264 (veryfast, обмежений бітрейт) + AAC, сегменти по 6 с з примусовими ключовими кадрами, VOD-плейлисти,
master.m3u8, постер із кадру на 10 % тривалості. Прогрес (`-progress pipe:1`) зберігається в БД; помилка → FAILED з текстом.
Якщо джерело вже замінили новим завантаженням, стара задача пропускається. Результат: локально `backend/private/hls/<id>-<rand>/`,
з Blob — `hls/<id>-<rand>/` у Blob. Для MP4-джерела воно ж лишається запасним прогресивним файлом.

**Захищена роздача** — `GET /api/files/hls/:videoId/<file>` (`master.m3u8`, `720p.m3u8`, `720p_000.ts`, `poster.jpg`,
`source.mp4`; інші імена → 404). Доступ — підпис `u, exp, sig` (новий вид `lesson-hls`, один підпис на відео й користувача,
година з вирівнюванням як для інших файлів) або Bearer; далі перевірка, що користувач може дивитись урок (команда курсу або
ACTIVE-запис). Плейлисти читаються й переписуються на кожен запит: кожен відносний URI отримує той самий підпис,
тож hls.js і Safari ходять за сегментами без заголовків. Сегменти/постер/MP4 віддаються з Range (або проксуються з Blob).

**Відповіді** `GET /courses/:id`, `GET /lessons/:id`: `lessons[].video = {id, status, progress, hlsUrl, posterUrl,
mp4FallbackUrl, qualities, durationSec, width, height, sizeBytes, error}` — підписані URL додає `SignedFilesInterceptor`,
внутрішні шляхи (`sourceUrl`, `hlsPrefix`) назовні не віддаються.

**Фронтенд.** `components/video/VideoUploader.tsx` (вкладка «Свій файл» у редакторі уроку): drag & drop, перевірка типу й
розміру, реальний прогрес, пауза/продовження (локальний режим), повтор із backoff, «Обробка відео… 45 %» з опитуванням
кожні 2 с, перегляд готового відео з тривалістю та якостями, повтор обробки при FAILED, заміна і видалення з підтвердженням.
`components/video/VideoPlayer.tsx` у `LessonViewer`: hls.js (динамічний імпорт, `capLevelToPlayerSize`) скрізь, де є
MSE (зокрема новий Chrome, що вже вміє HLS нативно, — щоб працював вибір якості), нативний HLS лише без MSE (старий iOS Safari), вибір якості «Авто / 720p / 360p» (звичайний `<select>`), постер, `playsInline`, перехід на MP4 при фатальній
помилці HLS. Рядки — простір імен `video` (uk/en/pl).

**Тести:** `backend/src/modules/videos/videos.spec.ts` (аргументи ffmpeg і розбір метаданих, переписування й підпис плейлистів,
склейка/відновлення частин, права на токен завантаження, переходи статусів задачі, інтеграційний тест зі справжнім ffmpeg);
`frontend/e2e/video.spec.ts` (викладач вантажить MP4 через UI, чекає READY; студент відтворює HLS із підписом, readyState ≥ 2,
вибір якості; master без підпису → 401; сторонній користувач → 403).

**Обмеження:** локальне сховище (`backend/private`) не спільне між екземплярами — для кількох інстансів потрібен Blob;
підписане посилання можна передати іншій людині в межах терміну дії (≤ 2 год); перекодування довгих відео на безкоштовному
Render повільне (див. DEPLOY.md); під час видалення курсу цілком файли відео не прибираються (лише при видаленні уроку/відео).

## Типи питань і банк питань

**Типи** (`QuestionType`): SINGLE, MULTIPLE, TRUE_FALSE, SHORT_TEXT, NUMERIC, MATCHING, ORDERING, ESSAY. Налаштування
типу — у `Question.config` (JSON, перевіряється й нормалізується на сервері, `modules/tests/question-types.ts`):
TRUE_FALSE `{correct}`, SHORT_TEXT `{accepted[], caseSensitive}`, NUMERIC `{value, tolerance}`, MATCHING
`{pairs: [{left, right}]}`, ORDERING `{items[]}` (у правильному порядку), ESSAY `{maxWords?, rubric}`. Кожне питання має
`points` (1–100) і `partialCredit`.

**Оцінювання**: бал тесту = зароблені / усі бали × 100. За замовчуванням «все або нічого»; MULTIPLE з частковим балом —
max(0, (правильні − неправильні) / кількість правильних); MATCHING — завжди частка правильних пар; ORDERING з частковим
балом — частка позицій на своєму місці. SHORT_TEXT порівнюється після trim і без урахування регістру (якщо не увімкнено),
NUMERIC — |відповідь − value| ≤ tolerance (кома як десятковий роздільник приймається). ESSAY → статус `PENDING`:
спроба отримує `pendingReview = true`, `passed = null`, у журналі клітинка має стан «Здано» (не впливає на найкращий бал).

**Налаштування тесту**: `shuffleQuestions`, `shuffleAnswers`, `maxAttempts` (null — без обмежень; сервер відмовляє
`400 No attempts left`), `questionsPerAttempt` (випадкова підмножина власних питань), `showCorrectAnswers`:
`AFTER_SUBMIT` (типово), `AFTER_PASS` (після будь-якої складеної спроби), `AFTER_CLOSE` (коли спроби вичерпано — у тестів
немає дати закриття), `NEVER` (видно лише правильно/неправильно, без ключа).

**Спроба**: `POST /tests/:id/start` вибирає питання (підмножина + правила банку), перемішує порядок/варіанти та зберігає
все в `AttemptQuestion {testResultId, questionId, position, optionOrder, response, earned, maxPoints, status AUTO|PENDING|GRADED,
feedback, gradedAt, gradedById}` — розбір і повторне оцінювання стабільні. Пари MATCHING і елементи ORDERING перемішуються
завжди. Студент ніколи не отримує ключ: `GET /tests/:id` для студента повертає лише налаштування, `questionCount`,
`attemptsUsed/attemptsLeft`, а питання — тільки з `start` (без `isCorrect`, accepted, правильних пар/порядку).
`POST /tests/:resultId/submit {answers: {questionId: response}}`, формати відповіді: `{answerIds}` (або масив),
`{value: boolean}`, `{text}`, `{value: number}`, `{pairs: {leftIndex: rightIndex}}`, `{order: [itemIndex…]}`;
неправильна форма → 400. Старі спроби без `AttemptQuestion` розбираються за `UserAnswer`.

**Перевірка есе**: `GET /tests/reviews/course/:courseId` (право `grade`) → черга відповідей; `PATCH
/tests/attempt-questions/:id/grade {points, feedback?}` перераховує бал і `passed`; коли нічого не лишилось на
перевірці — студент отримує сповіщення «Тест перевірено». Під час здачі з есе команда курсу отримує «Потрібна перевірка».
UI: Керування → Тести → блок «Потребує перевірки» з діалогом оцінювання.

**Банк питань** (вкладка «Банк питань» у конструкторі, право `content`): `QuestionBankCategory {courseId, name}`, питання
банку — ті самі `Question` з `categoryId` (редагуються тими ж ендпоїнтами `/tests/questions/:id`, `/tests/answers/:id`).
- `GET /courses/:id/question-bank`, `POST /courses/:id/question-bank/categories`, `PATCH|DELETE /question-bank/categories/:id`,
  `POST /question-bank/categories/:id/questions`
- `POST /tests/:id/copy-from-bank {questionIds}` — копії в тест (подальші зміни банку їх не зачіпають);
  `PUT /tests/:id/random-rules {rules: [{categoryId, count}]}` — «N випадкових питань з категорії» на кожну спробу
  (`TestRandomRule`, без повторів).
- GIFT (Moodle): `POST /courses/:id/question-bank/import {text, categoryId?}` (≤ 500 тис. символів; без categoryId
  категорії створюються за `$CATEGORY`, інакше «GIFT») → `{imported, skipped: [{line, reason, text}], categoryIds}`;
  `GET /courses/:id/question-bank/export?categoryId` — текстовий файл. Підтримано: `{=a ~b}`, ваги `~%50%`, `{T}/{F}`,
  `{=a =b}`, `{#v:t}` / `{#a..b}`, `{=a -> b}`, `{}` (есе), `::назва::`, `//`, екранування, `#feedback` ігнорується.
  ORDERING у GIFT не має формату — при експорті записується коментарем.

Міграція `20261112010000_question_types`. Сід: нові типи в тестах «Основи веб-розробки» і «TypeScript», категорія
«HTML і CSS: банк» з правилом «2 випадкові питання» для тесту з JavaScript. E2E: `frontend/e2e/question-types.spec.ts`.

## Коригування оцінок і шкали

**Модель даних.** `GradeOverride (courseId, userId, itemKey, value, reason, createdById)` — унікальна на `(courseId, userId, itemKey)`; `itemKey` — `test-<id>`, `assignment-<id>` або `final`. Кожна зміна чи скидання пише рядок у `GradeOverrideHistory (oldValue, newValue, reason, changedById, createdAt)`. У `Course` додано `gradingScale` (`PERCENT | FIVE_POINT | ECTS | PASS_FAIL`, за замовчуванням `PERCENT`) і `gradingScaleConfig` (JSON власних меж). Новий тип сповіщення `GRADE_UPDATED`. Міграція `20261112020000_grade_overrides`.

**Розрахунок.** Коригування клітинки застосовується до розрахунку середніх (клітинка вважається оціненою); коригування підсумку замінює зважений результат. Клітинка/рядок отримують позначку `overridden { value, original, reason, by, at }`, де `original` — автоматичне значення. Рядок містить `scaleGrade { code, passed }`; ознака «зараховано» береться зі шкали.

**Шкали.**

| Шкала | Межі за замовчуванням | Зараховано |
|---|---|---|
| Відсотки | — | підсумок ≥ поріг зарахування |
| 5-бальна | 5 ≥ 90, 4 ≥ 75, 3 ≥ 60, 2 < 60 | 5, 4, 3 |
| ECTS | A ≥ 90, B ≥ 82, C ≥ 74, D ≥ 64, E ≥ 60, FX ≥ 35, F < 35 | A–E |
| Зараховано / ні | — | підсумок ≥ поріг зарахування |

Власні межі: ті самі коди, цілі 0–100, строго спадають, найнижча = 0 (інакше `400`). Зміна шкали без конфігурації скидає власні межі.

**API** (ролі курсу OWNER / TEACHER / ASSISTANT, адміністратор):

| Метод | Шлях | Що робить |
|---|---|---|
| `PUT` | `/courses/:id/gradebook/overrides` | `{ userId, itemKey, value, reason }`: значення в межах елемента (тест/підсумок — 0–100, завдання — 0–maxScore), причина ≥ 5 символів; повертає оновлений рядок студента |
| `DELETE` | `/courses/:id/gradebook/overrides?userId&itemKey&reason` | повертає автоматичне значення; `404`, якщо коригування немає |
| `GET` | `/courses/:id/gradebook/overrides/history?userId` | історія змін студента |

Шкалу задають через `PATCH /courses/:id` (`gradingScale`, `gradingScaleConfig` — рядок JSON). Студент після кожної зміни отримує сповіщення з причиною й посиланням на «Мої оцінки».

**Експорт.** Додано колонку «Оцінка за шкалою» («5 (відмінно)», «A», «зараховано»). У xlsx змінені значення — курсивом з приміткою «Змінено вручну: причина (хто)»; у CSV — суфікс `*` і рядок-легенда в кінці.

**Інтерфейс.** У журналі клітинки й підсумок — кнопки, що відкривають діалог зміни (поточне й автоматичне значення, нова оцінка, причина, «Скинути до автоматичної», історія); змінені значення мають позначку з підказкою-причиною, є колонка «Оцінка». У налаштуваннях курсу — вибір шкали, таблиця меж і попередній перегляд розподілу студентів за поточним журналом. На сторінці «Мої оцінки» — оцінка за шкалою, причина зміни й автоматичне значення.

**Тести.** `grade-overrides.spec.ts` (unit, бекенд) і `frontend/e2e/grade-overrides.spec.ts`.

## Групові чати й аудіодзвінки

**Групи.** Новий тип розмови `GROUP` (міграція `20261113150000_group_conversations`: значення enum `ConversationType` і колонки `Conversation.title`, `Conversation.ownerId`). Групу створює будь-який користувач; додати можна лише «контакти» — людей зі спільних курсів (одногрупники, команда курсу, студенти курсів, які користувач викладає) і тих, з ким уже є особиста розмова. Адміністратор може додати будь-кого. До 50 учасників (у дзвінку — як і раніше до 6). Власник перейменовує групу, додає й видаляє учасників; будь-хто може вийти. Якщо виходить власник — керування переходить до учасника, що в групі найдовше; коли виходить останній, група видаляється разом із повідомленнями. Нові учасники й повідомлення в групі дають сповіщення `NEW_MESSAGE` (одне непрочитане на розмову).

| Метод | Шлях | Що робить |
|---|---|---|
| `GET` | `/chat/contacts?q=` | до 30 контактів `{ id, name, email, role, avatarUrl }`, пошук за іменем/email |
| `POST` | `/chat/groups` | `{ title (1–80), memberIds[] }` → розмова (як у `/chat/conversations`); `403`, якщо серед учасників не контакт |
| `GET` | `/chat/groups/:id` | `{ id, title, ownerId, members[] }`; лише для учасників |
| `PATCH` | `/chat/groups/:id` | `{ title }`, лише власник |
| `POST` | `/chat/groups/:id/members` | `{ userIds[] }`, лише власник, лише контакти |
| `DELETE` | `/chat/groups/:id/members/:userId` | видалити учасника (власник); власний id = вийти |
| `POST` | `/chat/groups/:id/leave` | вийти з групи |

`GET /chat/conversations` для кожної розмови тепер повертає ще `memberCount` і (для груп) `ownerId`.

**Аудіодзвінки.** `call:start` приймає `{ conversationId, media: 'audio' | 'video', audio, video }`, `call:join` — `{ conversationId, audio, video }`: `media` — тип дзвінка (за замовчуванням `video`), `audio`/`video` — що учасник реально надсилає. `call:ring` і `CallInfo` містять `media`, `call:peer-joined` — стан мікрофона й камери учасника. В аудіодзвінку клієнт просить у браузера лише мікрофон; камеру можна увімкнути кнопкою під час дзвінка (повторне узгодження з'єднань). Журнал у чаті: «Аудіодзвінок завершено · 05:32», «Пропущений аудіодзвінок», «Аудіодзвінок відхилено». Групові дзвінки в `GROUP` працюють як у чатах курсів: дзвонить усім учасникам, банер «Приєднатися», до 6 людей (WebRTC mesh).

**Інтерфейс.** У списку розмов — кнопка «Нова група» (діалог: назва, пошук і вибір учасників) і розділ «Групи». У шапці розмови — кнопки «Аудіодзвінок» і «Відеодзвінок», для групи — «Учасники й налаштування групи» (перейменування, список з позначками «власник»/«ви», додавання, видалення, вихід). Вхідний дзвінок показує тип: «Аудіодзвінок», «Груповий аудіодзвінок», «Груповий відеодзвінок».

**Тести.** `chat.groups.spec.ts`, розділ «audio calls» у `call.service.spec.ts` (unit); `frontend/e2e/groups.spec.ts` і «direct audio call» у `frontend/e2e/call.spec.ts`.
