# Переклади інтерфейсу (next-intl)

Мови: **uk** (за замовчуванням, джерело правди), **en**, **pl**. Мова не входить в URL —
вона береться з cookie `NEXT_LOCALE` → `Accept-Language` → `uk` (`src/i18n/request.ts`).
Зареєстрований користувач має збережену мову в профілі (`UserProfile.locale`); після входу
вона має пріоритет (`src/i18n/LocaleSync.tsx`). Перемикач: `components/layout/LanguageSwitcher.tsx`.

## Файли

```
src/messages/<locale>/<namespace>.json   ← один файл на простір імен і мову
src/i18n/config.ts                       ← LOCALES, NAMESPACES, LOCALE_LABELS, INTL_LOCALE
src/i18n/global.d.ts                     ← типи: ключі з uk/*.json перевіряє tsc
src/i18n/format.ts                       ← useFormat, useLabels, useApiErrorMessage, useTestLabels, useDeadline
```

Простори імен і хто їх заповнює:
`common` `nav` `errors` `meta` `states` — спільні (готові);
`public` `auth` `catalog` `landing` — гість і вхід;
`dashboard` `course` `test` `assignment` `grades` `certificate` — навчання студента;
`profile` `checkout` `purchases` `notifications` `chat` `call` — акаунт;
`teacher` `builder` `manage` `gradebook` `admin` — викладач і адміністратор.
Новий простір імен: додайте його в `NAMESPACES` (`config.ts`) і в `global.d.ts`, створіть файли для всіх трьох мов.

## Правила

1. **Ключі**: `namespace` → секції → ключі в camelCase, наприклад `course.structure.title`,
   `checkout.form.cardNumber`. Ключ описує зміст, а не розташування (`submit`, а не `button2`).
2. **Спочатку `uk`**, потім ті самі ключі в `en` і `pl`. Перевірка: `npm run i18n:check`
   (порівнює набори ключів), `npx tsc --noEmit` (неіснуючий ключ — помилка компіляції).
3. **Українські тексти не змінювати**: значення в `uk/*.json` мають бути дослівно такими, як зараз
   в інтерфейсі — на них спираються e2e-селектори (`getByRole('button', { name: 'Увійти' })`).
4. **Не перекладаємо контент користувачів**: назви курсів, текст уроків, повідомлення чату, імена.
5. **Змінні й множина — лише ICU**, без склеювання рядків:
   ```json
   "lessons": "{count, plural, one {# урок} few {# уроки} many {# уроків} other {# уроку}}"
   "lessons": "{count, plural, one {# lesson} other {# lessons}}"
   "lessons": "{count, plural, one {# lekcja} few {# lekcje} many {# lekcji} other {# lekcji}}"
   ```
   uk і pl мають форми `one / few / many / other`, en — `one / other`.
   Розмітка всередині тексту: `t.rich('key', { b: (chunks) => <strong>{chunks}</strong> })`.
6. **Використання**:
   - клієнтський або синхронний серверний компонент: `const t = useTranslations('course');` → `t('structure.title')`;
   - async серверний компонент / `generateMetadata`: `const t = await getTranslations('course');`;
   - тексти для `aria-label`, `title`, `placeholder`, тостів і `alt` теж перекладаються.
7. **Форматування** — тільки через локаль:
   - `const f = useFormat();` → `f.date()`, `f.dateTime()`, `f.relative()`, `f.price()`, `f.number()`;
   - `const labels = useLabels();` → `labels.role(role)`, `labels.level(level)`, `labels.enrollment(status)`;
   - `const errorText = useApiErrorMessage();` → `toast(errorText(err), 'error')` (ключі в `errors`);
   - `useTestLabels()` (`Тест «X»`), `useDeadline()` (дедлайни завдань);
   - async серверний код: `formatDate(value, await getLocale())` з `lib/format.ts`.
   Старі `formatRelative`, `plural`, `ROLE_LABEL`, `LEVEL_LABEL`, `ENROLLMENT_LABEL`, `apiErrorMessage`,
   `testLabel`, `testShort`, `deadlineLabel` позначені `@deprecated` і повертають лише українську.
8. **Схеми валідації (zod)**: повідомлення — ключі, переклад у компоненті
   (`message: 'auth.errors.emailInvalid'` → `t(...)`), або схема будується всередині компонента з `t`.
9. **Тексти з бекенду** (сповіщення, листи) бекенд уже генерує мовою отримувача; на фронтенді їх не перекладати.
