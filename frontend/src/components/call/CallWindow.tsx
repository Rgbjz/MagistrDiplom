'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
  VideoOff,
  WifiOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { initials } from '../../lib/format';
import { canShareScreen, formatDuration } from '../../lib/call/rtc';
import type { CurrentCall, LocalMedia, RemotePeer } from './CallProvider';
import styles from './call.module.scss';

/** Attaches a MediaStream to a <video> element. */
function useStream(stream: MediaStream | null) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);
  return ref;
}

/** «Онлайн-заняття» for course calls, otherwise «Аудіодзвінок»/«Відеодзвінок». */
function callKindKey(call: CurrentCall): 'onlineLesson' | 'audioCall' | 'videoCall' {
  if (call.type === 'COURSE') return 'onlineLesson';
  return call.media === 'audio' ? 'audioCall' : 'videoCall';
}

function hasVideo(stream: MediaStream | null, on: boolean) {
  return !!stream && on && stream.getVideoTracks().length > 0;
}

/** A remote participant: video letterboxed (never cropped) or an avatar when the camera is off. */
function RemoteTile({
  peer,
  status,
  style,
}: {
  peer: RemotePeer;
  status: string | null;
  style?: React.CSSProperties;
}) {
  const t = useTranslations('call.window');
  const ref = useStream(peer.stream);
  const showVideo = hasVideo(peer.stream, peer.video || peer.screen);
  return (
    <figure className={styles.tile} style={style} aria-label={t('peerVideo', { name: peer.name })}>
      <video
        ref={ref}
        autoPlay
        playsInline
        data-peer={peer.userId}
        className={`${styles.video} ${showVideo ? '' : styles.hiddenVideo}`}
      />
      {!showVideo && (
        <div className={styles.placeholder} aria-hidden="true">
          <span className={styles.bigAvatar}>{initials(peer.name)}</span>
          <span className={styles.placeholderName}>{peer.name}</span>
        </div>
      )}
      <figcaption className={styles.tileLabel}>
        {!peer.audio && (
          <span className={styles.mutedIcon} role="img" aria-label={t('micOff')}>
            <MicOff size={14} aria-hidden="true" />
          </span>
        )}
        {!peer.video && !peer.screen && (
          <span className={styles.mutedIcon} role="img" aria-label={t('cameraOff')}>
            <VideoOff size={14} aria-hidden="true" />
          </span>
        )}
        {peer.screen && <MonitorUp size={14} aria-hidden="true" />}
        <span className={styles.tileName}>{peer.name}</span>
      </figcaption>
      {status && <span className={styles.tileStatus}>{status}</span>}
    </figure>
  );
}

/** Your own camera as a regular grid tile (group calls). */
function LocalTile({
  local,
  name,
  avatarName,
  style,
}: {
  local: LocalMedia;
  name: string;
  avatarName: string;
  style: React.CSSProperties;
}) {
  const t = useTranslations('call.window');
  const ref = useStream(local.stream);
  const showVideo = hasVideo(local.stream, local.video || local.screen);
  return (
    <figure className={styles.tile} style={style} aria-label={t('yourVideo')}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        data-local="true"
        className={`${styles.video} ${local.screen ? '' : styles.mirrored} ${showVideo ? '' : styles.hiddenVideo}`}
      />
      {!showVideo && (
        <div className={styles.placeholder} aria-hidden="true">
          <span className={styles.bigAvatar}>{initials(avatarName)}</span>
        </div>
      )}
      <figcaption className={styles.tileLabel}>
        {!local.audio && (
          <span className={styles.mutedIcon} role="img" aria-label={t('micOff')}>
            <MicOff size={14} aria-hidden="true" />
          </span>
        )}
        <span className={styles.tileName}>{name}</span>
      </figcaption>
    </figure>
  );
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Your own camera as a small picture-in-picture; drag it to any corner. */
function SelfView({ local, avatarName }: { local: LocalMedia; avatarName: string }) {
  const t = useTranslations('call.window');
  const ref = useStream(local.stream);
  const [corner, setCorner] = useState<Corner>('br');
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const showVideo = hasVideo(local.stream, local.video || local.screen);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.px;
    const dy = e.clientY - start.current.py;
    if (Math.abs(dx) + Math.abs(dy) > 6) start.current.moved = true;
    if (start.current.moved) setDrag({ x: dx, y: dy });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    const stage = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if (!s || !stage) return;
    if (!s.moved) {
      // A tap moves it to the opposite side.
      setCorner((c) => (c[1] === 'r' ? `${c[0]}l` : `${c[0]}r`) as Corner);
      return;
    }
    const left = e.clientX < stage.left + stage.width / 2;
    const top = e.clientY < stage.top + stage.height / 2;
    setCorner(`${top ? 't' : 'b'}${left ? 'l' : 'r'}` as Corner);
  };

  return (
    <figure
      className={`${styles.self} ${styles[`self_${corner}`]} ${drag ? styles.selfDragging : ''}`}
      style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
      aria-label={t('yourVideo')}
      title={t('moveSelfView')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        setDrag(null);
      }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        data-local="true"
        className={`${styles.selfVideo} ${local.screen ? '' : styles.mirrored} ${showVideo ? '' : styles.hiddenVideo}`}
      />
      {!showVideo && (
        <div className={styles.placeholder} aria-hidden="true">
          <span className={styles.smallAvatar}>{initials(avatarName)}</span>
        </div>
      )}
      {!local.audio && (
        <span className={styles.selfMuted} role="img" aria-label={t('micOff')}>
          <MicOff size={12} aria-hidden="true" />
        </span>
      )}
    </figure>
  );
}

/** Columns that give the biggest 16:9 tiles for `n` tiles in a `w × h` stage. */
function bestGrid(n: number, w: number, h: number, gap: number) {
  let best = { cols: 1, tileW: 0, tileH: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const maxW = (w - gap * (cols - 1)) / cols;
    const maxH = (h - gap * (rows - 1)) / rows;
    const tileW = Math.min(maxW, (maxH * 16) / 9);
    if (tileW > best.tileW) best = { cols, tileW, tileH: (tileW * 9) / 16 };
  }
  return best;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Waiting for the other side: your camera blurred behind a pulsing avatar. */
function CallingScreen({
  call,
  local,
  status,
  joined,
}: {
  call: CurrentCall;
  local: LocalMedia;
  status: string;
  joined: number;
}) {
  const t = useTranslations('call.window');
  const ref = useStream(local.stream);
  const showVideo = hasVideo(local.stream, local.video);
  const group = call.type === 'COURSE' || call.type === 'GROUP';
  return (
    <div className={styles.calling}>
      {showVideo && (
        <video ref={ref} autoPlay playsInline muted className={`${styles.callingBg} ${styles.mirrored}`} />
      )}
      <div className={styles.callingShade} aria-hidden="true" />
      <div className={styles.callingCenter}>
        <div className={styles.ringWrap} aria-hidden="true">
          <span className={styles.ring} />
          <span className={`${styles.ring} ${styles.ring2}`} />
          <span className={`${styles.ring} ${styles.ring3}`} />
          <span className={styles.callingAvatar}>
            {group ? <Users size={44} aria-hidden="true" /> : initials(call.title)}
          </span>
        </div>
        <p className={styles.callingName}>{call.title}</p>
        <p className={styles.callingStatus} role="status" aria-live="polite">
          {status.replace(/…$/, '')}
          <span className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </p>
        {group && <p className={styles.callingSub}>{t('joinedCount', { count: joined })}</p>}
      </div>
    </div>
  );
}

function peerStatus(p: RemotePeer): 'offline' | 'connecting' | null {
  if (p.connection === 'failed' || p.connection === 'disconnected') return 'offline';
  if (!p.stream) return 'connecting';
  return null;
}

export function CallWindow({
  call,
  local,
  peers,
  myName,
  myAvatarName,
  onToggleAudio,
  onToggleVideo,
  onToggleScreen,
  onHangUp,
}: {
  call: CurrentCall;
  local: LocalMedia;
  peers: RemotePeer[];
  myName: string;
  /** Your real name: initials on your tile while the camera is off («Ви» is only the caption). */
  myAvatarName: string;
  onToggleAudio: () => void;
  onToggleVideo: () => void | Promise<void>;
  onToggleScreen: () => void;
  onHangUp: () => void;
}) {
  const t = useTranslations('call.window');
  const hangUpRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [screenSupported, setScreenSupported] = useState(false);
  const [stageRef, stage] = useSize<HTMLDivElement>();

  useEffect(() => {
    setScreenSupported(canShareScreen());
    hangUpRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!call.connectedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [call.connectedAt]);

  const offline = peers.some((p) => p.connection === 'failed' || p.connection === 'disconnected');
  const withMedia = peers.filter((p) => p.stream);
  // Until somebody's media arrives we show the calling / connecting screen.
  const waiting = call.phase === 'calling' || withMedia.length === 0;
  const status = offline
    ? t('offline')
    : call.phase === 'calling'
      ? call.type === 'COURSE' || call.type === 'GROUP'
        ? t('waitingParticipants')
        : t('waitingAnswer')
      : withMedia.length < peers.length || withMedia.length === 0
        ? t('connecting')
        : null;

  const tileStatus = (p: RemotePeer) => {
    const s = peerStatus(p);
    return s ? t(s) : null;
  };

  const gap = 10;
  const group = peers.length > 1;
  const grid = bestGrid(peers.length + 1, stage.w - 24, stage.h - 24, gap);
  const tileStyle = { width: grid.tileW, height: grid.tileH, flex: 'none' } as const;

  return (
    <div className={styles.overlay}>
      <section
        className={styles.window}
        role="dialog"
        aria-modal="true"
        aria-label={t(call.media === 'audio' ? 'audioLabel' : 'label', { title: call.title })}
      >
        <header className={styles.head}>
          <div className={styles.headText}>
            <span className={styles.headTitle}>{call.title}</span>
            <span className={styles.headSub}>
              {call.connectedAt ? (
                <span role="timer" aria-label={t('duration')} className={styles.timer}>
                  {formatDuration(now - call.connectedAt)}
                </span>
              ) : (
                <span>{t(callKindKey(call))}</span>
              )}
              {(call.type === 'COURSE' || call.type === 'GROUP') && (
                <span>{t('participants', { count: peers.length + 1 })}</span>
              )}
            </span>
          </div>
          <span role="status" aria-live="polite">
            {status && !waiting && (
              <span className={`${styles.badge} ${offline ? styles.badgeBad : ''}`}>
                {offline && <WifiOff size={14} aria-hidden="true" />}
                {status}
              </span>
            )}
          </span>
        </header>

        <div ref={stageRef} className={styles.stage}>
          {waiting ? (
            <CallingScreen
              call={call}
              local={local}
              status={status ?? t('connecting')}
              joined={peers.length + 1}
            />
          ) : peers.length === 1 ? (
            <RemoteTile peer={peers[0]} status={tileStatus(peers[0])} />
          ) : (
            <div className={styles.grid} style={{ gap }}>
              {peers.map((p) => (
                <RemoteTile
                  key={p.userId}
                  peer={p}
                  status={tileStatus(p)}
                  style={tileStyle}
                />
              ))}
              <LocalTile local={local} name={myName} avatarName={myAvatarName} style={tileStyle} />
            </div>
          )}
          {!waiting && !group && <SelfView local={local} avatarName={myAvatarName} />}
        </div>

        <div className={styles.controls} role="toolbar" aria-label={t('controls')}>
          <button
            type="button"
            className={`${styles.ctrl} ${!local.audio ? styles.ctrlOff : ''}`}
            onClick={onToggleAudio}
            disabled={!local.hasAudio}
            aria-pressed={!local.audio}
            aria-label={t('muteMic')}
            title={local.audio ? t('muteMic') : t('unmuteMic')}
          >
            {local.audio ? <Mic size={22} aria-hidden="true" /> : <MicOff size={22} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={`${styles.ctrl} ${!local.video ? styles.ctrlOff : ''}`}
            onClick={onToggleVideo}
            aria-pressed={!local.video}
            aria-label={t('muteCamera')}
            title={local.video ? t('muteCamera') : t('unmuteCamera')}
          >
            {local.video ? <Video size={22} aria-hidden="true" /> : <VideoOff size={22} aria-hidden="true" />}
          </button>
          {screenSupported && !waiting && (
            <button
              type="button"
              className={`${styles.ctrl} ${local.screen ? styles.ctrlActive : ''}`}
              onClick={onToggleScreen}
              aria-pressed={local.screen}
              aria-label={t('screenShare')}
              title={local.screen ? t('stopScreenShare') : t('startScreenShare')}
            >
              <MonitorUp size={22} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            ref={hangUpRef}
            className={`${styles.ctrl} ${styles.hangUp}`}
            onClick={onHangUp}
            aria-label={waiting && call.phase === 'calling' ? t('cancel') : t('hangUp')}
            title={waiting && call.phase === 'calling' ? t('cancel') : t('hangUp')}
          >
            <PhoneOff size={22} aria-hidden="true" />
            {waiting && call.phase === 'calling' && <span className={styles.hangUpLabel}>{t('cancel')}</span>}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Short «Дзвінок завершено · 05:32» screen after a call; doesn't block the page. */
export function CallEnded({ title, durationMs }: { title: string; durationMs: number }) {
  const t = useTranslations('call.window');
  return (
    <div className={styles.endedWrap} role="status" aria-live="polite">
      <div className={styles.endedCard}>
        <span className={styles.endedIcon} aria-hidden="true">
          <PhoneOff size={22} />
        </span>
        <span className={styles.endedTitle}>{t('endedWith', { duration: formatDuration(durationMs) })}</span>
        <span className={styles.endedSub}>{title}</span>
      </div>
    </div>
  );
}
