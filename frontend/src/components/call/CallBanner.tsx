'use client';

import { useQuery } from '@tanstack/react-query';
import { Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import type { CallInfo } from '../../lib/call/rtc';
import { useCall } from './CallProvider';
import styles from './call.module.scss';

/** «Join the ongoing call» strip shown on top of a chat thread. */
export function CallBanner({ conversationId, title }: { conversationId: number; title: string }) {
  const t = useTranslations('call.banner');
  const { current, joinCall } = useCall();
  const { data } = useQuery({
    queryKey: ['call', conversationId],
    queryFn: () => clientApi<CallInfo | null>(`/chat/conversations/${conversationId}/call`),
    // Poll quickly only while a call is running (to notice its end), slowly otherwise.
    refetchInterval: (q) => (q.state.data?.participants.length ? 4_000 : 15_000),
  });

  if (!data || data.participants.length === 0) return null;
  if (current?.conversationId === conversationId) return null;
  const n = data.participants.length;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.bannerText}>
        <span className={styles.liveDot} aria-hidden="true" />
        {t('ongoing', { count: n })}
      </span>
      <button
        type="button"
        className={styles.joinBtn}
        onClick={() => void joinCall(conversationId, title)}
        disabled={!!current}
      >
        <Video size={16} aria-hidden="true" />
        {t('join')}
      </button>
    </div>
  );
}
