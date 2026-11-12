'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, GraduationCap, XCircle } from 'lucide-react';
import { Button, Field, Input } from '../../components/ui';
import { publicPost, PublicApiError } from '../../components/catalog/publicApi';
import { PasswordInput } from './PasswordInput';
import { track } from '../../lib/analytics';
import {
  passwordScore,
  safeNext,
  saveConfirmToken,
  STRENGTH_KEYS,
  type ConfirmMailResponse,
} from './authHelpers';
import styles from './auth-form.module.scss';

type T = ReturnType<typeof useTranslations<'auth'>>;

function makeSchema(t: T) {
  return z.object({
    role: z.enum(['STUDENT', 'TEACHER']),
    firstName: z.string().trim().min(1, t('validation.firstNameRequired')).max(50),
    lastName: z.string().trim().min(1, t('validation.lastNameRequired')).max(50),
    email: z.string().trim().email(t('validation.emailInvalid')),
    password: z.string().min(8, t('validation.minLength')),
    terms: z.boolean().refine((v) => v, t('validation.termsRequired')),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const ROLES = [
  { value: 'STUDENT' as const, icon: BookOpen, key: 'student' },
  { value: 'TEACHER' as const, icon: GraduationCap, key: 'teacher' },
] as const;

export function RegisterForm() {
  const t = useTranslations('auth');
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  // Saved on the account so confirmation emails use the visitor's language.
  const locale = useLocale();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const initialRole = params.get('role') === 'TEACHER' ? 'TEACHER' : 'STUDENT';
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: initialRole, terms: false },
  });

  const password = watch('password') ?? '';
  const score = passwordScore(password);
  const tone = score <= 1 ? styles.weak : score === 2 ? styles.medium : styles.strong;

  const onSubmit = handleSubmit(async ({ terms: _terms, ...values }) => {
    void _terms;
    setServerError(null);
    try {
      const data = await publicPost<ConfirmMailResponse>('/auth/register', { ...values, locale });
      saveConfirmToken(data.email, data.confirmToken);
      track('sign_up', { method: 'email', role: values.role });
      const qs = new URLSearchParams({ email: data.email });
      if (next !== '/') qs.set('next', next);
      router.push(`/confirm?${qs.toString()}`);
    } catch (err) {
      setServerError(
        err instanceof PublicApiError && /already exists/i.test(err.message)
          ? t('register.errors.exists')
          : err instanceof PublicApiError
            ? t('register.errors.invalid')
            : t('register.errors.network'),
      );
    }
  });

  return (
    <>
      <div className={styles.heading}>
        <h1>{t('register.title')}</h1>
        <p>{t('register.subtitle')}</p>
      </div>

      {serverError && (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          <XCircle size={20} aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <fieldset className={styles.roles}>
          <legend>{t('register.roleLegend')}</legend>
          {ROLES.map((r) => (
            <label key={r.value} className={styles.roleCard}>
              <input type="radio" value={r.value} {...register('role')} />
              <r.icon size={22} aria-hidden="true" className={styles.roleIcon} />
              <span className={styles.roleTitle}>{t(`register.roles.${r.key}.title`)}</span>
              <span className={styles.roleText}>{t(`register.roles.${r.key}.text`)}</span>
            </label>
          ))}
        </fieldset>

        <div className={styles.row}>
          <Field label={t('fields.firstName')} error={errors.firstName?.message}>
            <Input autoComplete="given-name" aria-invalid={!!errors.firstName} {...register('firstName')} />
          </Field>
          <Field label={t('fields.lastName')} error={errors.lastName?.message}>
            <Input autoComplete="family-name" aria-invalid={!!errors.lastName} {...register('lastName')} />
          </Field>
        </div>

        <Field label={t('fields.email')} error={errors.email?.message}>
          <Input type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>

        <Field label={t('fields.password')} error={errors.password?.message}>
          <PasswordInput
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="password-strength"
            {...register('password')}
          />
        </Field>
        {password && (
          <div id="password-strength" aria-live="polite">
            <div className={styles.strength} aria-hidden="true">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={i <= Math.max(score, 1) ? tone : ''} />
              ))}
            </div>
            <p className={styles.roleText} style={{ marginTop: 6 }}>
              {t(`password.strength.${STRENGTH_KEYS[score]}`)}
            </p>
          </div>
        )}

        <label className={styles.checkbox}>
          <input type="checkbox" aria-invalid={!!errors.terms} {...register('terms')} />
          <span>{t('register.terms')}</span>
        </label>
        {errors.terms && (
          <span className={styles.fieldError} role="alert">
            {errors.terms.message}
          </span>
        )}

        <Button type="submit" size="lg" block loading={isSubmitting}>
          {t('register.submit')}
        </Button>
      </form>

      <p className={styles.switch}>
        {t('register.hasAccount')}{' '}
        <Link href={next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'}>
          {t('register.loginLink')}
        </Link>
      </p>
    </>
  );
}
