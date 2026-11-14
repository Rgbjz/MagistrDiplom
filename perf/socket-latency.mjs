// Real-time chat latency over Socket.IO: K concurrent senders post to the
// course chat; a separate listener measures send → «message:new» delivery.
// Also records the server acknowledgement time (message persisted).
import { io } from 'socket.io-client';
import { API, getJson, login, pct, save } from './lib.mjs';

const LEVELS = (process.env.PERF_SOCKET_LEVELS ?? '1,10,25,50').split(',').map(Number);
const PER_SENDER = Number(process.env.PERF_SOCKET_MESSAGES ?? 20);
const origin = new URL(API).origin;

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(origin, { auth: { token }, transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
const emit = (s, ev, body) => new Promise((resolve) => s.emit(ev, body, resolve));

const student = await login('student@lms.local', 'demo1234');
const teacher = await login('teacher1@lms.local', 'demo1234');
const catalog = await getJson('/store/catalog?pageSize=48&search=' + encodeURIComponent('Основи веб-розробки'));
const courseId = Number(process.env.PERF_COURSE ?? catalog.items[0].id);
const { id: conversationId } = await getJson(`/chat/courses/${courseId}/conversation`, student);

const listener = await connect(teacher);
await emit(listener, 'conversation:join', { conversationId });
const sentAt = new Map();
const delivery = [];
listener.on('message:new', (m) => {
  const t = sentAt.get(m.content);
  if (t) {
    delivery.push(performance.now() - t);
    sentAt.delete(m.content);
  }
});

const out = { api: API, conversationId, perSender: PER_SENDER, at: new Date().toISOString(), levels: [] };
for (const k of LEVELS) {
  const senders = await Promise.all(Array.from({ length: k }, () => connect(student)));
  await Promise.all(senders.map((s) => emit(s, 'conversation:join', { conversationId })));
  delivery.length = 0;
  const ack = [];
  const t0 = performance.now();
  await Promise.all(
    senders.map(async (s, si) => {
      for (let i = 0; i < PER_SENDER; i++) {
        const content = `perf ${k}-${si}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        const t = performance.now();
        sentAt.set(content, t);
        await emit(s, 'message:send', { conversationId, content });
        ack.push(performance.now() - t);
      }
    }),
  );
  const wall = (performance.now() - t0) / 1000;
  await new Promise((r) => setTimeout(r, 1000)); // let the last deliveries arrive
  const row = {
    senders: k,
    messages: k * PER_SENDER,
    msgPerSec: Math.round((k * PER_SENDER) / wall),
    ackP50: Math.round(pct(ack, 50)),
    ackP95: Math.round(pct(ack, 95)),
    deliveryP50: Math.round(pct(delivery, 50)),
    deliveryP95: Math.round(pct(delivery, 95)),
    deliveryP99: Math.round(pct(delivery, 99)),
    delivered: delivery.length,
  };
  out.levels.push(row);
  console.log(row);
  senders.forEach((s) => s.disconnect());
}
listener.disconnect();
console.log('saved', save(process.env.PERF_OUT ?? 'socket-local', out));
process.exit(0);
