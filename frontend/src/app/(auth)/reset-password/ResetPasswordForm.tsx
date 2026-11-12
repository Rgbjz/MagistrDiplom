'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { XCircle } from 'lucide-react';
import { Button, Field } from '../../../components/ui';
import { publicPost, PublicApiError } from '../../../components/catalog/publicApi';
import { PasswordInput } from '../PasswordInput';
import { passwordScore, STRENGTH_KEYS } from '../authHelpers';
import styles from '../auth-form.module.scss';

function makeSchema(minLength: string, mismatch: string) {
  return z
    .object({
      password: z.string().min(8, minLength),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { message: mismatch, path: ['confirm'] });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const schema = useMemo(
    () => makeSchema(t('validation.minLength'), t('validation.passwordsMismatch')),
    [t],
  );
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const password = watch('password') ?? '';

  if (!token) {
    return (
      <div className={styles.card}>
        <span className={`${styles.cardIcon} ${styles.cardIconError}`}>
          <XCircle size={30} aria-hidden="true" />
        </span>
        <h1>{t('reset.invalidTitle')}</h1>
        <p>{t('reset.invalidText')}</p>
        <Link href="/forgot-password" className={styles.buttonLink}>
          {t('reset.restore')}
        </Link>
      </div>
    );
  }

  const onSubmit = handleSubmit(async ({ password: pw }) => {
    setError(null);
    try {
      await publicPost('/auth/reset-password', { token, password: pw });
      router.push('/login?reset=1');
    } catch (err) {
      setError(
        err instanceof PublicApiError && err.status === 400
          ? t('reset.errors.invalidLink')
          : t('reset.errors.failed'),
      );
    }
  });

  return (
    <>
      <div className={styles.heading}>
        <h1>{t('reset.title')}</h1>
        <p>{t('reset.subtitle')}</p>
      </div>
      {error && (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          <XCircle size={20} aria-hidden="true" />
          <div className={styles.alertText}>
            <span>{error}</span>
            <Link href="/forgot-password" style={{ color: 'inherit', fontWeight: 700 }}>
              {t('reset.requestNew')}
            </Link>
          </div>
        </div>
      )}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Field
          label={t('fields.newPassword')}
          error={errors.password?.message}
          hint={
            password
              ? t(`password.strength.${STRENGTH_KEYS[passwordScore(password)]}`)
              : t('validation.minLength')
          }
        >
          <PasswordInput autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Field label={t('fields.repeatPassword')} error={errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
        <Button type="submit" size="lg" block loading={isSubmitting}>
          {t('reset.submit')}
        </Button>
      </form>
    </>
  );
}
