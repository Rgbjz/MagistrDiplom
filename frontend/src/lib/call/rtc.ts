'use client';

export type CallType = 'COURSE' | 'DIRECT' | 'GROUP';

/** Kind of call the caller started: voice only or with video. */
export type CallMedia = 'audio' | 'video';

export interface CallParticipantInfo {
  userId: number;
  name: string;
  audio: boolean;
  video: boolean;
}

export interface CallInfo {
  conversationId: number;
  type: CallType;
  media: CallMedia;
  initiatorId: number;
  startedAt: string;
  connectedAt: string | null;
  participants: CallParticipantInfo[];
}

export interface CallRing {
  conversationId: number;
  type: CallType;
  media: CallMedia;
  title: string | null;
  from: { id: number; name: string; avatarUrl: string | null };
}

/** SDP/ICE payload relayed through `call:signal`. */
export type SignalData =
  | { type: 'offer' | 'answer'; sdp: string }
  | { candidate: RTCIceCandidateInit };

export interface CallAck {
  ok: boolean;
  error?: string;
  created?: boolean;
  call?: CallInfo | null;
}

/**
 * Public Google STUN finds the public address of each peer; a TURN relay
 * (optional, via env) is needed when both peers sit behind symmetric NATs —
 * typical for mobile networks and corporate Wi-Fi.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(',').map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

/** Key in the `call.media` messages describing a degraded media setup. */
export type MediaNotice = 'notSupported' | 'audioOnly' | 'denied' | 'unavailable';
export type MediaResult = { stream: MediaStream; notice: MediaNotice | null };

/** Camera + mic; falls back to audio only, then to receive-only. */
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user',
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true };

/**
 * Media for entering a call. `withVideo: false` (audio call) asks for the
 * microphone only, so the browser doesn't prompt for or light the camera.
 */
export async function getLocalMedia(withVideo = true): Promise<MediaResult> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) {
    return { stream: new MediaStream(), notice: 'notSupported' };
  }
  if (!withVideo) {
    try {
      return { stream: await md.getUserMedia({ audio: AUDIO_CONSTRAINTS }), notice: null };
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      return { stream: new MediaStream(), notice: denied ? 'denied' : 'unavailable' };
    }
  }
  try {
    const stream = await md.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: VIDEO_CONSTRAINTS,
    });
    return { stream, notice: null };
  } catch {
    try {
      const stream = await md.getUserMedia({ audio: true });
      return { stream, notice: 'audioOnly' };
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      return {
        stream: new MediaStream(),
        notice: denied ? 'denied' : 'unavailable',
      };
    }
  }
}

/** Camera only — for turning the camera on mid-call after an audio-only start. */
export async function getCamera(): Promise<
  | { track: MediaStreamTrack; error?: never }
  | { track?: never; error: 'cameraDenied' | 'cameraNotFound' | 'cameraUnavailable' }
> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
    return { track: stream.getVideoTracks()[0] };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError') return { error: 'cameraDenied' };
    // No camera at all: lid closed, camera hung in the OS, USB camera unplugged.
    if (name === 'NotFoundError') return { error: 'cameraNotFound' };
    return { error: 'cameraUnavailable' };
  }
}

export function canShareScreen(): boolean {
  if (typeof navigator === 'undefined') return false;
  const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return !!md?.getDisplayMedia && !mobile;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Server error code → key in the `call.errors` messages. */
export function callErrorKey(code?: string): 'full' | 'ended' | 'forbidden' | 'notFound' | 'generic' {
  switch (code) {
    case 'CALL_FULL':
      return 'full';
    case 'NO_CALL':
      return 'ended';
    case 'FORBIDDEN':
      return 'forbidden';
    case 'NOT_FOUND':
      return 'notFound';
    default:
      return 'generic';
  }
}
