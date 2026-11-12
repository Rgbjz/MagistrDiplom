'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { Socket } from 'socket.io-client';
import { getSocket } from '../../lib/socket';
import {
  callErrorKey,
  getLocalMedia,
  iceServers,
  type CallAck,
  type CallInfo,
  type CallRing,
  type CallType,
  type SignalData,
} from '../../lib/call/rtc';
import { startTone } from '../../lib/call/ringtone';
import type { SessionUser } from '../../lib/types';
import { useToast } from '../ui';
import { IncomingCall } from './IncomingCall';
import { CallEnded, CallWindow } from './CallWindow';

export interface RemotePeer {
  userId: number;
  name: string;
  stream: MediaStream | null;
  audio: boolean;
  video: boolean;
  screen: boolean;
  connection: RTCPeerConnectionState;
}

export interface CurrentCall {
  conversationId: number;
  title: string;
  type: CallType | null;
  /** 'calling' — waiting for somebody to answer; 'connected' — at least one peer. */
  phase: 'calling' | 'connected';
  connectedAt: number | null;
}

export interface LocalMedia {
  stream: MediaStream | null;
  audio: boolean;
  video: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  screen: boolean;
}

interface CallContextValue {
  current: CurrentCall | null;
  startCall: (conversationId: number, title: string) => Promise<void>;
  joinCall: (conversationId: number, title: string) => Promise<void>;
}

const CallContext = createContext<CallContextValue>({
  current: null,
  startCall: async () => {},
  joinCall: async () => {},
});

export function useCall() {
  return useContext(CallContext);
}

const NO_LOCAL: LocalMedia = {
  stream: null,
  audio: false,
  video: false,
  hasAudio: false,
  hasVideo: false,
  screen: false,
};

/**
 * WebRTC mesh calls. Keeps app-wide socket listeners (incoming calls ring on
 * any page), one RTCPeerConnection per remote participant, and renders the
 * incoming-call dialog and the call window. Signaling goes through the chat
 * Socket.IO gateway; the participant who joins later always sends the offers.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const toast = useToast();
  const t = useTranslations('call');
  // Socket handlers and media callbacks are long-lived; read the latest
  // translations through a ref instead of re-subscribing on locale change.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const queryClient = useQueryClient();
  const token = session?.accessToken;
  const me = session?.user as SessionUser | undefined;

  const [incoming, setIncoming] = useState<CallRing | null>(null);
  const [current, setCurrent] = useState<CurrentCall | null>(null);
  const [peers, setPeers] = useState<Record<number, RemotePeer>>({});
  const [local, setLocal] = useState<LocalMedia>(NO_LOCAL);
  // «Дзвінок завершено · 05:32» card shown briefly after a connected call.
  const [ended, setEnded] = useState<{ title: string; durationMs: number } | null>(null);
  const endedTimer = useRef<number | undefined>(undefined);
  const showEnded = useCallback((call: CurrentCall | null) => {
    if (!call?.connectedAt) return false;
    setEnded({ title: call.title, durationMs: Date.now() - call.connectedAt });
    window.clearTimeout(endedTimer.current);
    endedTimer.current = window.setTimeout(() => setEnded(null), 1800);
    return true;
  }, []);

  const socketRef = useRef<Socket | null>(null);
  const currentRef = useRef<CurrentCall | null>(null);
  const incomingRef = useRef<CallRing | null>(null);
  const pcs = useRef(new Map<number, RTCPeerConnection>());
  const remoteStreams = useRef(new Map<number, MediaStream>());
  const pendingIce = useRef(new Map<number, RTCIceCandidateInit[]>());
  const names = useRef(new Map<number, string>());
  const localStream = useRef<MediaStream | null>(null);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const meRef = useRef<number | null>(null);
  meRef.current = me?.id ?? null;

  const setCall = useCallback((next: CurrentCall | null) => {
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const setRing = useCallback((next: CallRing | null) => {
    incomingRef.current = next;
    setIncoming(next);
  }, []);

  const patchPeer = useCallback((userId: number, patch: Partial<RemotePeer>) => {
    setPeers((prev) => {
      const base: RemotePeer = prev[userId] ?? {
        userId,
        name: names.current.get(userId) ?? tRef.current('window.participant'),
        stream: null,
        audio: true,
        video: true,
        screen: false,
        connection: 'new',
      };
      return { ...prev, [userId]: { ...base, ...patch } };
    });
  }, []);

  const markConnected = useCallback(() => {
    const call = currentRef.current;
    if (call && call.phase !== 'connected') {
      setCall({ ...call, phase: 'connected', connectedAt: call.connectedAt ?? Date.now() });
    }
  }, [setCall]);

  const signal = useCallback((toUserId: number, data: SignalData) => {
    const call = currentRef.current;
    if (!call) return;
    socketRef.current?.emit('call:signal', {
      conversationId: call.conversationId,
      toUserId,
      data,
    });
  }, []);

  const closePeer = useCallback((userId: number) => {
    pcs.current.get(userId)?.close();
    pcs.current.delete(userId);
    remoteStreams.current.delete(userId);
    pendingIce.current.delete(userId);
    setPeers((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  /** Stops media and closes every connection; does not notify the server. */
  const cleanup = useCallback(() => {
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    remoteStreams.current.clear();
    pendingIce.current.clear();
    names.current.clear();
    localStream.current?.getTracks().forEach((t) => t.stop());
    screenTrack.current?.stop();
    localStream.current = null;
    cameraTrack.current = null;
    screenTrack.current = null;
    setPeers({});
    setLocal(NO_LOCAL);
    setCall(null);
  }, [setCall]);

  const addLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const stream = localStream.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      if (!pc.getSenders().some((s) => s.track === track)) pc.addTrack(track, stream);
    }
    // Keep sharing the screen with peers who join mid-share.
    if (screenTrack.current) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      void sender?.replaceTrack(screenTrack.current);
    }
  }, []);

  const createPeer = useCallback(
    (userId: number, asOfferer: boolean) => {
      pcs.current.get(userId)?.close();
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      pcs.current.set(userId, pc);
      if (asOfferer) {
        addLocalTracks(pc);
        // Still receive what we can't send (audio-only or no devices).
        const kinds = new Set(pc.getSenders().map((s) => s.track?.kind));
        if (!kinds.has('audio')) pc.addTransceiver('audio', { direction: 'recvonly' });
        if (!kinds.has('video')) pc.addTransceiver('video', { direction: 'recvonly' });
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) signal(userId, { candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        let stream = remoteStreams.current.get(userId);
        if (!stream) {
          stream = new MediaStream();
          remoteStreams.current.set(userId, stream);
        }
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
        // New object so React re-attaches it to the <video>.
        patchPeer(userId, { stream: new MediaStream(stream.getTracks()) });
        markConnected();
      };
      pc.onconnectionstatechange = () => patchPeer(userId, { connection: pc.connectionState });
      patchPeer(userId, { connection: pc.connectionState });
      return pc;
    },
    [addLocalTracks, markConnected, patchPeer, signal],
  );

  const flushIce = useCallback(async (userId: number) => {
    const pc = pcs.current.get(userId);
    const queued = pendingIce.current.get(userId) ?? [];
    pendingIce.current.delete(userId);
    for (const c of queued) {
      try {
        await pc?.addIceCandidate(c);
      } catch {
        /* stale candidate */
      }
    }
  }, []);

  const offerTo = useCallback(
    async (userId: number) => {
      const pc = createPeer(userId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal(userId, { type: 'offer', sdp: offer.sdp ?? '' });
    },
    [createPeer, signal],
  );

  const onSignal = useCallback(
    async (msg: { conversationId: number; fromUserId: number; data: SignalData }) => {
      if (currentRef.current?.conversationId !== msg.conversationId) return;
      const from = msg.fromUserId;
      const data = msg.data;
      try {
        if ('type' in data && data.type === 'offer') {
          const pc = pcs.current.get(from) ?? createPeer(from, false);
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          addLocalTracks(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signal(from, { type: 'answer', sdp: answer.sdp ?? '' });
          await flushIce(from);
        } else if ('type' in data && data.type === 'answer') {
          const pc = pcs.current.get(from);
          if (pc && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
            await flushIce(from);
          }
        } else if ('candidate' in data) {
          const pc = pcs.current.get(from);
          if (pc?.remoteDescription) {
            await pc.addIceCandidate(data.candidate).catch(() => {});
          } else {
            const list = pendingIce.current.get(from) ?? [];
            list.push(data.candidate);
            pendingIce.current.set(from, list);
          }
        }
      } catch (err) {
        console.warn('[call] signaling failed', err);
      }
    },
    [addLocalTracks, createPeer, flushIce, signal],
  );

  const prepareMedia = useCallback(async () => {
    const { stream, notice } = await getLocalMedia();
    localStream.current = stream;
    cameraTrack.current = stream.getVideoTracks()[0] ?? null;
    setLocal({
      stream,
      audio: stream.getAudioTracks().length > 0,
      video: stream.getVideoTracks().length > 0,
      hasAudio: stream.getAudioTracks().length > 0,
      hasVideo: stream.getVideoTracks().length > 0,
      screen: false,
    });
    if (notice) toast(tRef.current(`media.${notice}`), 'error');
  }, [toast]);

  /** Shared tail of start/join: register existing participants and offer to them. */
  const enterCall = useCallback(
    async (event: 'call:start' | 'call:join', conversationId: number, title: string) => {
      const socket = socketRef.current;
      if (!socket) {
        toast(tRef.current('errors.noServer'), 'error');
        return;
      }
      if (currentRef.current) {
        toast(tRef.current('errors.alreadyInCall'), 'error');
        return;
      }
      // Joining from the chat banner also answers a pending ring for this call.
      if (incomingRef.current?.conversationId === conversationId) setRing(null);
      setCall({ conversationId, title, type: null, phase: 'calling', connectedAt: null });
      await prepareMedia();
      if (!currentRef.current) return; // hung up while asking for permissions
      const ack = await new Promise<CallAck>((resolve) => {
        socket.timeout(10_000).emit(event, { conversationId }, (err: unknown, res: CallAck) =>
          resolve(err ? { ok: false, error: 'TIMEOUT' } : res),
        );
      });
      if (!ack?.ok || !ack.call) {
        toast(tRef.current(`errors.${callErrorKey(ack?.error)}`), 'error');
        cleanup();
        return;
      }
      const info: CallInfo = ack.call;
      const others = info.participants.filter((p) => p.userId !== meRef.current);
      setCall({
        conversationId,
        title,
        type: info.type,
        phase: others.length ? 'connected' : 'calling',
        connectedAt: others.length ? Date.now() : null,
      });
      for (const p of others) {
        names.current.set(p.userId, p.name);
        patchPeer(p.userId, { name: p.name, audio: p.audio, video: p.video });
        await offerTo(p.userId);
      }
      void queryClient.invalidateQueries({ queryKey: ['call', conversationId] });
    },
    [cleanup, offerTo, patchPeer, prepareMedia, queryClient, setCall, setRing, toast],
  );

  const startCall = useCallback(
    (conversationId: number, title: string) => enterCall('call:start', conversationId, title),
    [enterCall],
  );
  const joinCall = useCallback(
    (conversationId: number, title: string) => enterCall('call:join', conversationId, title),
    [enterCall],
  );

  const hangUp = useCallback(() => {
    const call = currentRef.current;
    if (call) socketRef.current?.emit('call:leave', { conversationId: call.conversationId });
    showEnded(call);
    cleanup();
    if (call) {
      // The server processes call:leave asynchronously: refresh now and once
      // more shortly after, so the «ongoing call» banner doesn't linger.
      const key = ['call', call.conversationId];
      if (call.type === 'DIRECT') queryClient.setQueryData(key, null);
      void queryClient.invalidateQueries({ queryKey: key });
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: key }), 1500);
    }
  }, [cleanup, queryClient, showEnded]);

  const acceptIncoming = useCallback(() => {
    const ring = incomingRef.current;
    if (!ring) return;
    setRing(null);
    void joinCall(ring.conversationId, ring.title ?? ring.from.name);
  }, [joinCall, setRing]);

  const declineIncoming = useCallback(() => {
    const ring = incomingRef.current;
    if (!ring) return;
    socketRef.current?.emit('call:decline', { conversationId: ring.conversationId });
    setRing(null);
  }, [setRing]);

  // ----- media controls
  const sendState = useCallback((state: { audio?: boolean; video?: boolean; screen?: boolean }) => {
    const call = currentRef.current;
    if (call) socketRef.current?.emit('call:state', { conversationId: call.conversationId, ...state });
  }, []);

  const toggleAudio = useCallback(() => {
    const tracks = localStream.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = enabled));
    setLocal((l) => ({ ...l, audio: enabled }));
    sendState({ audio: enabled });
  }, [sendState]);

  const toggleVideo = useCallback(() => {
    const track = cameraTrack.current;
    if (!track) return;
    track.enabled = !track.enabled;
    setLocal((l) => ({ ...l, video: track.enabled }));
    sendState({ video: track.enabled });
  }, [sendState]);

  const stopScreenShare = useCallback(async () => {
    const screen = screenTrack.current;
    if (!screen) return;
    screenTrack.current = null;
    screen.stop();
    for (const pc of pcs.current.values()) {
      const sender = pc.getSenders().find((s) => s.track === screen || s.track?.kind === 'video');
      await sender?.replaceTrack(cameraTrack.current);
    }
    setLocal((l) => ({ ...l, stream: localStream.current, screen: false }));
    sendState({ screen: false });
  }, [sendState]);

  const toggleScreen = useCallback(async () => {
    if (screenTrack.current) {
      await stopScreenShare();
      return;
    }
    if (!cameraTrack.current) {
      toast(tRef.current('errors.screenNeedsCamera'), 'error');
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      screenTrack.current = track;
      track.onended = () => void stopScreenShare();
      for (const pc of pcs.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        await sender?.replaceTrack(track);
      }
      const preview = new MediaStream([track, ...(localStream.current?.getAudioTracks() ?? [])]);
      setLocal((l) => ({ ...l, stream: preview, screen: true }));
      sendState({ screen: true });
    } catch {
      /* the user closed the picker */
    }
  }, [sendState, stopScreenShare, toast]);

  // ----- socket listeners (app-wide)
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;

    const onRing = (ring: CallRing) => {
      if (currentRef.current) return; // busy: keep the current call
      setRing(ring);
      void queryClient.invalidateQueries({ queryKey: ['call', ring.conversationId] });
    };
    const onEnded = ({ conversationId }: { conversationId: number }) => {
      if (incomingRef.current?.conversationId === conversationId) setRing(null);
      if (currentRef.current?.conversationId === conversationId) {
        if (!showEnded(currentRef.current)) toast(tRef.current('toast.ended'));
        cleanup();
      }
      queryClient.setQueryData(['call', conversationId], null);
      void queryClient.invalidateQueries({ queryKey: ['call', conversationId] });
    };
    const onPeerJoined = (p: { conversationId: number; userId: number; name: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['call', p.conversationId] });
      if (currentRef.current?.conversationId !== p.conversationId) return;
      names.current.set(p.userId, p.name);
      patchPeer(p.userId, { name: p.name });
      markConnected();
    };
    const onPeerLeft = (p: { conversationId: number; userId: number }) => {
      void queryClient.invalidateQueries({ queryKey: ['call', p.conversationId] });
      if (currentRef.current?.conversationId !== p.conversationId) return;
      closePeer(p.userId);
    };
    const onDeclined = (p: { conversationId: number; userId: number }) => {
      void queryClient.invalidateQueries({ queryKey: ['call', p.conversationId] });
      const call = currentRef.current;
      if (call?.conversationId === p.conversationId && call.type === 'DIRECT') {
        toast(tRef.current('toast.declined'), 'error');
      }
    };
    const onState = (p: {
      conversationId: number;
      userId: number;
      audio?: boolean;
      video?: boolean;
      screen?: boolean;
    }) => {
      if (currentRef.current?.conversationId !== p.conversationId) return;
      const patch: Partial<RemotePeer> = {};
      if (typeof p.audio === 'boolean') patch.audio = p.audio;
      if (typeof p.video === 'boolean') patch.video = p.video;
      if (typeof p.screen === 'boolean') patch.screen = p.screen;
      patchPeer(p.userId, patch);
    };
    const onSignalEvent = (msg: { conversationId: number; fromUserId: number; data: SignalData }) =>
      void onSignal(msg);

    socket.on('call:ring', onRing);
    socket.on('call:ended', onEnded);
    socket.on('call:peer-joined', onPeerJoined);
    socket.on('call:peer-left', onPeerLeft);
    socket.on('call:declined', onDeclined);
    socket.on('call:state', onState);
    socket.on('call:signal', onSignalEvent);
    return () => {
      socket.off('call:ring', onRing);
      socket.off('call:ended', onEnded);
      socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:peer-left', onPeerLeft);
      socket.off('call:declined', onDeclined);
      socket.off('call:state', onState);
      socket.off('call:signal', onSignalEvent);
    };
  }, [token, cleanup, closePeer, markConnected, onSignal, patchPeer, queryClient, setRing, showEnded, toast]);

  // Signed out mid-call, or the provider unmounts: release camera and peers.
  useEffect(() => {
    if (!token && currentRef.current) cleanup();
  }, [token, cleanup]);
  useEffect(
    () => () => {
      const call = currentRef.current;
      if (call) socketRef.current?.emit('call:leave', { conversationId: call.conversationId });
      cleanup();
    },
    [cleanup],
  );

  // Ring for incoming calls; ringback while our own call isn't answered yet.
  const ringing = incoming ? 'incoming' : current?.phase === 'calling' ? 'outgoing' : null;
  useEffect(() => {
    if (!ringing) return;
    return startTone(ringing);
  }, [ringing]);

  const value = useMemo(() => ({ current, startCall, joinCall }), [current, startCall, joinCall]);

  return (
    <CallContext.Provider value={value}>
      {children}
      {incoming && !current && (
        <IncomingCall ring={incoming} onAccept={acceptIncoming} onDecline={declineIncoming} />
      )}
      {ended && !current && <CallEnded title={ended.title} durationMs={ended.durationMs} />}
      {current && (
        <CallWindow
          call={current}
          local={local}
          peers={Object.values(peers)}
          myName={t('window.me')}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreen={() => void toggleScreen()}
          onHangUp={hangUp}
        />
      )}
    </CallContext.Provider>
  );
}
