'use client';

import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from './env';

let socket: Socket | null = null;
let socketUserId: number | null = null;

/** User id from the access token payload (the token itself is verified by the server). */
function tokenUserId(token: string): number | null {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { id?: number };
    return payload.id ?? null;
  } catch {
    return null;
  }
}

/**
 * One socket per signed-in user. A refreshed access token for the same user
 * only updates the handshake auth for future reconnects — tearing the socket
 * down would drop an ongoing video call every 15 minutes.
 */
export function getSocket(token: string): Socket {
  const userId = tokenUserId(token);
  if (socket && socketUserId === userId) {
    socket.auth = { token };
    return socket;
  }
  if (socket) socket.disconnect();
  // Polling fallback keeps chat working behind proxies and while a sleeping
  // Render instance wakes up; socket.io upgrades to WebSocket when it can.
  socket = io(API_ORIGIN, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  socketUserId = userId;
  return socket;
}
