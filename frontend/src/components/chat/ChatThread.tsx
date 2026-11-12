'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Send, Video } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { getSocket } from '../../lib/socket';
import { displayName, initials } from '../../lib/format';
import { INTL_LOCALE, type Locale } from '../../i18n/config';
import type { ChatMessage, Conversation, Role, SessionUser } from '../../lib/types';
import { Skeleton } from '../ui';
import { conversationTitle } from './chatTitle';
import { useCall } from '../call/CallProvider';
import { CallBanner } from '../call/CallBanner';
import styles from '../../app/(app)/chat/chat.module.scss';

/** Sender may carry a role if the backend includes it. */
type Sender = ChatMessage['sender'] & { role?: Role };

function dayLabel(
  value: string,
  locale: Locale,
  words: { today: string; yesterday: string },
): string {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return words.today;
  if (d.toDateString() === yesterday.toDateString()) return words.yesterday;
  return d.toLocaleDateString(INTL_LOCALE[locale], { day: 'numeric', month: 'long' });
}

export function ChatThread({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const t = useTranslations('chat.thread');
  const ta = useTranslations('common.a11y');
  const locale = useLocale() as Locale;
  const conversationId = conversation.id;
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const token = session?.accessToken;
  const me = session?.user as SessionUser | undefined;
  const { current: currentCall, startCall } = useCall();

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      clientApi<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`),
  });

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('conversation:join', { conversationId });

    const onNew = (msg: ChatMessage) => {
      if (msg.conversationId !== conversationId) return;
      queryClient.setQueryData<ChatMessage[]>(
        ['messages', conversationId],
        (prev) => {
          if (!prev) return [msg];
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        },
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
    socket.on('message:new', onNew);
    return () => {
      socket.off('message:new', onNew);
      socket.emit('conversation:leave', { conversationId });
    };
  }, [conversationId, token, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function send() {
    if (!text.trim() || !token) return;
    getSocket(token).emit('message:send', {
      conversationId,
      content: text.trim(),
    });
    setText('');
  }

  const title = conversationTitle(conversation);
  const list = messages ?? [];

  return (
    <section className={styles.thread} aria-label={t('label', { title })}>
      <header className={styles.threadHead}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onBack}
          aria-label={t('back')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className={styles.threadTitleWrap}>
          <span className={styles.threadTitle}>{title}</span>
          <span className={styles.muted}>
            {conversation.type === 'COURSE' ? t('courseChat') : t('directChat')}
          </span>
        </div>
        <button
          type="button"
          className={styles.callBtn}
          onClick={() => void startCall(conversationId, title)}
          disabled={!!currentCall}
          aria-label={t('videoCall')}
          title={t('videoCall')}
        >
          <Video size={20} aria-hidden="true" />
        </button>
        {conversation.courseId && (
          <Link href={`/courses/${conversation.courseId}`} className={styles.toCourse}>
            {t('toCourse')}
          </Link>
        )}
      </header>
      <CallBanner conversationId={conversationId} title={title} />

      <div
        className={styles.messages}
        aria-live="polite"
        tabIndex={0}
        role="log"
        aria-label={ta('messages')}
      >
        {isLoading && <Skeleton height={120} />}
        {!isLoading && list.length === 0 && (
          <p className={styles.emptyThread}>{t('empty')}</p>
        )}
        {list.map((m, i) => {
          const mine = m.senderId === me?.id;
          const sender = m.sender as Sender;
          const name = displayName(sender.profile, sender.email);
          const prev = list[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const sameAuthor = !newDay && prev?.senderId === m.senderId;
          const time = new Date(m.createdAt).toLocaleTimeString(INTL_LOCALE[locale], {
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <Fragment key={m.id}>
              {newDay && <span className={styles.day}>{dayLabel(m.createdAt, locale, { today: t('today'), yesterday: t('yesterday') })}</span>}
              {mine ? (
                <div className={`${styles.msgRow} ${styles.mineRow}`}>
                  <div className={`${styles.bubble} ${styles.mine}`}>{m.content}</div>
                  <span className={styles.time}>{time}</span>
                </div>
              ) : (
                <div className={styles.msgRow}>
                  <div className={styles.msgOther}>
                    {sameAuthor ? (
                      <span className={styles.avatarSpacer} aria-hidden="true" />
                    ) : (
                      <span className={styles.msgAvatar} aria-hidden="true">
                        {initials(name)}
                      </span>
                    )}
                    <div className={styles.msgBody}>
                      {!sameAuthor && (
                        <span className={styles.sender}>
                          {name}
                          {sender.role === 'TEACHER' && (
                            <span className={styles.teacherBadge}>{t('teacherBadge')}</span>
                          )}
                        </span>
                      )}
                      <div className={styles.bubble}>{m.content}</div>
                      <span className={styles.time}>{time}</span>
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className={styles.composerLabel}>
          <span className="sr-only">{t('messageLabel')}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('placeholder')}
            maxLength={2000}
          />
        </label>
        <button type="submit" className={styles.sendBtn} aria-label={t('send')} disabled={!text.trim()}>
          <Send size={20} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
