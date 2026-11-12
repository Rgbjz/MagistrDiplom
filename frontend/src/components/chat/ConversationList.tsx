'use client';

import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { initials } from '../../lib/format';
import { useFormat } from '../../i18n/format';
import type { Conversation } from '../../lib/types';
import { conversationTitle } from './chatTitle';
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
  const t = useTranslations('chat.list');
  const f = useFormat();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = conversations.filter(
    (c) => !q || conversationTitle(c).toLowerCase().includes(q),
  );
  const groups = [
    { key: 'course', label: t('courseChats'), items: visible.filter((c) => c.type === 'COURSE') },
    { key: 'direct', label: t('direct'), items: visible.filter((c) => c.type === 'DIRECT') },
  ].filter((g) => g.items.length > 0);

  return (
    <aside className={styles.list} aria-label={t('label')}>
      <div className={styles.listHead}>
        <h1 className={styles.listTitle}>{t('title')}</h1>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{t('searchLabel')}</span>
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.listScroll}>
        {groups.length === 0 && <p className={styles.muted}>{t('nothingFound')}</p>}
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className={styles.groupLabel}>{g.label}</h2>
            {g.items.map((c) => {
              const title = conversationTitle(c);
              const active = c.id === activeId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  className={`${styles.convo} ${active ? styles.active : ''}`}
                  onClick={() => onSelect(c.id)}
                >
                  {c.type === 'COURSE' ? (
                    <span className={`${styles.convoAvatar} ${styles.courseAvatar}`}>
                      <BookOpen size={20} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className={`${styles.convoAvatar} ${styles.personAvatar}`}>
                      {initials(title)}
                    </span>
                  )}
                  <span className={styles.convoText}>
                    <span className={styles.convoTop}>
                      <span className={styles.convoTitle}>{title}</span>
                      {c.lastMessage && (
                        <span className={styles.convoTime}>
                          {f.relative(c.lastMessage.createdAt)}
                        </span>
                      )}
                    </span>
                    <span className={styles.convoLast}>
                      {c.lastMessage?.content ?? t('noMessages')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
