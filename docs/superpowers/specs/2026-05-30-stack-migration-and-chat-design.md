# Миграция стека MagistrDiplom + чат — дизайн

**Дата:** 2026-05-30
**Статус:** утверждён (дизайн), ожидает ревью спецификации

## 1. Цель

Чистый rewrite учебной платформы (LMS) MagistrDiplom в современный стек с сохранением всех текущих фич и набора сущностей БД, плюс новая фича — чат (комнаты по курсам + личные сообщения 1-на-1).

Текущий стек: Express 5 + TypeScript + Sequelize/PostgreSQL (backend), React 19 + Redux Toolkit + Vite + JS (frontend).
Целевой стек: NestJS + Prisma/PostgreSQL (backend), Next.js (App Router) + TypeScript + TanStack Query + Auth.js (frontend).

## 2. Зафиксированные решения

| Область | Решение |
|---|---|
| Стратегия | Чистый rewrite с нуля; старый код — референс (переносится в `legacy/`) |
| Репозиторий | Две папки `backend/` (NestJS) и `frontend/` (Next.js), без monorepo-тулинга |
| ORM | Prisma + PostgreSQL; `schema.prisma` пишется вручную по текущим моделям; `prisma migrate` с нуля + seed-скрипт |
| Backend framework | NestJS, модульная архитектура; REST-контракт идентичен текущему (`/api/...`) |
| Frontend framework | Next.js App Router + React Server Components + TanStack Query; Redux убираем |
| Язык фронта | TypeScript |
| Стили | SCSS-модули переносятся как есть |
| Формы | react-hook-form + zod (вместо Formik + Yup) |
| Авторизация | Auth.js (NextAuth) на фронте + JWT (access/refresh) в NestJS |
| Realtime | Socket.io через NestJS WebSocket Gateway — чат (комнаты курсов + личка) |
| Уведомления | Не в скоупе (YAGNI) |
| Тесты | Не в скоупе (можно добавить позже) |
| База данных | Можно пересоздать с нуля (данные тестовые), seed для дев-данных |

## 3. Структура папок

```
legacy/                         # старые backend/ и frontend/ (референс)
backend/                        # NestJS
  prisma/
    schema.prisma
    seed.ts
    migrations/
  src/
    main.ts
    app.module.ts
    prisma/                     # PrismaModule (глобальный)
    common/                     # guards, decorators, filters, interceptors
    modules/
      auth/  users/  courses/  sections/  lessons/
      tests/  enrollments/  progress/  chat/
frontend/                       # Next.js + TS
  src/
    app/
      (auth)/login  (auth)/register
      (app)/layout.tsx  (app)/page.tsx
      (app)/profile  (app)/courses/[id]  (app)/courses/[id]/manage
      (app)/teacher/courses/new  (app)/teacher/courses/[id]/builder
      (app)/chat
      api/auth/[...nextauth]/route.ts
    components/
    lib/api/   lib/auth/   lib/socket/
    hooks/                      # React Query хуки
```

## 4. Backend (NestJS + Prisma)

### 4.1 Модули
Каждый модуль = controller + service + DTO (`class-validator`):
`AuthModule, UsersModule, CoursesModule, SectionsModule, LessonsModule, TestsModule, EnrollmentsModule, ProgressModule, ChatModule`.
Плюс глобальный `PrismaModule` (оборачивает `PrismaClient`) и `common/` (guards, decorators, exception filter, interceptors).

### 4.2 Prisma-схема
1:1 перенос 13 текущих таблиц + 3 новые для чата. Имена таблиц и полей сохраняются (совместимость с seed и логикой).

Сущности и связи (из текущих Sequelize-моделей):
- `User` (email unique, password, role) — enum `UserRole { STUDENT, TEACHER, ADMIN }`, default STUDENT
- `UserProfile` (firstName?, lastName?, avatarUrl?, bio?, userId unique) — 1:1 к User
- `Session` (userId, refreshTokenHash, userAgent?, ip?, expiresAt) — refresh-сессии
- `Course` (title, description?, imageUrl?, teacherId) — belongsTo User(teacher), hasMany Section, M:N User через Enrollment, hasMany Enrollment
- `Section` (title, order, courseId) — belongsTo Course, hasMany Lesson
- `Lesson` (title, content?, videoUrl?, order, sectionId) — belongsTo Section, hasMany LessonProgress, hasOne Test
- `Test` (lessonId, title default 'Test', timeLimit, passingScore default 60) — belongsTo Lesson, hasMany Question, hasMany TestResult
- `Question` (testId, text, type default 'SINGLE', difficulty default 1) — enum `QuestionType { SINGLE, MULTIPLE }`, hasMany Answer
- `Answer` (questionId, text, isCorrect default false)
- `Enrollment` (userId, courseId, status, enrolledAt, completedAt?) — enum `EnrollmentStatus { PENDING, ACTIVE, REJECTED, COMPLETED }`, default PENDING
- `LessonProgress` (userId, lessonId, status, startedAt?, completedAt?) — enum `LessonProgressStatus { NOT_STARTED, IN_PROGRESS, COMPLETED }`, default NOT_STARTED
- `TestResult` (userId, testId, attempt, startedAt, finishedAt?, score?, passed?) — hasMany UserAnswer
- `UserAnswer` (userId, questionId, answerId, testResultId)

Enum'ы Sequelize → нативные Prisma `enum`. Связи → Prisma relations с явными внешними ключами. Каскады (`onDelete: CASCADE` для UserProfile/Session) сохраняются.

### 4.3 Авторизация
- Эндпоинты: `POST /api/auth/register|login|refresh|logout`, `GET /api/auth/me`
- bcrypt для паролей; access-JWT + refresh-JWT; SHA-256-хэш refresh-токена хранится в `Session`; ротация refresh при `/refresh`
- `JwtAuthGuard` (Passport `jwt`-стратегия) защищает роуты
- `RolesGuard` + `@Roles('TEACHER')` декоратор заменяют `roleMiddleware`
- Глобальный `ValidationPipe` + DTO заменяют ручную валидацию

### 4.4 Прочее
- Загрузка файлов (аватары/видео): NestJS `FileInterceptor` (multer внутри); раздача статики из `/public`
- Глобальный `ExceptionFilter` заменяет `handlerError`; формат ошибок (`ApiError`) сохраняется
- CORS на origin Next.js; cookies через встроенные средства

## 5. Frontend (Next.js + TS)

### 5.1 Данные и состояние
- RSC грузят начальные данные на сервере (список курсов, страница курса) — запрос к NestJS API с токеном из сессии Auth.js
- TanStack Query — клиентские запросы, кэш, мутации (запись на курс, прохождение теста, редактор курса); заменяет все Redux slices/thunks
- Тонкий типизированный API-слой `src/lib/api/*`; токен подставляется из сессии
- Локальный UI-стейт — `useState`/`useReducer`; формы — react-hook-form + zod

### 5.2 Авторизация (Auth.js)
- `Credentials`-провайдер вызывает `POST /api/auth/login` NestJS, получает access+refresh
- Стратегия сессии — JWT: токены бэкенда внутри Auth.js-сессии (httpOnly-cookie); `callbacks.jwt` обновляет access по refresh при истечении
- `middleware.ts` защищает приватные маршруты (редирект на `/login`)
- Роль в сессии → гейтинг преподавательских страниц (аналог `TeacherRoute`)

### 5.3 Страницы (перенос текущих)
Login, Register, Home, Profile, CoursePage, CourseManagementPage, CreateCoursePage, CourseBuilder (с LessonEditor/TestEditor и LessonViewer/TestViewer), + новый раздел `/chat`. Стили — существующие SCSS-модули.

## 6. Чат (новая фича)

### 6.1 Модель данных (3 новые таблицы)
- `Conversation` — `id`, `type` (enum `ConversationType { COURSE, DIRECT }`), `courseId?`, `createdAt`
- `ConversationParticipant` — `conversationId`, `userId` (уникальная пара `@@unique([conversationId, userId])`)
- `Message` — `id`, `conversationId`, `senderId`, `content`, `createdAt`, `readAt?`

### 6.2 Логика
- Комната курса (`type=COURSE`): одна на курс, участники = преподаватель + студенты со статусом `ACTIVE`; создаётся лениво при первом открытии; участники синхронизируются с enrollment'ами
- Личка (`type=DIRECT`): беседа на двух пользователей; создаётся при первом сообщении либо находится существующая

### 6.3 Backend — ChatModule
- REST: `GET /api/chat/conversations`, `GET /api/chat/conversations/:id/messages?cursor=...` (cursor-пагинация), `POST /api/chat/conversations/direct`
- `ChatGateway` (`@WebSocketGateway`, Socket.io):
  - аутентификация сокета по JWT (аналог `socketAuth`), токен из сессии
  - события: `joinConversation`, `sendMessage`, `message` (broadcast), `typing`, `messageRead`
  - сообщение сохраняется в БД, затем рассылается участникам комнаты (`room = conversation:<id>`)
  - проверка доступа: пользователь — участник беседы (для курса: ACTIVE-enrollment или преподаватель)

### 6.4 Frontend
- Раздел `/chat`: список бесед слева, окно сообщений справа
- Socket.io-клиент в провайдере (`src/lib/socket`), подключение с токеном сессии
- История — TanStack Query (REST); живые сообщения добавляются из сокет-событий в кэш Query
- Точки входа: «Чат курса» на странице курса, «Написать» в профиле → личка

## 7. Этапность выполнения

Каждый этап завершается проверяемым рабочим состоянием.

- **Этап 0 — Подготовка:** перенос текущих `backend/`+`frontend/` в `legacy/`; чистые скелеты NestJS и Next.js+TS.
- **Этап 1 — БД и Prisma:** `schema.prisma` (16 таблиц), `prisma migrate`, `seed.ts` (преподаватель/студенты/курс). Проверка: миграция применяется, seed наполняет БД.
- **Этап 2 — Backend core:** PrismaModule, AuthModule (JWT+refresh+guards), UsersModule; затем Courses, Sections, Lessons, Tests, Enrollments, Progress с идентичным REST-контрактом. Проверка: ключевые эндпоинты отвечают как старый API.
- **Этап 3 — Frontend core:** App Router, Auth.js (login/register/защита), layout, Header/Footer; перенос страниц; данные через RSC + TanStack Query; формы react-hook-form+zod. Проверка: поток регистрация → курс → запись → урок/тест.
- **Этап 4 — Чат:** ChatModule + ChatGateway (комнаты + личка); фронт-раздел `/chat`, socket-клиент, история + live. Проверка: два пользователя обмениваются сообщениями в комнате курса и в личке.
- **Этап 5 — Финал:** сверка фич со старым приложением; README с инструкцией запуска; решение по `legacy/` (оставить/удалить).

## 8. Вне скоупа

- Уведомления (NotificationController из оригинала)
- Автоматические тесты (unit/e2e)
- Monorepo-тулинг и общий пакет типов
- Сохранение существующих данных БД (пересоздаём с нуля)
