'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { clientApi } from '../../../lib/api/client';
import type { Conversation } from '../../../lib/types';
import { ConversationList } from '../../../components/chat/ConversationList';
import { ChatThread } from '../../../components/chat/ChatThread';
import styles from './chat.module.scss';

export function ChatView() {
  const searchParams = useSearchParams();
  const initial = searchParams.get('c');
  const [activeId, setActiveId] = useState<number | null>(
    initial ? Number(initial) : null,
  );

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => clientApi<Conversation[]>('/chat/conversations'),
  });

  useEffect(() => {
    if (!activeId && conversations && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  return (
    <div className={styles.page}>
      <ConversationList
        conversations={conversations ?? []}
        activeId={activeId}
        onSelect={setActiveId}
      />
      {activeId ? (
        <ChatThread conversationId={activeId} />
      ) : (
        <div className={styles.empty}>Select a conversation</div>
      )}
    </div>
  );
}
