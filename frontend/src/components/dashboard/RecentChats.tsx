import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Card, EmptyState } from '../ui';
import type { Conversation } from '../../lib/types';
import styles from '../../app/(app)/dashboard.module.scss';

export function RecentChats({
  conversations,
}: {
  conversations: Conversation[];
}) {
  if (conversations.length === 0) {
    return (
      <EmptyState icon={<MessageSquare size={28} />} title="No chats yet" />
    );
  }
  return (
    <div className={styles.chats}>
      {conversations.map((c) => (
        <Link key={c.id} href={`/chat?c=${c.id}`}>
          <Card className={styles.chatItem}>
            <MessageSquare size={18} />
            <div>
              <div className={styles.chatTitle}>{c.title}</div>
              {c.lastMessage && (
                <div className={styles.chatLast}>{c.lastMessage.content}</div>
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
