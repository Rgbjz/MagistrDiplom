// HTTP load scenarios (autocannon): increasing concurrency, RPS and latency
// percentiles per level. Usage: PERF_API=http://localhost:5066/api node load.mjs [scenario...]
import autocannon from 'autocannon';
import { API, DURATION, LEVELS, getJson, login, save } from './lib.mjs';

const COURSE = Number(process.env.PERF_COURSE ?? 0);

async function context() {
  const student = await login('student@lms.local', 'demo1234');
  const teacher = await login('teacher1@lms.local', 'demo1234');
  const catalog = await getJson('/store/catalog?pageSize=12');
  // «Основи веб-розробки»: teacher1's course the demo student studies in,
  // with tests, an assignment and chat history.
  const courseId =
    COURSE ||
    (await getJson('/store/catalog?pageSize=48&search=' + encodeURIComponent('Основи веб-розробки'))).items[0]
      .id;
  const course = await getJson(`/courses/${courseId}`, student);
  const lessons = course.sections.flatMap((s) => s.lessons);
  const chat = await getJson(`/chat/courses/${courseId}/conversation`, student);
  return { student, teacher, catalog, courseId, lessons, chatId: chat.id, file: await lessonFile(teacher, student, lessons[0].id) };
}

/**
 * A ~200 KB lesson attachment (typical PDF handout) and the signed download
 * URL a student gets for it. Re-uses the file if an earlier run left it.
 */
async function lessonFile(teacher, student, lessonId) {
  const name = 'perf-handout.pdf';
  let lesson = (await getJson(`/lessons/${lessonId}`, student)).lesson;
  if (!lesson.files?.some((f) => f.name === name)) {
    const form = new FormData();
    const bytes = new Uint8Array(200 * 1024).map((_, i) => (i * 31) % 251);
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
    const res = await fetch(`${API}/lessons/${lessonId}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher}` },
      body: form,
    });
    if (!res.ok) throw new Error(`upload: ${res.status} ${await res.text()}`);
    lesson = (await getJson(`/lessons/${lessonId}`, student)).lesson;
  }
  const url = new URL(lesson.files.find((f) => f.name === name).url);
  return { path: url.pathname + url.search, bytes: 200 * 1024 };
}

function scenarios(ctx) {
  const auth = (t) => ({ authorization: `Bearer ${t}` });
  const pub = ctx.catalog.items.map((c) => c.id);
  return {
    catalog: {
      title: 'Публічний каталог і лендинг курсу (анонімно)',
      requests: [
        { method: 'GET', path: '/api/store/catalog?pageSize=12' },
        ...pub.slice(0, 4).map((id) => ({ method: 'GET', path: `/api/store/public/courses/${id}` })),
      ],
    },
    student: {
      title: 'Студент: кабінет, курс, урок, адаптація',
      requests: [
        { method: 'GET', path: '/api/dashboard', headers: auth(ctx.student) },
        { method: 'GET', path: `/api/courses/${ctx.courseId}`, headers: auth(ctx.student) },
        ...ctx.lessons
          .slice(0, 3)
          .map((l) => ({ method: 'GET', path: `/api/lessons/${l.id}`, headers: auth(ctx.student) })),
        { method: 'GET', path: `/api/courses/${ctx.courseId}/adaptive/me`, headers: auth(ctx.student) },
        { method: 'GET', path: '/api/adaptive/recommendations', headers: auth(ctx.student) },
      ],
    },
    teacher: {
      title: 'Викладач: журнал оцінок, аналітика, адаптація',
      requests: [
        { method: 'GET', path: `/api/courses/${ctx.courseId}/gradebook`, headers: auth(ctx.teacher) },
        { method: 'GET', path: `/api/courses/${ctx.courseId}/analytics`, headers: auth(ctx.teacher) },
        { method: 'GET', path: `/api/courses/${ctx.courseId}/adaptive/overview`, headers: auth(ctx.teacher) },
      ],
    },
    chat: {
      title: 'Чат: список розмов і повідомлення',
      requests: [
        { method: 'GET', path: '/api/chat/conversations', headers: auth(ctx.student) },
        { method: 'GET', path: `/api/chat/conversations/${ctx.chatId}/messages`, headers: auth(ctx.student) },
      ],
    },
    file: {
      title: 'Завантаження файлу уроку (200 КБ) за підписаним посиланням',
      requests: [{ method: 'GET', path: ctx.file.path }],
    },
    health: {
      title: 'Health-check (базова лінія: Nest + БД + Redis)',
      requests: [{ method: 'GET', path: '/api/health' }],
    },
  };
}

function run(url, requests, connections) {
  return new Promise((resolve, reject) => {
    autocannon(
      { url, connections, duration: DURATION, requests, timeout: 30 },
      (err, r) => (err ? reject(err) : resolve(r)),
    );
  });
}

const ctx = await context();
const all = scenarios(ctx);
const pick = process.argv.slice(2);
const names = pick.length ? pick : Object.keys(all);
const origin = new URL(API).origin;
const out = { api: API, durationSec: DURATION, courseId: ctx.courseId, at: new Date().toISOString(), scenarios: {} };

for (const name of names) {
  const sc = all[name];
  out.scenarios[name] = { title: sc.title, requestsPerCycle: sc.requests.length, levels: [] };
  for (const c of LEVELS) {
    const r = await run(origin, sc.requests, c);
    const errors = r.errors + r.timeouts + r.non2xx;
    const row = {
      connections: c,
      rps: Math.round(r.requests.average),
      p50: r.latency.p50,
      p90: r.latency.p90,
      p97_5: r.latency.p97_5,
      p99: r.latency.p99,
      max: r.latency.max,
      mean: Math.round(r.latency.average * 10) / 10,
      total: r.requests.total,
      errors,
      errorRate: r.requests.total ? Math.round((errors / r.requests.total) * 10000) / 100 : 0,
    };
    out.scenarios[name].levels.push(row);
    console.log(
      `${name.padEnd(8)} c=${String(c).padStart(3)}  rps=${String(row.rps).padStart(5)}  p50=${row.p50}ms p90=${row.p90}ms p99=${row.p99}ms  err=${row.errorRate}%`,
    );
  }
}
console.log('saved', save(process.env.PERF_OUT ?? 'load-local', out));
