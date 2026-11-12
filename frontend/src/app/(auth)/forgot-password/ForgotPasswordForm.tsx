'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Mail, XCircle } from 'lucide-react';
import { Button, Field, Input } from '../../../components/ui';
import { publicPost } from '../../../components/catalog/publicApi';
import type { ResetMailResponse } from '../authHelpers';
import styles from '../auth-form.module.scss';

function makeSchema(emailInvalid: string) {
  return z.object({ email: z.string().trim().email(emailInvalid) });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const schema = useMemo(() => makeSchema(t('validation.emailInvalid')), [t]);
  const [sent, setSent] = useState<{ email: string; token: string | null } | null>(null);
  const [error, setError] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(false);
    try {
      const data = await publicPost<ResetMailResponse>('/auth/forgot-password', { email });
      setSent({ email, token: data?.resetToken ?? null });
    } catch {
      setError(true);
    }
  });

  if (sent) {
    return (
      <div className={styles.card}>
        <span className={styles.cardIcon}>
          <Mail size={30} aria-hidden="true" />
        </span>
        <h1>{t('forgot.sentTitle')}</h1>
        <p>
          {t.rich('forgot.sentText', {
            email: sent.email,
            address: (chunks) => <span className={styles.email}>{chunks}</span>,
          })}
        </p>
        {sent.token && (
          <div className={styles.demo}>
            <span>{t('forgot.devMode')}</span>
            <Link
              href={`/reset-password?token=${encodeURIComponent(sent.token)}`}
              className={styles.buttonLink}
            >
              {t('forgot.resetButton')}
            </Link>
          </div>
        )}
        <Link href="/login" className={styles.switch}>
          {t('forgot.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.heading}>
        <span className={styles.cardIcon}>
          <KeyRound size={28} aria-hidden="true" />
        </span>
        <h1>{t('forgot.title')}</h1>
        <p>{t('forgot.subtitle')}</p>
      </div>
      {error && (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          <XCircle size={20} aria-hidden="true" />
          <span>{t('forgot.error')}</span>
        </div>
      )}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Field label={t('fields.email')} error={errors.email?.message}>
          <Input type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Button type="submit" size="lg" block loading={isSubmitting}>
          {t('forgot.submit')}
        </Button>
      </form>
      <p className={styles.switch}>
        {t('forgot.remembered')} <Link href="/login">{t('forgot.loginLink')}</Link>
      </p>
    </>
  );
}
