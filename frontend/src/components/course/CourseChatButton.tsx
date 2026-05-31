'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientApi } from '../../lib/api/client';
import type { Conversation } from '../../lib/types';

export function CourseChatButton({ courseId }: { courseId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const convo = await clientApi<Conversation>(
        `/chat/courses/${courseId}/conversation`,
      );
      router.push(`/chat?c=${convo.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={open}
      disabled={busy}
      style={{
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '8px 14px',
        cursor: 'pointer',
      }}
    >
      {busy ? '…' : '💬 Course chat'}
    </button>
  );
}
