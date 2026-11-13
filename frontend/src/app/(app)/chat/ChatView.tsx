'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, SquarePen, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import type { Conversation } from '../../../lib/types';
import { ConversationList } from '../../../components/chat/ConversationList';
import { ChatThread } from '../../../components/chat/ChatThread';
import { NewGroupDialog, NewMessageDialog } from '../../../components/chat/GroupDialogs';
import { Button, EmptyState, Skeleton } from '../../../components/ui';
import styles from './chat.module.scss';

export function ChatView() {
  const t = useTranslations('chat');
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get('c');
  const [activeId, setActiveId] = useState<number | null>(initial ? Number(initial) : null);
  // On phones only one pane is visible: the list, or the open thread.
  const [mobileView, setMobileView] = useState<'list' | 'thread'>(initial ? 'thread' : 'list');
  const [newGroup, setNewGroup] = useState(false);
  const [newMessage, setNewMessage] = useState(false);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => clientApi<Conversation[]>('/chat/conversations'),
  });

  useEffect(() => {
    if (!activeId && conversations?.length) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  const t2 = useTranslations('chat.list');
  const dialog = (
    <>
      <NewGroupDialog
        open={newGroup}
        onClose={() => setNewGroup(false)}
        onCreated={(c) => {
          setNewGroup(false);
          select(c.id);
        }}
      />
      <NewMessageDialog
        open={newMessage}
        onClose={() => setNewMessage(false)}
        onOpened={(c) => {
          setNewMessage(false);
          select(c.id);
        }}
      />
    </>
  );

  /** After leaving a group: back to the list, open the first other chat. */
  function afterLeave() {
    setActiveId(null);
    setMobileView('list');
    router.replace('/chat', { scroll: false });
  }

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
          <p>{t('emptyGroupHint')}</p>
          <div className={styles.emptyActions}>
            <Button onClick={() => setNewMessage(true)}>
              <SquarePen size={16} aria-hidden="true" />
              {t2('newMessage')}
            </Button>
            <Button variant="outline" onClick={() => setNewGroup(true)}>
              <Users size={16} aria-hidden="true" />
              {t2('newGroup')}
            </Button>
          </div>
        </EmptyState>
        {dialog}
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
          onNewGroup={() => setNewGroup(true)}
          onNewMessage={() => setNewMessage(true)}
        />
        {active ? (
          <ChatThread
            key={active.id}
            conversation={active}
            onBack={() => setMobileView('list')}
            onLeft={afterLeave}
          />
        ) : (
          <div className={styles.emptyPane}>{t('selectConversation')}</div>
        )}
      </div>
      {dialog}
    </div>
  );
}
