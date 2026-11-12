'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, Field, Input, useToast } from '../../../components/ui';
import { publicPost, PublicApiError } from '../../../components/catalog/publicApi';
import {
  readConfirmToken,
  safeNext,
  saveConfirmToken,
  type ConfirmMailResponse,
} from '../authHelpers';
import styles from '../auth-form.module.scss';

export function ConfirmView() {
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');
  const next = safeNext(params.get('next'));

  if (token) return <ConfirmToken token={token} next={next} />;
  if (email) return <CheckEmail email={email} next={next} />;
  return <InvalidLink />;
}

/** Sends a new confirmation e-mail; returns the dev token when SMTP is off. */
async function requestConfirmation(email: string): Promise<ConfirmMailResponse> {
  const data = await publicPost<ConfirmMailResponse>('/auth/resend-confirmation', { email });
  saveConfirmToken(email, data.confirmToken);
  return data;
}

/** "Check your inbox" screen shown right after registration or a resend. */
function CheckEmail({ email, next }: { email: string; next: string }) {
  const t = useTranslations('auth.confirm');
  const toast = useToast();
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setDemoToken(readConfirmToken(email));
  }, [email]);

  async function resend() {
    setSending(true);
    try {
      const data = await requestConfirmation(email);
      if (data.confirmToken) setDemoToken(data.confirmToken);
      toast(t('resent'), 'success');
    } catch (err) {
      toast(
        err instanceof PublicApiError && err.status === 400
          ? t('alreadyConfirmed')
          : t('sendFailed'),
        'error',
      );
    } finally {
      setSending(false);
    }
  }

  const confirmHref = demoToken
    ? `/confirm?token=${encodeURIComponent(demoToken)}${next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`
    : null;

  return (
    <div className={styles.card}>
      <span className={styles.cardIcon}>
        <Mail size={30} aria-hidden="true" />
      </span>
      <h1>{t('checkTitle')}</h1>
      <p>
        {t('sentTo')}
        <br />
        <span className={styles.email}>{email}</span>
      </p>
      <p>{t('spam')}</p>

      {confirmHref && (
        <div className={styles.demo}>
          <span>{t('devMode')}</span>
          <Link href={confirmHref} className={styles.buttonLink}>
            {t('confirmButton')}
          </Link>
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="outline" block onClick={resend} loading={sending}>
          {t('resend')}
        </Button>
        <Link href="/register" className={styles.switch}>
          {t('changeEmail')}
        </Link>
      </div>
    </div>
  );
}

function ConfirmToken({ token, next }: { token: string; next: string }) {
  const t = useTranslations('auth.confirm');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against the StrictMode double effect.
    if (started.current) return;
    started.current = true;
    publicPost('/auth/confirm', { token })
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') {
    return (
      <div className={styles.card} aria-live="polite">
        <span className={styles.cardIcon}>
          <Loader2 size={30} aria-hidden="true" />
        </span>
        <h1>{t('confirming')}</h1>
      </div>
    );
  }
  if (state === 'error') return <InvalidLink />;

  const login = `/login?confirmed=1${next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`;
  return (
    <div className={styles.card} aria-live="polite">
      <span className={`${styles.cardIcon} ${styles.cardIconSuccess}`}>
        <CheckCircle2 size={30} aria-hidden="true" />
      </span>
      <h1>{t('successTitle')}</h1>
      <p>{t('successText')}</p>
      <Link href={login} className={styles.buttonLink}>
        {t('toLogin')}
      </Link>
    </div>
  );
}

/** Expired/used link: let the user request a fresh e-mail. */
function InvalidLink() {
  const t = useTranslations('auth');
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function resend(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setSending(true);
    try {
      await requestConfirmation(value);
      setSentTo(value);
    } catch (err) {
      toast(
        err instanceof PublicApiError && err.status === 400
          ? t('confirm.alreadyConfirmed')
          : t('confirm.sendFailed'),
        'error',
      );
    } finally {
      setSending(false);
    }
  }

  if (sentTo) return <CheckEmail email={sentTo} next="/" />;

  return (
    <div className={styles.card}>
      <span className={`${styles.cardIcon} ${styles.cardIconError}`}>
        <XCircle size={30} aria-hidden="true" />
      </span>
      <h1>{t('confirm.invalidTitle')}</h1>
      <p>{t('confirm.invalidText')}</p>
      <form className={styles.form} onSubmit={resend} noValidate>
        <Field label={t('fields.email')}>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" block loading={sending}>
          {t('confirm.resend')}
        </Button>
      </form>
      <div className={styles.actions}>
        <Link href="/login" className={styles.switch}>
          {t('confirm.login')}
        </Link>
      </div>
    </div>
  );
}
