// Gentle, read-only check of the deployed system (Render free tier + Neon):
// cold start, then latency at low concurrency (≤10) for ≤60 s per scenario.
// Logs in once (auth is limited to ~10/min) and only sends GET requests.
import autocannon from 'autocannon';
import { API, getJson, login, pct, save } from './lib.mjs';

// Run as: PERF_API=https://lms-backend-z43s.onrender.com/api node prod.mjs
if (!API.startsWith('https://')) throw new Error('Set PERF_API to the deployed API (https://…)');
const LEVELS = (process.env.PERF_LEVELS ?? '1,5,10').split(',').map(Number);
const DURATION = Math.min(60, Number(process.env.PERF_DURATION ?? 20));

/** Single-request timings (sequential) — cold vs warm. */
async function probe(path, token, n) {
  const t = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    await res.arrayBuffer();
    t.push(Math.round(performance.now() - t0));
  }
  return t;
}

const out = { api: API, at: new Date().toISOString(), durationSec: DURATION };
// The first request after ≥15 min idle wakes the Render instance up.
out.firstRequestMs = (await probe('/health', null, 1))[0];
const warm = await probe('/health', null, 10);
out.healthWarm = { p50: pct(warm, 50), p95: pct(warm, 95) };
console.log('first request', out.firstRequestMs, 'ms; warm health', out.healthWarm);

const token = await login('student@lms.local', 'demo1234');
const catalog = await getJson('/store/catalog?pageSize=12');
const course = catalog.items.find((c) => c.title === 'Основи веб-розробки') ?? catalog.items[0];
const scenarios = {
  catalog: [
    { method: 'GET', path: '/api/store/catalog?pageSize=12' },
    { method: 'GET', path: `/api/store/public/courses/${course.id}` },
  ],
  student: [
    { method: 'GET', path: '/api/dashboard', headers: { authorization: `Bearer ${token}` } },
    { method: 'GET', path: `/api/courses/${course.id}`, headers: { authorization: `Bearer ${token}` } },
    { method: 'GET', path: `/api/courses/${course.id}/adaptive/me`, headers: { authorization: `Bearer ${token}` } },
  ],
};
const origin = new URL(API).origin;
out.scenarios = {};
for (const [name, requests] of Object.entries(scenarios)) {
  out.scenarios[name] = [];
  for (const c of LEVELS) {
    const r = await new Promise((resolve, reject) =>
      autocannon({ url: origin, connections: c, duration: DURATION, requests, timeout: 30 }, (e, x) =>
        e ? reject(e) : resolve(x),
      ),
    );
    const errors = r.errors + r.timeouts + r.non2xx;
    const row = {
      connections: c,
      rps: Math.round(r.requests.average * 10) / 10,
      p50: r.latency.p50,
      p90: r.latency.p90,
      p99: r.latency.p99,
      total: r.requests.total,
      errors,
      errorRate: r.requests.total ? Math.round((errors / r.requests.total) * 10000) / 100 : 0,
    };
    out.scenarios[name].push(row);
    console.log(name, row);
  }
}
console.log('saved', save(process.env.PERF_OUT ?? 'prod', out));
