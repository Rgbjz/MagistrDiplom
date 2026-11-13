import type { ConfigService } from '@nestjs/config';
import {
  CallError,
  CallService,
  MAX_CALL_PARTICIPANTS,
  callSummary,
  type ActiveCall,
} from './call.service';
import { render } from '../../common/i18n';
import { LockService } from '../../common/redis/lock.service';
import type { RedisService } from '../../common/redis/redis.service';
import { QueueService } from '../../common/queue/queue.service';
import { FakeRedis } from '../../common/redis/fake-redis.testing';

const teacher = { id: 1, name: 'Ірина' };
const student = { id: 2, name: 'Олена' };
const config = {
  get: (_k: string, d?: unknown) => d,
} as unknown as ConfigService;

/** A CallService over memory state, or over a (fake) Redis shared by "instances". */
function makeService(client: FakeRedis | null) {
  const redis = { client, enabled: false } as unknown as RedisService;
  // Jobs always use the in-process runner here (no BullMQ in unit tests).
  const queue = new QueueService(
    { client: null, enabled: false } as unknown as RedisService,
    config,
  );
  const service = new CallService(redis, new LockService(redis), queue);
  service.onModuleInit();
  return service;
}

function startDirect(service: CallService) {
  return service.start({
    conversationId: 10,
    type: 'DIRECT',
    user: teacher,
    socketId: 's1',
    invited: [2],
  });
}

describe.each([
  ['memory store', () => null],
  ['Redis store', () => new FakeRedis()],
])('CallService (%s)', (_label, makeClient) => {
  let service: CallService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = makeService(makeClient());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a call once and reuses it for a second start', async () => {
    expect((await startDirect(service)).created).toBe(true);
    const again = await service.start({
      conversationId: 10,
      type: 'DIRECT',
      user: student,
      socketId: 's2',
      invited: [1],
    });
    expect(again.created).toBe(false);
    expect((await service.info(10))?.participants.map((p) => p.userId)).toEqual(
      [1, 2],
    );
  });

  it('marks the call connected when a second participant joins', async () => {
    await startDirect(service);
    expect((await service.get(10))?.connectedAt).toBeNull();
    await service.join(10, student, 's2');
    expect((await service.get(10))?.connectedAt).toBeInstanceOf(Date);
  });

  it('rejects joining a call that does not exist', async () => {
    await expect(service.join(99, student, 's2')).rejects.toBeInstanceOf(
      CallError,
    );
  });

  it(`rejects the ${MAX_CALL_PARTICIPANTS + 1}th participant of a group call`, async () => {
    await service.start({
      conversationId: 20,
      type: 'COURSE',
      user: teacher,
      socketId: 's1',
      invited: [],
    });
    for (let id = 2; id <= MAX_CALL_PARTICIPANTS; id++) {
      await service.join(20, { id, name: `S${id}` }, `s${id}`);
    }
    await expect(
      service.join(20, { id: 99, name: 'Late' }, 's99'),
    ).rejects.toMatchObject({ code: 'CALL_FULL' });
    // The same user reconnecting from a new socket is not "a new participant".
    await service.join(20, { id: 3, name: 'S3' }, 'new-socket');
    expect(await service.relayTarget(20, 1, 3)).toBe('new-socket');
  });

  it('relays signaling only between members of the same call', async () => {
    await startDirect(service);
    await service.join(10, student, 's2');
    expect(await service.relayTarget(10, 1, 2)).toBe('s2');
    for (const [conv, from, to] of [
      [10, 1, 3],
      [10, 3, 1],
      [10, 1, 1],
      [11, 1, 2],
    ]) {
      await expect(service.relayTarget(conv, from, to)).rejects.toBeInstanceOf(
        CallError,
      );
    }
  });

  it('ends a group call only when the last participant leaves', async () => {
    await service.start({
      conversationId: 20,
      type: 'COURSE',
      user: teacher,
      socketId: 's1',
      invited: [2, 3],
    });
    await service.join(20, student, 's2');
    expect((await service.leave(20, 1))?.ended).toBe(false);
    expect(await service.get(20)).not.toBeNull();
    expect((await service.leave(20, 2))?.ended).toBe(true);
    expect(await service.get(20)).toBeNull();
  });

  it('ends a connected 1:1 call when either side hangs up', async () => {
    await startDirect(service);
    await service.join(10, student, 's2');
    expect((await service.leave(10, 2))?.ended).toBe(true);
    expect(await service.get(10)).toBeNull();
  });

  it('ignores leave from someone who is not in the call', async () => {
    await startDirect(service);
    expect(await service.leave(10, 5)).toBeNull();
    expect(await service.leave(77, 1)).toBeNull();
  });

  it('times out an unanswered call through the queue', async () => {
    const onTimeout = jest.fn();
    service.onRingTimeout(onTimeout);
    await startDirect(service);
    await jest.advanceTimersByTimeAsync(service.ringTimeoutMs - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(await service.get(10)).toBeNull();
  });

  it('does not time out once somebody answered', async () => {
    const onTimeout = jest.fn();
    service.onRingTimeout(onTimeout);
    await startDirect(service);
    await service.join(10, student, 's2');
    await jest.advanceTimersByTimeAsync(service.ringTimeoutMs * 2);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(await service.get(10)).not.toBeNull();
  });

  it('a stale timeout job does not end a newer call in the same chat', async () => {
    const onTimeout = jest.fn();
    service.onRingTimeout(onTimeout);
    const first = await startDirect(service);
    await service.remove(10);
    jest.setSystemTime(first.call.startedAt.getTime() + 1000);
    await startDirect(service);
    await service.expire({
      conversationId: 10,
      startedAt: first.call.startedAt.toISOString(),
    });
    expect(onTimeout).not.toHaveBeenCalled();
    expect(await service.get(10)).not.toBeNull();
  });

  it('finds and forgets the calls of a disconnected socket', async () => {
    await startDirect(service);
    await service.join(10, student, 's2');
    expect(await service.dropSocket('s2')).toEqual([
      { conversationId: 10, userId: 2 },
    ]);
    expect(await service.dropSocket('s2')).toEqual([]);
    expect(await service.dropSocket('nope')).toEqual([]);
  });

  it('tracks media state of participants', async () => {
    await startDirect(service);
    expect(await service.setMediaState(10, 1, { audio: false })).toBe(true);
    expect((await service.info(10))?.participants[0]).toMatchObject({
      audio: false,
      video: true,
    });
    expect(await service.setMediaState(10, 9, { audio: false })).toBe(false);
  });
});

describe('CallService across instances (shared Redis)', () => {
  it('sees a call started on another instance and relays to its sockets', async () => {
    const shared = new FakeRedis();
    const a = makeService(shared);
    const b = makeService(shared);
    await startDirect(a);
    await b.join(10, student, 's2-on-b');
    expect((await a.get(10))?.connectedAt).toBeInstanceOf(Date);
    expect(await a.relayTarget(10, 1, 2)).toBe('s2-on-b');
    expect((await b.leave(10, 1))?.ended).toBe(true);
    expect(await a.get(10)).toBeNull();
  });
});

describe('callSummary', () => {
  const base = { connectedAt: null } as unknown as ActiveCall;

  it('reports a missed call', () => {
    expect(render(callSummary(base), 'uk')).toBe('Пропущений відеодзвінок');
  });

  it('formats the duration', () => {
    const call = { connectedAt: new Date(0) } as ActiveCall;
    expect(render(callSummary(call, new Date(332_000)), 'uk')).toBe(
      'Відеодзвінок завершено · 05:32',
    );
    expect(render(callSummary(call, new Date(3_723_000)), 'uk')).toBe(
      'Відеодзвінок завершено · 1:02:03',
    );
  });
});

describe('audio calls', () => {
  let service: CallService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = makeService(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the kind of call and starts participants with the camera off', async () => {
    const { call } = await service.start({
      conversationId: 30,
      type: 'GROUP',
      media: 'audio',
      user: teacher,
      socketId: 's1',
      invited: [2, 3],
    });
    expect(call.media).toBe('audio');
    const joined = await service.join(30, student, 's2');
    expect(joined.participants.map((p) => p.video)).toEqual([false, false]);
    const info = await service.info(30);
    expect(info?.media).toBe('audio');
    expect(info?.type).toBe('GROUP');
  });

  it('records the media a participant actually has', async () => {
    await service.start({
      conversationId: 31,
      type: 'DIRECT',
      user: teacher,
      socketId: 's1',
      invited: [2],
      state: { video: false },
    });
    const call = await service.join(31, student, 's2', {
      audio: true,
      video: true,
    });
    expect(call.media).toBe('video');
    expect(call.participants.map((p) => [p.userId, p.video])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('logs audio calls as audio calls', async () => {
    const { call } = await service.start({
      conversationId: 32,
      type: 'DIRECT',
      media: 'audio',
      user: teacher,
      socketId: 's1',
      invited: [2],
    });
    expect(render(callSummary(call), 'uk')).toBe('Пропущений аудіодзвінок');
    call.connectedAt = new Date(Date.now() - 65_000);
    expect(render(callSummary(call), 'en')).toBe('Audio call ended · 01:05');
  });
});
