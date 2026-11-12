'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '../../i18n/format';
import type { Conversation } from '../../lib/types';
import { useToast } from '../ui';
import styles from './CourseTopBar.module.scss';

export function CourseChatButton({
  courseId,
  compact = false,
}: {
  courseId: number;
  compact?: boolean;
}) {
  const t = useTranslations('course.chat');
  const errorText = useApiErrorMessage();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const convo = await clientApi<Conversation>(`/chat/courses/${courseId}/conversation`);
      router.push(`/chat?c=${convo.id}`);
    } catch (e) {
      toast(errorText(e, t('error')), 'error');
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className={compact ? styles.iconBtn : styles.chatBtn}
      aria-label={compact ? t('open') : undefined}
    >
      <MessageCircle size={18} aria-hidden="true" />
      {!compact && t('open')}
    </button>
  );
}
