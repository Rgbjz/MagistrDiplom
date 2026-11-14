// Write-heavy flow: N students take a test at the same time (start → submit),
// which also updates the adaptive learner model. Each worker is a different
// student (one open attempt per student and test). Local stack only.
import { API, DURATION, getJson, login, pct, save } from './lib.mjs';

const LEVELS = (process.env.PERF_FLOW_LEVELS ?? '1,3,5,9').split(',').map(Number);
const STUDENTS = ['student', ...Array.from({ length: 10 }, (_, i) => `student${i + 2}`)];

async function post(path, token, body) {
  const t0 = performance.now();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  const json = res.ok ? await res.json() : null;
  if (!res.ok) await res.text();
  return { ok: res.ok, status: res.status, ms, json };
}

/** Some answer for every question type: correctness doesn't matter here. */
function answer(q) {
  if (q.type === 'SINGLE' || q.type === 'MULTIPLE') return { answerIds: [q.answers[0].id] };
  if (q.type === 'TRUE_FALSE') return { value: true };
  if (q.type === 'NUMERIC') return { value: 1 };
  if (q.type === 'MATCHING') return { pairs: {} };
  if (q.type === 'ORDERING') return { order: (q.items ?? []).map((_, i) => i) };
  return { text: 'відповідь' };
}

const catalog = await getJson('/store/catalog?pageSize=48&search=' + encodeURIComponent('Основи веб-розробки'));
const courseId = Number(process.env.PERF_COURSE ?? catalog.items[0].id);
const tokens = [];
for (const s of STUDENTS) {
  try {
    const t = await login(`${s}@lms.local`, 'demo1234');
    await getJson(`/courses/${courseId}`, t); // enrolled?
    tokens.push(t);
  } catch {
    /* not enrolled in this course */
  }
}
const course = await getJson(`/courses/${courseId}`, tokens[0]);
const testIds = course.sections.flatMap((s) => s.lessons).filter((l) => l.test).map((l) => l.test.id);
console.log(`course ${courseId}: ${tokens.length} enrolled students, tests ${testIds.join(',')}`);

const out = { api: API, courseId, durationSec: DURATION, at: new Date().toISOString(), levels: [] };
for (const level of LEVELS.filter((l) => l <= tokens.length)) {
  const start = [];
  const submit = [];
  let errors = 0;
  let flows = 0;
  const until = Date.now() + DURATION * 1000;
  await Promise.all(
    tokens.slice(0, level).map(async (token, w) => {
      let i = w;
      while (Date.now() < until) {
        const testId = testIds[i++ % testIds.length];
        const s = await post(`/tests/${testId}/start`, token);
        if (!s.ok) {
          errors++;
          continue;
        }
        start.push(s.ms);
        const answers = Object.fromEntries(s.json.questions.map((q) => [q.id, answer(q)]));
        const r = await post(`/tests/${s.json.testResultId}/submit`, token, { answers });
        if (!r.ok) errors++;
        else {
          submit.push(r.ms);
          flows++;
        }
      }
    }),
  );
  const row = {
    users: level,
    flowsPerSec: Math.round((flows / DURATION) * 10) / 10,
    startP50: Math.round(pct(start, 50)),
    startP95: Math.round(pct(start, 95)),
    submitP50: Math.round(pct(submit, 50)),
    submitP95: Math.round(pct(submit, 95)),
    submitP99: Math.round(pct(submit, 99)),
    flows,
    errors,
  };
  out.levels.push(row);
  console.log(row);
}
console.log('saved', save(process.env.PERF_OUT ?? 'flow-local', out));
