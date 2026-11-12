/**
 * Visible exploratory QA harness. Opens one headed Chrome window over the whole
 * screen (1440×780 viewport), slows actions
 * down so a person can follow them, and records findings per screen:
 * console errors, failed requests, axe violations, horizontal overflow,
 * untranslated message keys. Run a scenario with:
 *   npx tsx qa/<area>.qa.ts
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const BASE = process.env.QA_BASE_URL ?? 'http://localhost:3055';
export const API = process.env.QA_API_URL ?? 'http://localhost:5055/api';

/** One visible window covering the whole 1440×900 screen (left/right kept for old scripts). */
export type Quadrant = 'full' | 'left' | 'right';
const POS: Record<Quadrant, [number, number]> = {
  full: [0, 0],
  left: [0, 0],
  right: [0, 0],
};

export interface Finding {
  area: string;
  screen: string;
  kind: 'console' | 'request' | 'axe' | 'overflow' | 'i18n' | 'bug' | 'note';
  severity: 'critical' | 'major' | 'minor' | 'info';
  detail: string;
  screenshot?: string;
}

export class QA {
  browser!: Browser;
  findings: Finding[] = [];
  outDir: string;
  private shotNo = 0;
  private broughtToFront = false;

  constructor(
    public area: string,
    private quadrant: Quadrant,
    private slowMo = Number(process.env.QA_SLOWMO ?? 250),
  ) {
    this.outDir = path.join(__dirname, 'artifacts', area);
    mkdirSync(this.outDir, { recursive: true });
  }

  async start() {
    const [x, y] = POS[this.quadrant];
    this.browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      slowMo: this.slowMo,
      args: [
        `--window-position=${x},${y}`,
        '--window-size=1440,900',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    });
  }

  /**
   * Playwright's Chrome can open behind the terminal; bring the newest
   * automation Chrome process to the front so the user sees the run.
   */
  bringWindowToFront() {
    execFile('pgrep', ['-n', '-f', 'remote-debugging-pipe'], (err, out) => {
      const pid = out?.trim();
      if (err || !pid) return;
      execFile('osascript', [
        '-e',
        `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`,
      ]);
    });
  }

  /** Desktop context (1440×780 CSS px in the full-screen window) or a phone. */
  async context(opts: { mobile?: boolean; locale?: 'uk' | 'en' | 'pl'; dark?: boolean } = {}) {
    const ctx = await this.browser.newContext({
      // Full desktop layout shrunk to fit a quarter of the screen.
      viewport: opts.mobile ? { width: 390, height: 760 } : { width: 1440, height: 780 },
      deviceScaleFactor: 1,
      isMobile: opts.mobile,
      hasTouch: opts.mobile,
      permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
      acceptDownloads: true,
    });
    if (opts.locale) {
      await ctx.addCookies([{ name: 'NEXT_LOCALE', value: opts.locale, url: BASE }]);
    }
    if (opts.dark !== undefined) {
      await ctx.addInitScript((d) => {
        try {
          localStorage.setItem('theme', d ? 'dark' : 'light');
        } catch {
          /* ignore */
        }
      }, opts.dark);
    }
    return ctx;
  }

  /** New page that records console errors and failed requests as findings. */
  async page(ctx: BrowserContext, screenTag = 'page') {
    const page = await ctx.newPage();
    if (!this.broughtToFront) {
      this.broughtToFront = true;
      this.bringWindowToFront();
    }
    page.on('console', (m) => {
      if (m.type() === 'error') {
        this.add(screenTag, 'console', 'major', `${m.text().slice(0, 300)} @ ${page.url()}`);
      }
    });
    page.on('pageerror', (e) => this.add(screenTag, 'console', 'critical', `pageerror: ${e.message} @ ${page.url()}`));
    page.on('response', (r) => {
      const s = r.status();
      if (s >= 500) this.add(screenTag, 'request', 'major', `${s} ${r.request().method()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => {
      const err = r.failure()?.errorText ?? '';
      if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(err)) {
        this.add(screenTag, 'request', 'minor', `failed ${r.method()} ${r.url()} ${err}`);
      }
    });
    return page;
  }

  add(screen: string, kind: Finding['kind'], severity: Finding['severity'], detail: string, screenshot?: string) {
    this.findings.push({ area: this.area, screen, kind, severity, detail, screenshot });
    console.log(`[${this.area}] ${severity.toUpperCase()} ${kind} ${screen}: ${detail}`);
  }

  /**
   * Screenshot + automatic checks for the current screen. Returns the file path
   * so the agent can open it and review the screen visually.
   */
  async snap(page: Page, screen: string, opts: { axe?: boolean; fullPage?: boolean } = {}) {
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // Wait for loading skeletons to be replaced by data (max 10 s).
    await page
      .waitForFunction(() => !document.querySelector('[class*="Skeleton-module"]'), undefined, { timeout: 10_000 })
      .catch(() => this.add(screen, 'note', 'minor', `still loading after 10 s at ${page.url()}`));
    const file = path.join(this.outDir, `${String(++this.shotNo).padStart(3, '0')}-${screen}.png`);
    await page.screenshot({ path: file, fullPage: opts.fullPage ?? true, scale: 'css' });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 2) this.add(screen, 'overflow', 'major', `horizontal overflow ${overflow}px at ${page.url()}`, file);

    // Untranslated next-intl keys look like "namespace.section.key" in visible text.
    const keys = await page.evaluate(() => {
      const text = document.body.innerText;
      const hits = text.match(/\b[a-z]+(?:\.[a-zA-Z0-9]+){2,}\b/g) ?? [];
      return [...new Set(hits)].filter((h) => !/\.(com|local|test|ua|pl|org|net|io|tsx?|js|json|md|css|png|jpg|pdf|mp4)$/.test(h));
    });
    if (keys.length) this.add(screen, 'i18n', 'major', `possible raw keys: ${keys.slice(0, 8).join(', ')}`, file);

    if (opts.axe !== false) {
      try {
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        for (const v of res.violations) {
          const sev = v.impact === 'critical' || v.impact === 'serious' ? 'major' : 'minor';
          this.add(
            screen,
            'axe',
            sev,
            `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help} — ${v.nodes[0]?.target.join(' ')}`,
            file,
          );
        }
      } catch (e) {
        this.add(screen, 'note', 'info', `axe failed: ${(e as Error).message}`);
      }
    }
    return file;
  }

  async login(page: Page, email: string, password: string) {
    await page.goto(`${BASE}/login`);
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  }

  /** Registers + confirms a fresh user through the API (dev mode returns the token). */
  async freshUser(prefix: string, role: 'STUDENT' | 'TEACHER' = 'STUDENT', locale = 'uk') {
    const email = `qa-${prefix}-${Date.now().toString(36)}@qa.local`;
    const password = 'qaPass1234';
    const reg = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role, firstName: 'QA', lastName: prefix, locale }),
    });
    const { confirmToken } = (await reg.json()) as { confirmToken?: string };
    await fetch(`${API}/auth/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: confirmToken }),
    });
    return { email, password };
  }

  async finish() {
    const file = path.join(this.outDir, 'findings.json');
    writeFileSync(file, JSON.stringify(this.findings, null, 2));
    console.log(`\n${this.findings.length} findings → ${file}`);
    await this.browser?.close();
  }
}

export const DEMO = {
  student: { email: 'student@lms.local', password: 'demo1234' },
  student2: { email: 'student2@lms.local', password: 'demo1234' },
  teacher1: { email: 'teacher1@lms.local', password: 'demo1234' },
  teacher2: { email: 'teacher2@lms.local', password: 'demo1234' },
  admin: { email: 'admin@lms.local', password: 'admin123' },
};
