'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import { useApiErrorMessage } from '../../../i18n/format';
import { Button, Field, Input, Modal, useToast } from '../../../components/ui';
import styles from './profile.module.scss';

export function DangerZone() {
  const t = useTranslations('profile.danger');
  const tCommon = useTranslations('common.actions');
  const errorText = useApiErrorMessage();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  const remove = useMutation({
    mutationFn: () =>
      clientApi<void>('/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => signOut({ callbackUrl: '/welcome' }),
    onError: (e) => toast(errorText(e), 'error'),
  });

  function close() {
    setOpen(false);
    setPassword('');
  }

  return (
    <section className={`${styles.card} ${styles.danger}`} aria-labelledby="danger-title">
      <div>
        <h2 id="danger-title" className={styles.sectionTitle}>
          {t('title')}
        </h2>
        <p className={styles.muted}>
          {t('text')}
        </p>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t('delete')}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={t('confirmTitle')}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              disabled={!password}
              onClick={() => remove.mutate()}
            >
              {t('deleteForever')}
            </Button>
          </>
        }
      >
        <p className={styles.muted}>
          {t('confirmText')}
        </p>
        <Field label={t('password')}>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </Modal>
    </section>
  );
}
