import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { api, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Video calls between two real browser contexts. Chrome's fake media devices
 * stand in for a camera/microphone, so the remote <video> really decodes frames.
 */
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

const PASSWORD = 'demo1234';

async function freshStudent(tag: string) {
  const email = `e2e-call-${tag}-${uid()}@lms.local`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Дзвінок', lastName: tag }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, {
    method: 'POST',
    body: JSON.stringify({ token: reg.confirmToken }),
  });
  const user = { email, password: PASSWORD };
  const me = await api<{ id: number }>('/users/me', await apiToken(user));
  return { ...user, id: me.id };
}

/** Direct conversation teacher1 ↔ a fresh student. */
async function directConversation(studentId: number): Promise<number> {
  const token = await apiToken(USERS.teacher1);
  const c = await api<{ id: number }>('/chat/conversations/direct', token, {
    method: 'POST',
    body: JSON.stringify({ userId: studentId }),
  });
  return c.id;
}

async function openPair(browser: Browser) {
  const teacherCtx = await browser.newContext();
  const studentCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  const student = await studentCtx.newPage();
  failOnPageErrors(teacher);
  failOnPageErrors(student);
  return { teacherCtx, studentCtx, teacher, student };
}

/** Waits until a remote participant's video actually renders frames. */
async function expectRemoteVideo(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const v = document.querySelector<HTMLVideoElement>('video[data-peer]');
          return v ? v.videoWidth : 0;
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
}

async function closeAll(...contexts: BrowserContext[]) {
  for (const c of contexts) await c.close();
}

test('direct video call: ring, accept, media flows, mute indicator, hang up', async ({ browser }) => {
  const studentUser = await freshStudent('accept');
  const conversationId = await directConversation(studentUser.id);
  const { teacherCtx, studentCtx, teacher, student } = await openPair(browser);

  await login(student, studentUser);
  await login(teacher, USERS.teacher1, `/chat?c=${conversationId}`);
  await expect(teacher).toHaveURL(new RegExp(`/chat\\?c=${conversationId}`));

  await teacher.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
  const teacherWindow = teacher.getByRole('dialog', { name: /Відеодзвінок/ });
  await expect(teacherWindow).toBeVisible();
  await expect(teacherWindow.getByText('Виклик… очікуємо відповіді')).toBeVisible();

  // The student is on the dashboard: the call rings app-wide.
  const ring = student.getByRole('alertdialog');
  await expect(ring).toBeVisible({ timeout: 10_000 });
  await expect(ring).toContainText('Ірина Мельник');
  await ring.getByRole('button', { name: 'Прийняти' }).click();

  const studentWindow = student.getByRole('dialog', { name: /Відеодзвінок/ });
  await expect(studentWindow).toBeVisible();
  await expectRemoteVideo(teacher);
  await expectRemoteVideo(student);

  // The call timer runs on both sides.
  const timer = teacherWindow.getByRole('timer', { name: 'Тривалість дзвінка' });
  await expect(timer).toBeVisible();
  const first = await timer.textContent();
  await expect.poll(() => timer.textContent(), { timeout: 5_000 }).not.toBe(first);
  await expect(studentWindow.getByRole('timer')).toBeVisible();

  // Muting the teacher's microphone shows up on the student's tile.
  await teacherWindow.getByRole('button', { name: 'Вимкнути мікрофон' }).click();
  await expect(teacherWindow.getByRole('button', { name: 'Вимкнути мікрофон' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const teacherTile = studentWindow.getByRole('figure', { name: /Відео: Ірина Мельник/ });
  await expect(teacherTile.getByRole('img', { name: 'Мікрофон вимкнено' })).toBeVisible();

  // Hanging up closes both windows and logs the call in the chat.
  await teacherWindow.getByRole('button', { name: 'Завершити дзвінок' }).click();
  await expect(teacherWindow).toBeHidden();
  await expect(studentWindow).toBeHidden({ timeout: 10_000 });
  const thread = teacher.getByRole('region', { name: /Розмова:/ });
  await expect(
    thread.locator('[aria-live="polite"]').getByText(/Відеодзвінок завершено · \d\d:\d\d/),
  ).toBeVisible({ timeout: 10_000 });

  await closeAll(teacherCtx, studentCtx);
});

test('declined call closes the caller window and is logged', async ({ browser }) => {
  const studentUser = await freshStudent('decline');
  const conversationId = await directConversation(studentUser.id);
  const { teacherCtx, studentCtx, teacher, student } = await openPair(browser);

  await login(student, studentUser);
  await login(teacher, USERS.teacher1, `/chat?c=${conversationId}`);

  await teacher.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
  const teacherWindow = teacher.getByRole('dialog', { name: /Відеодзвінок/ });
  await expect(teacherWindow).toBeVisible();

  const ring = student.getByRole('alertdialog');
  await expect(ring).toBeVisible({ timeout: 10_000 });
  await ring.getByRole('button', { name: 'Відхилити' }).click();
  await expect(ring).toBeHidden();

  await expect(teacher.getByText('Співрозмовник відхилив дзвінок')).toBeVisible();
  await expect(teacherWindow).toBeHidden({ timeout: 10_000 });
  const thread = teacher.getByRole('region', { name: /Розмова:/ });
  await expect(thread.locator('[aria-live="polite"]').getByText('Відеодзвінок відхилено')).toBeVisible({
    timeout: 10_000,
  });

  await closeAll(teacherCtx, studentCtx);
});

test('a student sees the ongoing call banner and can join it', async ({ browser }) => {
  const studentUser = await freshStudent('banner');
  const conversationId = await directConversation(studentUser.id);
  const { teacherCtx, studentCtx, teacher, student } = await openPair(browser);

  await login(student, studentUser, `/chat?c=${conversationId}`);
  await login(teacher, USERS.teacher1, `/chat?c=${conversationId}`);

  await teacher.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
  await expect(teacher.getByRole('dialog', { name: /Відеодзвінок/ })).toBeVisible();

  // Ignore the ringing dialog and use the banner in the open chat instead.
  await expect(student.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
  const join = student.getByRole('button', { name: 'Приєднатися до дзвінка' });
  await expect(join).toBeVisible({ timeout: 20_000 });
  await join.click();

  await expect(student.getByRole('dialog', { name: /Відеодзвінок/ })).toBeVisible();
  await expectRemoteVideo(student);
  await expectRemoteVideo(teacher);

  await student.getByRole('button', { name: 'Завершити дзвінок' }).click();
  await expect(teacher.getByRole('dialog', { name: /Відеодзвінок/ })).toBeHidden({ timeout: 10_000 });

  await closeAll(teacherCtx, studentCtx);
});

test('camera turned on mid-call after an audio-only start reaches the other side', async ({ browser }) => {
  const studentUser = await freshStudent('latecam');
  const conversationId = await directConversation(studentUser.id);
  const { teacherCtx, studentCtx, teacher, student } = await openPair(browser);

  // The student's camera is busy when the call starts: the first request
  // with video fails, later ones work.
  await student.addInitScript(() => {
    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    let failed = false;
    md.getUserMedia = (c?: MediaStreamConstraints) => {
      if (c?.video && !failed) {
        failed = true;
        return Promise.reject(new DOMException('busy', 'NotReadableError'));
      }
      return original(c);
    };
  });

  await login(student, studentUser);
  await login(teacher, USERS.teacher1, `/chat?c=${conversationId}`);
  await teacher.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
  const teacherWindow = teacher.getByRole('dialog', { name: /Відеодзвінок/ });

  const ring = student.getByRole('alertdialog');
  await expect(ring).toBeVisible({ timeout: 10_000 });
  await ring.getByRole('button', { name: 'Прийняти' }).click();
  const studentWindow = student.getByRole('dialog', { name: /Відеодзвінок/ });
  await expect(studentWindow).toBeVisible();
  await expect(student.getByText('Камера недоступна — ви в дзвінку лише з голосом')).toBeVisible();
  await expectRemoteVideo(student); // the teacher's camera works

  // The camera button is not dead: it asks again and starts sending video.
  const camera = studentWindow.getByRole('button', { name: 'Вимкнути камеру' });
  await expect(camera).toBeEnabled();
  await expect(camera).toHaveAttribute('aria-pressed', 'true');
  await camera.click();
  await expect(camera).toHaveAttribute('aria-pressed', 'false');
  await expectRemoteVideo(teacher);

  await teacherWindow.getByRole('button', { name: 'Завершити дзвінок' }).click();
  await closeAll(teacherCtx, studentCtx);
});
