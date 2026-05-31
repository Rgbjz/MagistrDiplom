'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { clientApi } from '../../lib/api/client';
import { getSocket } from '../../lib/socket';
import type { ChatMessage, SessionUser } from '../../lib/types';
import styles from '../../app/(app)/chat/chat.module.scss';

export function ChatThread({ conversationId }: { conversationId: number }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const token = session?.accessToken;
  const me = session?.user as SessionUser | undefined;

  const { data: messages } = useQuery<ChatMessage[]>({
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
    };
    socket.on('message:new', onNew);
    return () => {
      socket.off('message:new', onNew);
      socket.emit('conversation:leave', { conversationId });
    };
  }, [conversationId, token, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    if (!text.trim() || !token) return;
    getSocket(token).emit('message:send', {
      conversationId,
      content: text.trim(),
    });
    setText('');
  }

  return (
    <div className={styles.thread}>
      <div className={styles.messages}>
        {(messages ?? []).map((m) => (
          <div
            key={m.id}
            className={`${styles.message} ${m.senderId === me?.id ? styles.mine : ''}`}
          >
            <span className={styles.msgSender}>{m.sender.email}</span>
            <span className={styles.msgBody}>{m.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className={styles.composer}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
