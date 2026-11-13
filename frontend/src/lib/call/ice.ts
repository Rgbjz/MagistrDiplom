'use client';

import { clientApi } from '../api/client';
import { iceServers as fallbackIceServers } from './rtc';

/**
 * STUN/TURN servers for a call. The backend hands out short-lived TURN
 * credentials (provider keys never reach the browser); we keep them until
 * their TTL runs out. If the request fails or is slow, the call goes ahead
 * with STUN only — fine on most networks, only strict NATs need TURN.
 */
let cached: { servers: RTCIceServer[]; expiresAt: number } | null = null;

const TIMEOUT_MS = 2500;

export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.servers;
  try {
    const res = await Promise.race([
      clientApi<{ iceServers: RTCIceServer[]; ttl: number }>('/calls/ice-servers'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    if (!res.iceServers?.length) throw new Error('empty');
    // Renew a minute early so a call never starts with expiring credentials.
    cached = { servers: res.iceServers, expiresAt: Date.now() + Math.max(0, res.ttl - 60) * 1000 };
    return res.iceServers;
  } catch {
    return fallbackIceServers();
  }
}
