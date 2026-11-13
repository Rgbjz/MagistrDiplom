/**
 * Production QA harness. Every phase script attaches over CDP to ONE
 * long-lived visible Chrome (started with --remote-debugging-port=9333), so the
 * window never closes or resizes between phases. Findings accumulate in
 * qa/artifacts/prod/findings.json; screenshots go next to it.
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const BASE = process.env.QA_BASE_URL ?? 'https://magistr-lms.vercel.app';
export const API = process.env.QA_API_URL ?? 'https://lms-backend-z43s.onrender.com/api';
export const OUT = path.join(__dirname, '..', 'artifacts', 'prod');
mkdirSync(OUT, { recursive: true });
const FINDINGS = path.join(OUT, 'findings.json');
const STATE = path.join(OUT, 'state.json');

export type Severity = 'critical' | 'major' | 'minor' | 'cosmetic' | 'info';
export interface Finding {
  phase: string;
  screen: string;
  kind: string;
  severity: Severity;
  detail: string;
  screenshot?: string;
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shared state between phases (QA accounts, course id…). */
export function state<T = Record<string, unknown>>(): T {
  return (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}) as T;
}
export function saveState(patch: Record<string, unknown>) {
  writeFileSync(STATE, JSON.stringify({ ...state(), ...patch }, null, 2));
}

export class Phase {
  browser!: Browser;
  ctx!: BrowserContext;
  page!: Page;
  private shot = 0;
  private run = Date.now().toString(36).slice(-4);

  constructor(public name: string) {}

  async attach() {
    this.browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
    this.ctx = this.browser.contexts()[0];
    // Use the site tab; close stray blank tabs so there is exactly one window/tab.
    const pages = this.ctx.pages();
    this.page = pages.find((pg) => pg.url().startsWith('http')) ?? pages[0] ?? (await this.ctx.newPage());
    for (const pg of pages) if (pg !== this.page) await pg.close().catch(() => undefined);
    await this.page.bringToFront();
    this.page.setDefaultTimeout(30_000);
    const tag = () => new URL(this.page.url()).pathname;
    this.page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Expected 404s on purpose-built "not found" checks are noise.
      if (/status of 404/.test(t) && /does-not-exist|999999/.test(this.page.url())) return;
      this.add(tag(), 'console', 'minor', `${t.slice(0, 260)} @ ${this.page.url()}`);
    });
    this.page.on('pageerror', (e) => this.add(tag(), 'pageerror', 'major', `${e.message.slice(0, 260)} @ ${this.page.url()}`));
    this.page.on('response', (r) => {
      if (r.status() >= 500) this.add(tag(), 'http', 'major', `${r.status()} ${r.request().method()} ${r.url()}`);
    });
    return this.page;
  }

  add(screen: string, kind: string, severity: Severity, detail: string, screenshot?: string) {
    const all: Finding[] = existsSync(FINDINGS) ? JSON.parse(readFileSync(FINDINGS, 'utf8')) : [];
    all.push({ phase: this.name, screen, kind, severity, detail, screenshot });
    writeFileSync(FINDINGS, JSON.stringify(all, null, 2));
    console.log(`[${this.name}] ${severity.toUpperCase()} ${kind} ${screen}: ${detail}`);
  }

  /** Screenshot + automatic checks (overflow, raw i18n keys, broken images, axe). */
  async snap(screen: string, opts: { axe?: boolean; full?: boolean } = {}) {
    const p = this.page;
    await p.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await p
      .waitForFunction(() => !document.querySelector('[class*="Skeleton-module"]'), undefined, { timeout: 15_000 })
      .catch(() => this.add(screen, 'loading', 'minor', `still loading after 15 s at ${p.url()}`));
    const file = path.join(OUT, `${this.name}-${this.run}-${String(++this.shot).padStart(3, '0')}-${screen}.png`);
    await p.screenshot({ path: file, fullPage: opts.full ?? true });
    const checks = await p.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const text = document.body.innerText;
      const keys = [...new Set(text.match(/\b[a-z]+(?:\.[a-zA-Z0-9]+){2,}\b/g) ?? [])].filter(
        (h) => !/\.(com|local|test|ua|pl|org|net|io|app|live|ca|tsx?|js|json|md|css|png|jpg|pdf|mp4|html|htm)$/.test(h),
      );
      const broken = [...document.images]
        .filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:'))
        .map((i) => i.src.slice(0, 120));
      return { overflow, keys, broken };
    });
    if (checks.overflow > 2) this.add(screen, 'overflow', 'minor', `horizontal overflow ${checks.overflow}px at ${p.url()}`, file);
    if (checks.keys.length) this.add(screen, 'i18n', 'minor', `possible raw keys: ${checks.keys.slice(0, 6).join(', ')}`, file);
    if (checks.broken.length) this.add(screen, 'image', 'minor', `broken images: ${checks.broken.slice(0, 3).join(' | ')}`, file);
    if (opts.axe !== false) {
      try {
        const res = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).analyze();
        for (const v of res.violations) {
          const sev: Severity = v.impact === 'critical' || v.impact === 'serious' ? 'minor' : 'cosmetic';
          this.add(screen, 'axe', sev, `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help} — ${v.nodes[0]?.target.join(' ')}`, file);
        }
      } catch (e) {
        this.add(screen, 'axe', 'info', `axe failed: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    return file;
  }

  /** One QA step; failures are recorded and the run continues. */
  async step(name: string, fn: () => Promise<void>) {
    console.log(`→ ${this.name}: ${name}`);
    try {
      await fn();
    } catch (e) {
      let shot: string | undefined;
      try {
        shot = await this.snap(`FAIL-${name}`, { axe: false, full: false });
      } catch {
        /* ignore */
      }
      this.add(name, 'step', 'major', `step failed: ${(e as Error).message.split('\n')[0].slice(0, 280)}`, shot);
    }
  }

  async done() {
    // Disconnect only: the visible window stays open for the next phase.
    await this.browser.close().catch(() => undefined);
  }
}

// ── API helpers ───────────────────────────────────────────────────────────

let lastLogin = 0;
/** Auth endpoints allow ~10 requests/min per IP in production: keep ≥7 s apart. */
export async function paceLogin() {
  const wait = lastLoginFromState() + 7000 - Date.now();
  if (wait > 0) await pause(wait);
  lastLogin = Date.now();
  saveState({ lastLogin });
}
function lastLoginFromState() {
  return Math.max(lastLogin, (state() as { lastLogin?: number }).lastLogin ?? 0);
}

export async function api<T>(p: string, token?: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${p}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${p} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function token(email: string, password: string) {
  await paceLogin();
  return (await api<{ accessToken: string }>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })).accessToken;
}

/** Registers + confirms a QA account (prod has no SMTP, so the API returns the token). */
export async function qaUser(tag: string, role: 'STUDENT' | 'TEACHER', firstName: string, lastName: string) {
  const email = `qa-${tag}-${Date.now().toString(36)}@qa.local`;
  const password = 'qaPass1234';
  await paceLogin();
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password, role, firstName, lastName, locale: 'uk' }),
  });
  if (!reg.confirmToken) throw new Error('no confirmToken (SMTP configured?)');
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  return { email, password, name: `${firstName} ${lastName}` };
}

/** Signs in through the UI on the visible page (clears the previous session first). */
export async function uiLogin(ph: Phase, email: string, password: string, next = '/') {
  const p = ph.page;
  await ph.ctx.clearCookies();
  await paceLogin();
  await p.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await p.locator('input[type=email]').fill(email);
  await p.locator('input[autocomplete="current-password"]').fill(password);
  await p.locator('button[type=submit]').click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}
