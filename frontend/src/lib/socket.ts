'use client';

import { io, type Socket } from 'socket.io-client';

const BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
).replace(/\/api$/, '');

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(token: string): Socket {
  if (socket && socketToken === token) return socket;
  if (socket) socket.disconnect();
  socket = io(BASE, { auth: { token }, transports: ['websocket'] });
  socketToken = token;
  return socket;
}
