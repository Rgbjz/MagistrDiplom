'use client';

import type { Conversation } from '../../lib/types';
import styles from '../../app/(app)/chat/chat.module.scss';

export function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <aside className={styles.list}>
      <h2 className={styles.listTitle}>Chats</h2>
      {conversations.length === 0 && (
        <p className={styles.muted}>No conversations yet.</p>
      )}
      {conversations.map((c) => (
        <button
          key={c.id}
          className={`${styles.convo} ${c.id === activeId ? styles.active : ''}`}
          onClick={() => onSelect(c.id)}
        >
          <span className={styles.convoTitle}>{c.title}</span>
          {c.lastMessage && (
            <span className={styles.convoLast}>{c.lastMessage.content}</span>
          )}
        </button>
      ))}
    </aside>
  );
}
