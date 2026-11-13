'use client';

import { useMutation } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { Button, useToast } from '../ui';

/**
 * «Написати» next to a person: opens (or creates) the direct chat with them.
 * Guests are sent to sign in first; hidden on your own card.
 */
export function MessageButton({ userId, name }: { userId: number; name: string }) {
  const t = useTranslations('chat.direct');
  const router = useRouter();
  const toast = useToast();
  const { data: session, status } = useSession();
  const me = (session?.user as { id?: number } | undefined)?.id;

  const open = useMutation({
    mutationFn: () =>
      clientApi<{ id: number }>('/chat/conversations/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (c) => router.push(`/chat?c=${c.id}`),
    onError: () => toast(t('failed'), 'error'),
  });

  if (status === 'loading' || me === userId) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      loading={open.isPending}
      aria-label={t('write', { name })}
      onClick={() => {
        if (!session) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        open.mutate();
      }}
    >
      <MessageCircle size={16} aria-hidden="true" />
      {t('writeShort')}
    </Button>
  );
}
