'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LessonVideo } from '../../lib/types';
import styles from './video.module.scss';

type HlsInstance = import('hls.js').default;

/**
 * Plays an uploaded lesson video: HLS via hls.js (native on Safari/iOS),
 * with a quality picker; falls back to the progressive MP4 if streaming
 * fails or isn't available.
 */
export function VideoPlayer({
  video,
  title,
  compact = false,
}: {
  video: LessonVideo;
  title: string;
  compact?: boolean;
}) {
  const t = useTranslations('video.player');
  const ref = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  // hls.js level indexes with their heights, highest quality first.
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [fallback, setFallback] = useState(false);
  const selectId = useId();

  const hlsUrl = video.status === 'READY' ? video.hlsUrl : null;
  const mp4 = video.status === 'READY' ? video.mp4FallbackUrl : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLevels([]);
    setLevel(-1);
    setFallback(false);
    let cancelled = false;

    const playMp4 = () => {
      if (mp4) {
        el.src = mp4;
        setFallback(!!hlsUrl);
      }
    };

    if (!hlsUrl) {
      playMp4();
      return;
    }
    // hls.js wherever Media Source Extensions exist (it gives the quality
    // menu); otherwise native HLS (older iOS Safari), otherwise plain MP4.
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.src = hlsUrl;
          el.onerror = () => {
            el.onerror = null;
            playMp4();
          };
        } else {
          playMp4();
        }
        return;
      }
      const hls = new Hls({ capLevelToPlayerSize: true });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(
          data.levels
            .map((l, index) => ({ index, height: l.height }))
            .filter((l) => l.height)
            .sort((a, b) => b.height - a.height),
        );
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        hls.destroy();
        hlsRef.current = null;
        setLevels([]);
        playMp4();
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(el);
    });
    return () => {
      cancelled = true;
      el.onerror = null;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
    // Signed URLs change hourly; reload only when the video itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.status, hlsUrl === null, mp4 === null]);

  if (video.status !== 'READY') {
    return (
      <div className={`${styles.frame} ${styles.placeholder}`} role="status">
        {video.status === 'FAILED' ? t('failed') : t('processing')}
      </div>
    );
  }

  return (
    <div className={styles.player}>
      <div className={`${styles.frame} ${compact ? styles.compact : ''}`}>
        <video
          ref={ref}
          controls
          playsInline
          preload="metadata"
          poster={video.posterUrl ?? undefined}
          aria-label={t('label', { title })}
          className={styles.video}
        />
      </div>
      {(levels.length > 1 || fallback) && (
        <div className={styles.toolbar}>
          {fallback && <span className={styles.notice}>{t('fallback')}</span>}
          {levels.length > 1 && (
            <label className={styles.quality} htmlFor={selectId}>
              {t('quality')}
              <select
                id={selectId}
                value={level}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setLevel(next);
                  if (hlsRef.current) hlsRef.current.currentLevel = next;
                }}
              >
                <option value={-1}>{t('auto')}</option>
                {levels.map((l) => (
                  <option key={l.index} value={l.index}>
                    {l.height}p
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
