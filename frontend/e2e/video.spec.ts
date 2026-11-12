import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Lesson video end to end: the teacher uploads an MP4 through the editor
 * (local chunked upload), the server transcodes it to HLS, a student plays
 * the protected stream, and unsigned playlist requests are refused.
 */

const PASSWORD = 'demo1234';
const VIDEO = path.join(__dirname, 'fixtures', 'video-720p.mp4');
const LESSON_TITLE = 'Вступне відео';

const state: { courseId: number; lessonId: number; student: { email: string; password: string } } =
  {} as never;

test.describe.configure({ mode: 'serial' });

test.beforeEach(({ page }) => failOnPageErrors(page));

test.beforeAll(async () => {
  if (!existsSync(VIDEO)) {
    // 3 s of 720p video with a tone: enough for two renditions and an audio track.
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=3',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', VIDEO,
    ]);
  }

  const teacher = await apiToken(USERS.teacher1);
  const form = new FormData();
  form.append('title', `E2E відео ${uid()}`);
  form.append('description', 'Курс для перевірки потокового відео');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacher}` },
    body: form,
  });
  if (!res.ok) throw new Error(`course: ${res.status} ${await res.text()}`);
  state.courseId = ((await res.json()) as { id: number }).id;
  const section = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Вступ' }),
  });
  const lesson = await api<{ id: number }>(`/lessons/${section.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: LESSON_TITLE, content: '<p>Подивіться відео.</p>' }),
  });
  state.lessonId = lesson.id;

  const email = `e2e-video-${uid()}@lms.local`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Студент', lastName: 'Відео' }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  state.student = { email, password: PASSWORD };
  await api(`/courses/${state.courseId}/enroll`, await apiToken(state.student), { method: 'POST' });
});

test('a student cannot start a video upload', async () => {
  const token = await apiToken(state.student);
  const res = await fetch(`${API_URL}/lessons/${state.lessonId}/video/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ size: 1024, mime: 'video/mp4', name: 'x.mp4' }),
  });
  expect(res.status).toBe(403);
});

test('teacher uploads a video and it is transcoded to HLS', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, USERS.teacher1, `/teacher/courses/${state.courseId}/builder`);
  const structure = page.getByRole('complementary', { name: 'Структура курсу' });
  await structure.getByRole('button', { name: LESSON_TITLE, exact: true }).click();
  await expect(page.getByLabel('Назва уроку')).toHaveValue(LESSON_TITLE);

  await page.getByRole('button', { name: 'Свій файл' }).click();
  const region = page.getByRole('region', { name: 'Завантаження відео уроку' });
  await expect(region.getByText(/Перетягніть відео сюди/)).toBeVisible();

  // Client-side validation rejects non-video files before any request.
  await page.getByTestId('video-file-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a video'),
  });
  await expect(page.getByText('Підтримуються лише відео MP4, WebM або MOV')).toBeVisible();

  const chunk = page.waitForRequest((r) => r.method() === 'PUT' && /\/videos\/uploads\/[a-f0-9]{32}\/chunks\/0$/.test(r.url()));
  await page.getByTestId('video-file-input').setInputFiles(VIDEO);
  await chunk;
  await expect(page.getByText('Відео завантажено, починається обробка').first()).toBeVisible({ timeout: 30_000 });
  await expect(region.getByText('Відео готове до перегляду')).toBeVisible({ timeout: 90_000 });
  await expect(region.getByText(/0:03 · якість: 720p, 360p/)).toBeVisible();
  await expect(region.locator('video')).toBeVisible();
  await expect(region.getByRole('button', { name: 'Замінити відео' })).toBeVisible();

  const lesson = await api<{ video: { status: string; hlsUrl: string; posterUrl: string } }>(
    `/lessons/${state.lessonId}/video`,
    await apiToken(USERS.teacher1),
  );
  expect(lesson.video.status).toBe('READY');
  expect(lesson.video.hlsUrl).toMatch(/\/files\/hls\/\d+\/master\.m3u8\?u=\d+&exp=\d+&sig=/);
  expect(lesson.video.posterUrl).toMatch(/\/files\/hls\/\d+\/poster\.jpg\?/);
});

test('student plays the protected HLS stream', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, state.student);
  const master = page.waitForRequest((r) => /\/files\/hls\/\d+\/master\.m3u8\?u=\d+&exp=\d+&sig=/.test(r.url()));
  const segment = page.waitForResponse((r) => /\/files\/hls\/\d+\/\d+p_\d+\.ts\?u=/.test(r.url()) && r.status() === 200);
  await page.goto(`/courses/${state.courseId}?lesson=${state.lessonId}`);
  await expect(page.getByRole('heading', { level: 1, name: LESSON_TITLE })).toBeVisible();
  const masterUrl = (await master).url();
  await segment;

  const video = page.getByLabel(`Відео уроку «${LESSON_TITLE}»`);
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('poster', /\/poster\.jpg\?u=/);
  await page.waitForFunction(
    () => (document.querySelector<HTMLVideoElement>('article video')?.readyState ?? 0) >= 2,
    undefined,
    { timeout: 30_000 },
  );

  // Quality selector: Auto + both renditions, keyboard-operable <select>.
  const quality = page.getByLabel('Якість');
  await expect(quality.locator('option')).toHaveText(['Авто', '720p', '360p']);
  await quality.selectOption({ label: '360p' });
  await expect(quality).toHaveValue(/^[01]$/);

  // The playlist is rewritten so each variant URI carries the signature.
  const text = await (await page.request.get(masterUrl)).text();
  expect(text).toMatch(/^720p\.m3u8\?u=\d+&exp=\d+&sig=[\w-]+$/m);
  expect(text).toMatch(/^360p\.m3u8\?u=\d+&exp=\d+&sig=[\w-]+$/m);

  // Without the signature (or with a forged one) the stream is refused.
  expect((await page.request.get(masterUrl.split('?')[0])).status()).toBe(401);
  expect((await page.request.get(masterUrl.replace(/sig=[^&]+/, 'sig=forged'))).status()).toBe(401);
});

test('a non-enrolled user cannot open the stream', async () => {
  const teacher = await apiToken(USERS.teacher1);
  const { video } = await api<{ video: { id: number } }>(`/lessons/${state.lessonId}/video`, teacher);
  const outsider = await apiToken(USERS.teacher2);
  const res = await fetch(`${API_URL}/files/hls/${video.id}/master.m3u8`, {
    headers: { Authorization: `Bearer ${outsider}` },
  });
  expect(res.status).toBe(403);
});
