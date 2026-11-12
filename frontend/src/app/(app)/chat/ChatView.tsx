'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import type { Conversation } from '../../../lib/types';
import { ConversationList } from '../../../components/chat/ConversationList';
import { ChatThread } from '../../../components/chat/ChatThread';
import { EmptyState, Skeleton } from '../../../components/ui';
import styles from './chat.module.scss';

export function ChatView() {
  const t = useTranslations('chat');
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get('c');
  const [activeId, setActiveId] = useState<number | null>(initial ? Number(initial) : null);
  // On phones only one pane is visible: the list, or the open thread.
  const [mobileView, setMobileView] = useState<'list' | 'thread'>(initial ? 'thread' : 'list');

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => clientApi<Conversation[]>('/chat/conversations'),
  });

  useEffect(() => {
    if (!activeId && conversations?.length) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  function select(id: number) {
    setActiveId(id);
    setMobileView('thread');
    router.replace(`/chat?c=${id}`, { scroll: false });
  }

  const active = conversations?.find((c) => c.id === activeId) ?? null;

  if (isLoading) {
    return (
      <div className="container">
        <Skeleton height={560} radius="var(--radius-lg)" />
      </div>
    );
  }

  if (!conversations?.length) {
    return (
      <div className="container">
        <EmptyState icon={<MessageCircle size={28} />} title={t('empty')}>
          <p>{t('emptyText')}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={`container ${styles.container}`}>
      <div className={styles.page} data-view={mobileView}>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={select}
        />
        {active ? (
          <ChatThread
            key={active.id}
            conversation={active}
            onBack={() => setMobileView('list')}
          />
        ) : (
          <div className={styles.emptyPane}>{t('selectConversation')}</div>
        )}
      </div>
    </div>
  );
}
