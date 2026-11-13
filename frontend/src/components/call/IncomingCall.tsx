'use client';

import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fileUrl } from '../../lib/format';
import type { CallRing } from '../../lib/call/rtc';
import { Avatar } from '../ui';
import styles from './call.module.scss';

export function IncomingCall({
  ring,
  onAccept,
  onDecline,
}: {
  ring: CallRing;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useTranslations('call.incoming');
  const acceptRef = useRef<HTMLButtonElement>(null);

  // Move focus to the primary action so keyboard users can answer at once.
  useEffect(() => {
    acceptRef.current?.focus();
  }, [ring.conversationId]);

  // Esc declines the call.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDecline();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDecline]);

  const audio = ring.media === 'audio';
  const KindIcon = audio ? Phone : Video;
  const kicker =
    ring.type === 'COURSE'
      ? t('onlineLesson')
      : audio
        ? t(ring.type === 'GROUP' ? 'groupAudioCall' : 'audioCall')
        : t(ring.type === 'GROUP' ? 'groupVideoCall' : 'videoCall');
  const sub =
    ring.type === 'COURSE'
      ? t('groupInvite', { title: ring.title ?? '' })
      : ring.type === 'GROUP'
        ? t('groupChatInvite', { title: ring.title ?? '' })
        : t('directCalling');
  return (
    <div className={styles.incomingBackdrop}>
      <div
        className={styles.incoming}
        role="alertdialog"
        aria-modal="false"
        aria-labelledby="incoming-call-title"
        aria-describedby="incoming-call-desc"
      >
        <div className={styles.incomingAvatarWrap} aria-hidden="true">
          <span className={styles.ring} />
          <span className={`${styles.ring} ${styles.ring2}`} />
          <span className={`${styles.ring} ${styles.ring3}`} />
          <span className={styles.incomingAvatar}>
            <Avatar src={fileUrl(ring.from.avatarUrl)} name={ring.from.name} size={96} />
          </span>
        </div>
        <p className={styles.incomingKicker}>
          <KindIcon size={14} aria-hidden="true" />
          {kicker}
        </p>
        <h2 id="incoming-call-title" className={styles.incomingName}>
          {ring.from.name}
        </h2>
        <p id="incoming-call-desc" className={styles.incomingSub}>
          {sub}
        </p>
        <div className={styles.incomingActions}>
          <button type="button" className={styles.action} onClick={onDecline}>
            <span className={`${styles.actionCircle} ${styles.declineCircle}`}>
              <PhoneOff size={26} aria-hidden="true" />
            </span>
            {t('decline')}
          </button>
          <button type="button" ref={acceptRef} className={styles.action} onClick={onAccept}>
            <span className={`${styles.actionCircle} ${styles.acceptCircle}`}>
              <KindIcon size={26} aria-hidden="true" />
            </span>
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
