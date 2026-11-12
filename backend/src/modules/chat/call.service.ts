import { Injectable, OnModuleInit } from '@nestjs/common';
import { msg, type LocalizedText } from '../../common/i18n';
import { LockService } from '../../common/redis/lock.service';
import { RedisService } from '../../common/redis/redis.service';
import { QueueService } from '../../common/queue/queue.service';
import {
  MemoryCallStore,
  RedisCallStore,
  type ActiveCall,
  type CallParticipant,
  type CallStore,
} from './call.store';

export type { ActiveCall, CallParticipant } from './call.store';

export const MAX_CALL_PARTICIPANTS = 6;
export const RING_TIMEOUT_MS = 45_000;
export const CALLS_QUEUE = 'calls';

export interface CallInfo {
  conversationId: number;
  type: 'COURSE' | 'DIRECT';
  initiatorId: number;
  startedAt: Date;
  connectedAt: Date | null;
  participants: {
    userId: number;
    name: string;
    audio: boolean;
    video: boolean;
  }[];
}

export class CallError extends Error {
  constructor(
    public code: 'NO_CALL' | 'CALL_FULL' | 'NOT_IN_CALL',
    message: string,
  ) {
    super(message);
  }
}

interface RingTimeoutJob {
  conversationId: number;
  startedAt: string;
}

/**
 * Registry of WebRTC mesh calls, one per conversation. It only tracks
 * membership; media flows peer-to-peer and ChatGateway relays signaling.
 *
 * State lives in a CallStore: Redis when REDIS_URL is set (shared by every
 * backend instance), otherwise process memory. Mutations run under a
 * per-conversation lock. The 45 s ring timeout is a delayed job on the
 * `calls` queue (BullMQ with Redis, setTimeout otherwise), so it fires even
 * if the instance that started the call is gone; the job is a no-op when the
 * call connected or was replaced in the meantime.
 */
@Injectable()
export class CallService implements OnModuleInit {
  ringTimeoutMs = RING_TIMEOUT_MS;
  private readonly store: CallStore;
  private ringTimeoutHandler: (call: ActiveCall) => Promise<void> | void = () =>
    undefined;

  constructor(
    redis: RedisService,
    private locks: LockService,
    private queue: QueueService,
  ) {
    this.store = redis.client
      ? new RedisCallStore(redis.client)
      : new MemoryCallStore();
  }

  onModuleInit() {
    // Processed by API instances: the handler emits through their sockets.
    this.queue.register<RingTimeoutJob>(
      CALLS_QUEUE,
      'ring-timeout',
      (job) => this.expire(job),
      { inApi: true },
    );
  }

  /** Called (by the gateway) when nobody answered within the ring window. */
  onRingTimeout(handler: (call: ActiveCall) => Promise<void> | void) {
    this.ringTimeoutHandler = handler;
  }

  get(conversationId: number): Promise<ActiveCall | null> {
    return this.store.get(conversationId);
  }

  async info(conversationId: number): Promise<CallInfo | null> {
    const call = await this.store.get(conversationId);
    if (!call) return null;
    return {
      conversationId,
      type: call.type,
      initiatorId: call.initiatorId,
      startedAt: call.startedAt,
      connectedAt: call.connectedAt,
      participants: call.participants.map(({ userId, name, audio, video }) => ({
        userId,
        name,
        audio,
        video,
      })),
    };
  }

  private locked<T>(conversationId: number, fn: () => Promise<T>) {
    return this.locks.run(`call:${conversationId}`, fn);
  }

  /** Starts a call (or returns the one already running) and adds the caller. */
  async start(params: {
    conversationId: number;
    type: 'COURSE' | 'DIRECT';
    user: { id: number; name: string };
    socketId: string;
    invited: number[];
  }): Promise<{ call: ActiveCall; created: boolean }> {
    const result = await this.locked(params.conversationId, async () => {
      const existing = await this.store.get(params.conversationId);
      if (existing) {
        this.addParticipant(existing, params.user, params.socketId);
        await this.store.save(existing);
        return { call: existing, created: false };
      }
      const call: ActiveCall = {
        conversationId: params.conversationId,
        type: params.type,
        initiatorId: params.user.id,
        invited: params.invited,
        startedAt: new Date(),
        connectedAt: null,
        participants: [],
      };
      this.addParticipant(call, params.user, params.socketId);
      await this.store.save(call);
      return { call, created: true };
    });
    await this.store.linkSocket(params.socketId, params.conversationId);
    if (result.created) {
      const startedAt = result.call.startedAt.toISOString();
      await this.queue.enqueue<RingTimeoutJob>(
        CALLS_QUEUE,
        'ring-timeout',
        { conversationId: params.conversationId, startedAt },
        {
          delay: this.ringTimeoutMs,
          jobId: `ring-${params.conversationId}-${result.call.startedAt.getTime()}`,
          attempts: 1,
        },
      );
    }
    return result;
  }

  /** Adds a user to a running call; the joiner then sends offers to the others. */
  async join(
    conversationId: number,
    user: { id: number; name: string },
    socketId: string,
  ): Promise<ActiveCall> {
    const call = await this.locked(conversationId, async () => {
      const current = await this.store.get(conversationId);
      if (!current) throw new CallError('NO_CALL', 'No active call');
      this.addParticipant(current, user, socketId);
      await this.store.save(current);
      return current;
    });
    await this.store.linkSocket(socketId, conversationId);
    return call;
  }

  private addParticipant(
    call: ActiveCall,
    user: { id: number; name: string },
    socketId: string,
  ) {
    const current = call.participants.find((p) => p.userId === user.id);
    if (current) {
      // Same user from another tab/reconnect: the newest socket wins.
      current.socketId = socketId;
      return;
    }
    if (call.participants.length >= MAX_CALL_PARTICIPANTS) {
      throw new CallError('CALL_FULL', 'Call is full');
    }
    call.participants.push({
      userId: user.id,
      socketId,
      name: user.name,
      audio: true,
      video: true,
    } satisfies CallParticipant);
    if (call.participants.length >= 2 && !call.connectedAt) {
      call.connectedAt = new Date();
    }
  }

  /**
   * Removes a user. The call ends when nobody is left, or — for a 1:1 call —
   * when one side hangs up after it connected.
   */
  leave(
    conversationId: number,
    userId: number,
  ): Promise<{ call: ActiveCall; ended: boolean } | null> {
    return this.locked(conversationId, async () => {
      const call = await this.store.get(conversationId);
      if (!call || !call.participants.some((p) => p.userId === userId)) {
        return null;
      }
      call.participants = call.participants.filter((p) => p.userId !== userId);
      const ended =
        call.participants.length === 0 ||
        (call.type === 'DIRECT' && call.connectedAt !== null);
      if (ended) await this.store.delete(conversationId);
      else await this.store.save(call);
      return { call, ended };
    });
  }

  /** Ends a call outright (declined 1:1 call); returns it if it existed. */
  remove(conversationId: number): Promise<ActiveCall | null> {
    return this.locked(conversationId, async () => {
      const call = await this.store.get(conversationId);
      if (call) await this.store.delete(conversationId);
      return call;
    });
  }

  /**
   * Calls the socket was part of (for disconnect cleanup); forgets the socket.
   * A participant who reconnected with another socket isn't removed.
   */
  async dropSocket(
    socketId: string,
  ): Promise<{ conversationId: number; userId: number }[]> {
    const out: { conversationId: number; userId: number }[] = [];
    for (const conversationId of await this.store.socketCalls(socketId)) {
      const call = await this.store.get(conversationId);
      for (const p of call?.participants ?? []) {
        if (p.socketId === socketId) {
          out.push({ conversationId, userId: p.userId });
        }
      }
    }
    await this.store.unlinkSocket(socketId);
    return out;
  }

  /**
   * Socket id of `toUserId` if both users are in the same active call. With
   * the Redis adapter `server.to(socketId)` reaches it on any instance.
   */
  async relayTarget(
    conversationId: number,
    fromUserId: number,
    toUserId: number,
  ): Promise<string> {
    const call = await this.store.get(conversationId);
    const from = call?.participants.find((p) => p.userId === fromUserId);
    const to = call?.participants.find((p) => p.userId === toUserId);
    if (!call || !from || !to || fromUserId === toUserId) {
      throw new CallError('NOT_IN_CALL', 'Not in this call');
    }
    return to.socketId;
  }

  setMediaState(
    conversationId: number,
    userId: number,
    state: { audio?: boolean; video?: boolean },
  ): Promise<boolean> {
    return this.locked(conversationId, async () => {
      const call = await this.store.get(conversationId);
      const p = call?.participants.find((x) => x.userId === userId);
      if (!call || !p) return false;
      if (typeof state.audio === 'boolean') p.audio = state.audio;
      if (typeof state.video === 'boolean') p.video = state.video;
      await this.store.save(call);
      return true;
    });
  }

  /** Ring-timeout job: ends the call if it is still the same unanswered one. */
  async expire(job: RingTimeoutJob): Promise<void> {
    const expired = await this.locked(job.conversationId, async () => {
      const call = await this.store.get(job.conversationId);
      if (
        !call ||
        call.connectedAt ||
        call.startedAt.toISOString() !== job.startedAt
      ) {
        return null;
      }
      await this.store.delete(job.conversationId);
      return call;
    });
    if (expired) await this.ringTimeoutHandler(expired);
  }
}

/**
 * «Відеодзвінок завершено · 05:32» or «Пропущений відеодзвінок», rendered in
 * the initiator's language when the service message is stored.
 */
export function callSummary(call: ActiveCall, now = new Date()): LocalizedText {
  if (!call.connectedAt) return msg('call.missed');
  const seconds = Math.max(
    0,
    Math.round((now.getTime() - call.connectedAt.getTime()) / 1000),
  );
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return msg('call.ended', { duration: time });
}
