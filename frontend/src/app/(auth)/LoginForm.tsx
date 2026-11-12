'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Field, Input } from '../../components/ui';
import { publicPost } from '../../components/catalog/publicApi';
import { PasswordInput } from './PasswordInput';
import { track } from '../../lib/analytics';
import { safeNext, saveConfirmToken, type ConfirmMailResponse } from './authHelpers';
import styles from './auth-form.module.scss';

type T = ReturnType<typeof useTranslations<'auth'>>;

function makeSchema(t: T) {
  return z.object({
    email: z.string().trim().email(t('validation.emailInvalid')),
    password: z.string().min(1, t('validation.passwordRequired')),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;
type LoginError =
  | 'credentials'
  | 'email_not_confirmed'
  | 'account_blocked'
  | 'account_locked'
  | 'rate_limited'
  | 'network';

const LOGIN_ERRORS = {
  credentials: 'credentials',
  account_blocked: 'accountBlocked',
  account_locked: 'accountLocked',
  rate_limited: 'rateLimited',
  network: 'network',
} as const satisfies Record<Exclude<LoginError, 'email_not_confirmed'>, string>;

const SERVER_CODES: LoginError[] = [
  'email_not_confirmed',
  'account_blocked',
  'account_locked',
  'rate_limited',
];

export function LoginForm() {
  const t = useTranslations('auth');
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<LoginError | null>(null);
  const [resending, setResending] = useState(false);
  const [slow, setSlow] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // The free backend tier sleeps when idle; the first login can take ~30s.
  useEffect(() => {
    if (!isSubmitting) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, [isSubmitting]);

  const notice = params.get('confirmed')
    ? t('login.noticeConfirmed')
    : params.get('reset')
      ? t('login.noticeReset')
      : null;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await signIn('credentials', { ...values, redirect: false });
      if (res?.error) {
        setError(
          SERVER_CODES.includes(res.code as LoginError) ? (res.code as LoginError) : 'credentials',
        );
        return;
      }
      track('login', { method: 'email' });
      router.push(next);
      router.refresh();
    } catch {
      setError('network');
    }
  });

  async function resend() {
    const email = getValues('email').trim();
    setResending(true);
    try {
      const data = await publicPost<ConfirmMailResponse>('/auth/resend-confirmation', {
        email,
      });
      saveConfirmToken(email, data.confirmToken);
    } catch {
      // Still show the "check your mail" screen; it offers another resend.
    } finally {
      setResending(false);
    }
    router.push(`/confirm?email=${encodeURIComponent(email)}`);
  }

  return (
    <>
      <div className={styles.heading}>
        <h1>{t('login.title')}</h1>
        <p>{t('login.subtitle')}</p>
      </div>

      {notice && !error && (
        <div role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {error === 'email_not_confirmed' && (
        <div role="alert" className={`${styles.alert} ${styles.alertWarning}`}>
          <AlertTriangle size={20} aria-hidden="true" />
          <div className={styles.alertText}>
            <strong>{t('login.notConfirmed.title')}</strong>
            <span>{t('login.notConfirmed.text')}</span>
            <button
              type="button"
              className={styles.inlineLink}
              onClick={resend}
              disabled={resending}
            >
              {resending ? t('login.notConfirmed.resending') : t('login.notConfirmed.resend')}
            </button>
          </div>
        </div>
      )}
      {error && error !== 'email_not_confirmed' && (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          <XCircle size={20} aria-hidden="true" />
          <span>{t(`login.errors.${LOGIN_ERRORS[error]}`)}</span>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Field label={t('fields.email')} error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </Field>
        <Field
          label={
            <span className={styles.labelRow}>
              {t('fields.password')}
              <Link href="/forgot-password">{t('login.forgot')}</Link>
            </span>
          }
          error={errors.password?.message}
        >
          <PasswordInput
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <Button type="submit" size="lg" block loading={isSubmitting}>
          {t('login.submit')}
        </Button>
        {slow && (
          <p className={styles.slowHint} role="status">
            {t('login.slow')}
          </p>
        )}
      </form>

      <p className={styles.switch}>
        {t('login.noAccount')}{' '}
        <Link href={next !== '/' ? `/register?next=${encodeURIComponent(next)}` : '/register'}>
          {t('login.registerLink')}
        </Link>
      </p>
    </>
  );
}
