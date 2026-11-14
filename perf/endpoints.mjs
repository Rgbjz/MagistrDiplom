// Per-endpoint timing for before/after comparisons: median/p95 of sequential
// requests (single user) and throughput at 10 concurrent connections.
// Usage: PERF_API=http://localhost:5077/api PERF_OUT=endpoints-before node endpoints.mjs
import autocannon from 'autocannon';
import { API, getJson, login, pct, save } from './lib.mjs';

const SEQ = Number(process.env.PERF_SEQ ?? 20);
const student = await login('student@lms.local', 'demo1234');
const teacher = await login('teacher1@lms.local', 'demo1234');
const catalog = await getJson('/store/catalog?pageSize=48&search=' + encodeURIComponent('Основи веб-розробки'));
const course = catalog.items[0].id;

const endpoints = [
  ['catalog', '/store/catalog?pageSize=12', null],
  ['dashboard', '/dashboard', student],
  ['course', `/courses/${course}`, student],
  ['adaptiveMe', `/courses/${course}/adaptive/me`, student],
  ['recommendations', '/adaptive/recommendations', student],
  ['chatMessages', `/chat/conversations/${(await getJson(`/chat/courses/${course}/conversation`, student)).id}/messages`, student],
  ['gradebook', `/courses/${course}/gradebook`, teacher],
  ['analytics', `/courses/${course}/analytics`, teacher],
  ['adaptiveOverview', `/courses/${course}/adaptive/overview`, teacher],
];

const out = { api: API, course, at: new Date().toISOString(), endpoints: [] };
for (const [name, path, token] of endpoints) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const times = [];
  let bytes = 0;
  for (let i = 0; i < SEQ; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API}${path}`, { headers });
    bytes = (await res.arrayBuffer()).byteLength;
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    times.push(performance.now() - t0);
  }
  const r = await new Promise((resolve, reject) =>
    autocannon(
      {
        url: new URL(API).origin,
        connections: 10,
        duration: Number(process.env.PERF_DURATION ?? 8),
        requests: [{ method: 'GET', path: `/api${path}`, headers: token ? { authorization: `Bearer ${token}` } : {} }],
        timeout: 60,
      },
      (e, x) => (e ? reject(e) : resolve(x)),
    ),
  );
  const row = {
    name,
    path,
    responseKB: Math.round(bytes / 102.4) / 10,
    seqP50: Math.round(pct(times, 50)),
    seqP95: Math.round(pct(times, 95)),
    c10Rps: Math.round(r.requests.average * 10) / 10,
    c10P50: r.latency.p50,
    c10P99: r.latency.p99,
    errors: r.errors + r.timeouts + r.non2xx,
  };
  out.endpoints.push(row);
  console.log(row);
}
console.log('saved', save(process.env.PERF_OUT ?? 'endpoints', out));
