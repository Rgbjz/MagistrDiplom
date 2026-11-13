import type Redis from 'ioredis';

export interface CallParticipant {
  userId: number;
  socketId: string;
  name: string;
  audio: boolean;
  video: boolean;
}

export type CallConversationType = 'COURSE' | 'DIRECT' | 'GROUP';

/** What the caller started: a video call or a voice-only call. */
export type CallMedia = 'audio' | 'video';

export interface ActiveCall {
  conversationId: number;
  type: CallConversationType;
  media: CallMedia;
  initiatorId: number;
  /** Users who were rung — they get `call:ended` when the call finishes. */
  invited: number[];
  startedAt: Date;
  /** Set once a second participant joins: the call actually connected. */
  connectedAt: Date | null;
  participants: CallParticipant[];
}

/** Where call state lives: process memory (one instance) or Redis (many). */
export interface CallStore {
  get(conversationId: number): Promise<ActiveCall | null>;
  save(call: ActiveCall): Promise<void>;
  delete(conversationId: number): Promise<void>;
  /** Remembers that `socketId` is in a call (for disconnect cleanup). */
  linkSocket(socketId: string, conversationId: number): Promise<void>;
  socketCalls(socketId: string): Promise<number[]>;
  unlinkSocket(socketId: string): Promise<void>;
}

/** A call can't outlive this in Redis even if an instance dies mid-call. */
export const CALL_TTL_SECONDS = 6 * 60 * 60;

interface StoredCall extends Omit<ActiveCall, 'startedAt' | 'connectedAt'> {
  startedAt: string;
  connectedAt: string | null;
}

function serialize(call: ActiveCall): string {
  const stored: StoredCall = {
    ...call,
    startedAt: call.startedAt.toISOString(),
    connectedAt: call.connectedAt ? call.connectedAt.toISOString() : null,
  };
  return JSON.stringify(stored);
}

function deserialize(raw: string): ActiveCall {
  const s = JSON.parse(raw) as StoredCall;
  return {
    ...s,
    // Calls stored before audio calls existed were always video calls.
    media: s.media ?? 'video',
    startedAt: new Date(s.startedAt),
    connectedAt: s.connectedAt ? new Date(s.connectedAt) : null,
  };
}

export class MemoryCallStore implements CallStore {
  private calls = new Map<number, string>();
  private sockets = new Map<string, Set<number>>();

  get(conversationId: number) {
    const raw = this.calls.get(conversationId);
    return Promise.resolve(raw ? deserialize(raw) : null);
  }

  save(call: ActiveCall) {
    this.calls.set(call.conversationId, serialize(call));
    return Promise.resolve();
  }

  delete(conversationId: number) {
    this.calls.delete(conversationId);
    return Promise.resolve();
  }

  linkSocket(socketId: string, conversationId: number) {
    const set = this.sockets.get(socketId) ?? new Set<number>();
    set.add(conversationId);
    this.sockets.set(socketId, set);
    return Promise.resolve();
  }

  socketCalls(socketId: string) {
    return Promise.resolve([...(this.sockets.get(socketId) ?? [])]);
  }

  unlinkSocket(socketId: string) {
    this.sockets.delete(socketId);
    return Promise.resolve();
  }
}

export class RedisCallStore implements CallStore {
  constructor(private readonly redis: Redis) {}

  private key = (id: number) => `call:${id}`;
  private sockKey = (socketId: string) => `call-socket:${socketId}`;

  async get(conversationId: number) {
    const raw = await this.redis.get(this.key(conversationId));
    return raw ? deserialize(raw) : null;
  }

  async save(call: ActiveCall) {
    await this.redis.set(
      this.key(call.conversationId),
      serialize(call),
      'EX',
      CALL_TTL_SECONDS,
    );
  }

  async delete(conversationId: number) {
    await this.redis.del(this.key(conversationId));
  }

  async linkSocket(socketId: string, conversationId: number) {
    const key = this.sockKey(socketId);
    await this.redis
      .multi()
      .sadd(key, String(conversationId))
      .expire(key, CALL_TTL_SECONDS)
      .exec();
  }

  async socketCalls(socketId: string) {
    const ids = await this.redis.smembers(this.sockKey(socketId));
    return ids.map(Number).filter((n) => Number.isInteger(n));
  }

  async unlinkSocket(socketId: string) {
    await this.redis.del(this.sockKey(socketId));
  }
}
