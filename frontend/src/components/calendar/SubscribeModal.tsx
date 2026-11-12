'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { useApiErrorMessage } from '../../i18n/format';
import { Button, ConfirmDialog, Field, Input, Modal, useToast } from '../ui';
import styles from './calendar.module.scss';

/** Personal iCal feed URL for Google/Apple/Outlook calendar subscriptions. */
export function SubscribeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('calendar.subscribe');
  const tt = useTranslations('calendar.toast');
  const tc = useTranslations('common.actions');
  const errorText = useApiErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', 'ical-url'],
    queryFn: () => clientApi<{ url: string }>('/calendar/ical-url'),
    enabled: open,
  });

  const reset = useMutation({
    mutationFn: () => clientApi<{ url: string }>('/calendar/ical/reset', { method: 'POST' }),
    onSuccess: (res) => {
      queryClient.setQueryData(['calendar', 'ical-url'], res);
      setConfirmReset(false);
      toast(tt('reset'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  async function copy() {
    if (!data?.url) return;
    try {
      await navigator.clipboard.writeText(data.url);
      toast(tt('copied'));
    } catch {
      toast(errorText(null), 'error');
    }
  }

  return (
    <>
      <Modal
        open={open && !confirmReset}
        onClose={onClose}
        title={t('title')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={!data}>
              {t('reset')}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {tc('close')}
            </Button>
          </>
        }
      >
        <p className={styles.muted}>{t('text')}</p>
        <Field label={t('urlLabel')}>
          <div className={styles.copyRow}>
            <Input
              readOnly
              value={isLoading ? t('loading') : (data?.url ?? '')}
              onFocus={(e) => e.currentTarget.select()}
              data-testid="ical-url"
            />
            <Button variant="outline" onClick={() => void copy()} disabled={!data} aria-label={t('copy')}>
              <Copy size={16} aria-hidden="true" /> {t('copy')}
            </Button>
          </div>
        </Field>
        <p className={styles.hint}>{t('steps')}</p>
        <p className={styles.hint}>{t('privacy')}</p>
      </Modal>
      <ConfirmDialog
        open={confirmReset}
        title={t('reset')}
        description={t('resetConfirm')}
        confirmLabel={t('reset')}
        danger
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
