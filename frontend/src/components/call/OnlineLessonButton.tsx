'use client';

import { useState } from 'react';
import { Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { useApiErrorMessage } from '../../i18n/format';
import type { Conversation } from '../../lib/types';
import { useToast } from '../ui';
import { useCall } from './CallProvider';

/** Teacher's online lesson button: starts a group call in the course chat. */
export function OnlineLessonButton({
  courseId,
  courseTitle,
  className,
  compact = false,
}: {
  courseId: number;
  courseTitle: string;
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations('call.onlineLesson');
  const errorText = useApiErrorMessage();
  const { current, startCall } = useCall();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const conversation = await clientApi<Conversation>(`/chat/courses/${courseId}/conversation`);
      await startCall(conversation.id, courseTitle);
    } catch (e) {
      toast(errorText(e, t('startFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => void start()}
      disabled={busy || !!current}
      aria-label={compact ? t('label') : undefined}
    >
      <Video size={18} aria-hidden="true" />
      {!compact && <span>{t('label')}</span>}
    </button>
  );
}
