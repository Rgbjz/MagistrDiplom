# Деплой: Vercel + Render + Neon

| Часть | Где | Что нужно |
|---|---|---|
| Фронтенд (Next.js) | **Vercel** | репозиторий на GitHub |
| Бэкенд (NestJS + чат на WebSocket) | **Render**, Docker, план Free | `render.yaml` в корне репозитория |
| База данных | **Neon** Postgres, план Free | строка подключения |
| Файлы (аватары, обложки) | **Vercel Blob** | токен `BLOB_READ_WRITE_TOKEN` |
| Почта | любой SMTP: **Resend** или Gmail | логин и пароль SMTP |
| Аналитика | **Google Analytics 4** | Measurement ID `G-…` |

Порядок важен: база → бэкенд → фронтенд, потому что каждому следующему нужен адрес предыдущего.

## 1. База данных (Neon)

1. На [neon.tech](https://neon.tech) создайте проект, регион Frankfurt (рядом с Render).
2. В **Connection Details** выключите *Pooled connection* и скопируйте **прямую** строку:
   `postgresql://…@ep-…eu-central-1.aws.neon.tech/neondb?sslmode=require`.
3. Загрузите демо-данные со своего компьютера:
   ```bash
   cd backend
   DATABASE_URL="<строка из Neon>" npx prisma migrate deploy
   DATABASE_URL="<строка из Neon>" npm run db:seed
   ```
   Seed можно запускать повторно: он пересоздаёт только демо-аккаунты и демо-курсы.
   Миграции при каждом деплое бэкенда применяются автоматически, а seed — нет.

## 2. Файлы (Vercel Blob)

Vercel → **Storage** → **Create** → **Blob** → скопируйте `BLOB_READ_WRITE_TOKEN`.
Без токена бэкенд сохраняет файлы на диск. На Render диск временный, поэтому в продакшене токен обязателен.
В Blob попадают аватары, обложки, файлы уроков (до 25 МБ) и видео уроков (MP4/WebM/MOV, до 2 ГБ) вместе с их HLS-версиями.

Видео браузер загружает **напрямую в Blob** (client upload), минуя API. Токен выдаёт `POST /api/lessons/:id/video/upload-token`;
после загрузки фронтенд сам вызывает `POST /api/lessons/:id/video/complete`, поэтому колбэк Blob (`onUploadCompleted`)
не обязателен. Чтобы колбэк тоже работал, у бэкенда должен быть публичный `API_PUBLIC_URL` (Blob вызывает
`<API_PUBLIC_URL>/lessons/:id/video/upload-token`); на `localhost` колбэк не доходит — это нормально.
Загрузка проходит через память бэкенда, а на плане Render Free её 512 МБ, поэтому большие видео лучше выкладывать на YouTube и вставлять ссылкой.

## 3. Почта (SMTP)

- **Resend** (рекомендуется): добавьте и подтвердите свой домен, создайте API-ключ.
  `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=resend`, `SMTP_PASS=<API-ключ>`,
  `MAIL_FROM="LMS <no-reply@ваш-домен>"`.
- **Gmail**: включите двухфакторную аутентификацию, создайте *пароль приложения* (16 символов).
  `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=<адрес>@gmail.com`, `SMTP_PASS=<пароль приложения>`.

Если `SMTP_HOST` пустой, это режим разработки: письма только пишутся в лог, а на экранах подтверждения появляется кнопка «Підтвердити (демо)».

## 4. Бэкенд (Render)

1. [render.com](https://render.com) → **New** → **Blueprint** → выберите репозиторий; Render прочитает `render.yaml`.
2. Заполните переменные, отмеченные `sync: false`:
   - `DATABASE_URL` — строка из Neon;
   - `FRONTEND_URL` и `APP_URL` — адрес фронтенда на Vercel (например `https://lms-diploma.vercel.app`).
     Пока его нет, временно поставьте `http://localhost:3000` и обновите после шага 5.
     В `FRONTEND_URL` можно перечислить несколько адресов через запятую;
   - `SMTP_*` и `MAIL_FROM` — из шага 3;
   - `BLOB_READ_WRITE_TOKEN` — из шага 2.
   - `API_PUBLIC_URL` — адрес самого API, например `https://<service>.onrender.com/api`: из него строятся подписанные ссылки на файлы уроков, загруженные видео и сданные работы.
   `FILES_SIGNING_SECRET` Render сгенерирует сам. `THROTTLE_LIMIT` / `THROTTLE_AUTH_LIMIT` менять не нужно (по умолчанию 300 и 10 запросов в минуту с одного IP).
   `JWT_*_SECRET` Render сгенерирует сам.
3. После деплоя проверьте `https://<service>.onrender.com/api/health` → `{"status":"ok","db":true}`.

На плане Free сервис засыпает после 15 минут без запросов, и первый запрос будит его около 30–60 секунд.
На странице входа в это время показывается «Сервер прокидається…».

## 4a. Redis і фонові задачі

Redis потрібен, щоб бекенд міг працювати в кількох екземплярах. Без `REDIS_URL` усе працює в одному екземплярі: стан чатів і дзвінків, лічильники обмеження запитів і фонові задачі живуть у памʼяті процесу.

- **Render:** `render.yaml` створює безкоштовний Key Value (`lms-redis`, сумісний із Redis) і сам підставляє `REDIS_URL` у бекенд. Політика `noeviction` обовʼязкова: BullMQ не повинен втрачати ключі задач.
- **Upstash** (альтернатива, безкоштовний тариф): створіть базу Redis, скопіюйте адресу `rediss://…` у `REDIS_URL` бекенду, а блок `keyvalue` із `render.yaml` видаліть.
- **Що переходить у Redis:** кімнати Socket.IO (повідомлення й дзвінки доходять до користувачів на будь-якому екземплярі), стан відеодзвінків, лічильники обмеження запитів, обмеження листів про нові повідомлення, черги BullMQ.
- **Фоновий воркер:** за замовчуванням задачі обробляє сам бекенд (`WORKER_ENABLED=true`). Для диплома цього достатньо. Для важких задач (наприклад, перекодування відео) можна запустити окремий Background Worker на Render з командою `node dist/src/worker.js` і поставити бекенду `WORKER_ENABLED=false`. Таймаути дзвінків усе одно обробляє бекенд, бо їм потрібні його сокети.
- **Нагадування про дедлайни** (за 24 год і за 1 год) — відкладені задачі черги `reminders`. Для надійності потрібен Redis: без нього задачі тримаються в памʼяті процесу й губляться при перезапуску (бекенд відновлює їх під час старту та кожні 6 год, тож нагадування може запізнитися). Обробляються в API-екземплярах навіть із `WORKER_ENABLED=false`. Підпис посилань на iCal-підписку — `CALENDAR_SECRET` (необовʼязково; за замовчуванням `FILES_SIGNING_SECRET`); його зміна робить недійсними всі видані посилання.
- **Перевірка:** `GET /api/health` повертає `"redis": true`.

## 4b. Відео: ffmpeg і перекодування в HLS

- Завантажене відео перекодовується в HLS (720p + 360p, сегменти 6 с, постер) задачею черги `video`. Потрібен `ffmpeg`:
  у `backend/Dockerfile` він уже встановлюється (`apt-get install ffmpeg`); для нативного запуску — `brew install ffmpeg` /
  `apt install ffmpeg`, або шлях у `FFMPEG_PATH`.
- Задачі виконуються по одній (concurrency 1). На безкоштовному Render (0.1 CPU, 512 МБ) хвилина відео 720p перекодовується
  кілька хвилин, а API в цей час відповідає повільніше. Для довших відео краще окремий Background Worker
  (`node dist/src/worker.js`, той самий образ, ті самі змінні, включно з `BLOB_READ_WRITE_TOKEN`) і `WORKER_ENABLED=false`
  у бекенда, або посилання YouTube/Vimeo.
- Без Blob відео й HLS лежать у `backend/private/` (не роздаються статично; лише через `/api/files/hls/...` з підписом).
  Диск Render ефемерний, а воркер в окремому сервісі не бачить диска API — у продакшені потрібен Blob.
- `VIDEO_RECONCILE=false` вимикає перевірку при старті (повторна постановка задач, що «зависли» в PROCESSING, і перекодування
  старих MP4 у HLS).

## 5. Фронтенд (Vercel)

1. Vercel → **Add New Project** → импортируйте репозиторий → **Root Directory** = `frontend`.
   Framework определится как Next.js сам.
2. **Environment Variables** (для Production и Preview):
   | Переменная | Значение |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<service>.onrender.com/api` |
   | `NEXT_PUBLIC_APP_URL` | `https://<project>.vercel.app` (или свой домен) |
   | `AUTH_SECRET` | результат `npx auth secret` |
   | `AUTH_TRUST_HOST` | `true` |
   | `NEXT_PUBLIC_GA_ID` | `G-XXXXXXXXXX` (пусто — без аналитики) |
3. **Deploy**. Затем вернитесь в Render и укажите реальный адрес в `FRONTEND_URL` и `APP_URL`.
   Render передеплоит сервис сам.

### Відеодзвінки (TURN)

Відеодзвінки працюють напряму між браузерами (WebRTC), бекенд лише передає сигнальні повідомлення.
Публічного STUN-сервера Google достатньо, коли хоча б один учасник має «звичайну» мережу.
У мобільних мережах і корпоративному Wi-Fi зі строгим NAT пряме з'єднання неможливе — потрібен TURN-ретранслятор
(власний coturn або сервіс на кшталт Metered/Twilio). Його задають у Vercel змінними
`NEXT_PUBLIC_TURN_URL` (кілька адрес через кому), `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`.
Без TURN такі дзвінки залишаться в стані «Немає зʼєднання». Стан дзвінків зберігається в пам'яті бекенду,
тому бекенд має працювати в одному екземплярі (на плані Render Free так і є; при масштабуванні знадобиться Redis-адаптер Socket.IO і спільне сховище стану дзвінків).

## 6. Google Analytics 4

1. [analytics.google.com](https://analytics.google.com) → **Admin** → **Create property** → **Web stream** с адресом сайта.
2. Скопируйте **Measurement ID** (`G-…`) в `NEXT_PUBLIC_GA_ID` на Vercel и передеплойте.
3. Данные собираются только после того, как посетитель нажмёт «Прийняти» в баннере cookie (Consent Mode v2).
   Отправляемые события: `page_view`, `sign_up`, `login`, `search`, `view_item`, `generate_lead`,
   `begin_checkout`, `purchase`, `test_complete`, `certificate_issued`.
   Проверять удобно в **Reports → Realtime** или в **DebugView**.

## Демо-аккаунты (после seed)

| Роль | Email | Пароль |
|---|---|---|
| Студент (основной) | `student@lms.local` | `demo1234` |
| Студенты | `student2@lms.local` … `student11@lms.local` | `demo1234` |
| Викладач | `teacher1@lms.local` (веб, SQL, UX) | `demo1234` |
| Викладач | `teacher2@lms.local` (TypeScript, Git, англійська) | `demo1234` |
| Адміністратор | `admin@lms.local` | `admin123` |

Перед публичным показом смените пароль администратора или удалите демо-аккаунты.

## Локальный запуск

PostgreSQL і Redis для розробки: `docker compose up -d` у корені репозиторію (Postgres на 5432, Redis на 6379), потім у `backend/.env`: `DATABASE_URL=postgresql://lms:lms@localhost:5432/lms` і `REDIS_URL=redis://localhost:6379`.

```bash
# backend/.env и frontend/.env.local — по образцу .env.example
cd backend && npx prisma migrate deploy && npm run db:seed && npm run start:dev
cd frontend && npm run dev
```
