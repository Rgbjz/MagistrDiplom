import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { API, QA } from './harness';

export const FIX = path.join(__dirname, 'artifacts', 'fixtures');
export const STATE_FILE = path.join(__dirname, 'artifacts', 'state-teacher.json');

export function fixtures() {
  mkdirSync(FIX, { recursive: true });
  const f = {
    video: path.join(FIX, 'qa-lesson.mp4'),
    cover: path.join(FIX, 'qa-cover.png'),
    notes: path.join(FIX, 'Конспект заняття QA.md'),
    pdf: path.join(FIX, 'qa-slides.pdf'),
    evil: path.join(FIX, 'qa-evil.html'),
    gift: path.join(__dirname, '..', 'e2e', 'fixtures', 'question-bank.gift'),
  };
  if (!existsSync(f.video)) {
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f.video,
    ]);
  }
  if (!existsSync(f.cover)) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', f.cover]);
  }
  writeFileSync(f.notes, '# Конспект\n\n- Flexbox — одна вісь\n- Grid — дві осі\n');
  writeFileSync(f.pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  writeFileSync(f.evil, '<script>alert(1)</script>\n');
  return f;
}

/** Runs one QA step; a failure is logged as a bug with a screenshot instead of aborting. */
export async function step(qa: QA, page: Page, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`[${qa.area}] ✓ ${name}`);
    return true;
  } catch (e) {
    const file = path.join(qa.outDir, `FAIL-${name.replace(/[^\w-]+/g, '_').slice(0, 60)}.png`);
    await page.screenshot({ path: file, fullPage: true, scale: 'css' }).catch(() => undefined);
    qa.add(name, 'bug', 'major', `step failed: ${(e as Error).message.split('\n')[0].slice(0, 400)}`, file);
    return false;
  }
}

export async function apiToken(email: string, password: string) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

export async function api<T>(p: string, token?: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${p}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${p}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}

export function saveState(data: Record<string, unknown>) {
  let cur: Record<string, unknown> = {};
  if (existsSync(STATE_FILE)) cur = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  writeFileSync(STATE_FILE, JSON.stringify({ ...cur, ...data }, null, 2));
}

export function loadState(): Record<string, any> {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
}

export const pause = (page: Page, ms = 600) => page.waitForTimeout(ms);
