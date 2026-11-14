// Lighthouse (system Chrome) for key pages, desktop and mobile presets.
// Usage: node lighthouse.mjs [baseUrl]   — results in results/lighthouse/*.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { ROOT, save } from './lib.mjs';

const BASE = (process.argv[2] ?? 'https://magistr-lms.vercel.app').replace(/\/$/, '');
const API = (process.env.PERF_API ?? 'https://lms-backend-z43s.onrender.com/api').replace(/\/$/, '');
const dir = join(ROOT, 'results', 'lighthouse');
mkdirSync(dir, { recursive: true });

const catalog = await (await fetch(`${API}/store/catalog?pageSize=48`)).json();
const html = catalog.items.find((c) => c.title.startsWith('HTML')) ?? catalog.items[0];
const pages = { home: '/', catalog: '/catalog', landing: `/c/${html.id}`, login: '/login' };

const chrome = await chromeLauncher.launch({
  chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  chromeFlags: ['--headless=new', '--no-first-run'],
});
const summary = { base: BASE, at: new Date().toISOString(), results: [] };
try {
  for (const preset of ['desktop', 'mobile']) {
    for (const [name, path] of Object.entries(pages)) {
      const url = BASE + path;
      // One warm-up load so a sleeping backend doesn't dominate the numbers.
      await fetch(url).catch(() => undefined);
      const r = await lighthouse(
        url,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        preset === 'desktop' ? desktopConfig : undefined,
      );
      const lhr = r.lhr;
      const audit = (id) => lhr.audits[id]?.numericValue;
      const row = {
        page: name,
        preset,
        url,
        performance: Math.round(lhr.categories.performance.score * 100),
        accessibility: Math.round(lhr.categories.accessibility.score * 100),
        bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
        seo: Math.round(lhr.categories.seo.score * 100),
        fcpMs: Math.round(audit('first-contentful-paint')),
        lcpMs: Math.round(audit('largest-contentful-paint')),
        tbtMs: Math.round(audit('total-blocking-time')),
        cls: Math.round(audit('cumulative-layout-shift') * 1000) / 1000,
        speedIndexMs: Math.round(audit('speed-index')),
      };
      summary.results.push(row);
      writeFileSync(join(dir, `${preset}-${name}.json`), JSON.stringify({
        ...row,
        failedAudits: Object.values(lhr.audits)
          .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
          .map((a) => ({ id: a.id, title: a.title, score: a.score, value: a.displayValue })),
      }, null, 2));
      console.log(row);
    }
  }
} finally {
  await chrome.kill();
}
console.log('saved', save(process.env.PERF_OUT ?? 'lighthouse', summary));
