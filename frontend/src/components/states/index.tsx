import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, SearchX, WifiOff } from 'lucide-react';
import { Button } from '../ui';
import { LinkButton } from './LinkButton';
import styles from './States.module.scss';

export { LinkButton };

/** 403 — the user may not open this page (e.g. not enrolled in the course). */
export function Forbidden({
  title,
  text,
  action,
}: {
  title?: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  const t = useTranslations('states');
  const c = useTranslations('common.actions');
  return (
    <div className={styles.state} role="alert">
      <span className={`${styles.icon} ${styles.warning}`}>
        <Lock size={28} aria-hidden="true" />
      </span>
      <h2 className={styles.title}>{title ?? t('forbidden.title')}</h2>
      <p className={styles.text}>{text ?? t('forbidden.text')}</p>
      <div className={styles.actions}>
        {action ?? (
          <LinkButton href="/" variant="outline">
            {c('toHome')}
          </LinkButton>
        )}
      </div>
    </div>
  );
}

/** Data failed to load — offers a retry. */
export function NetworkError({
  onRetry,
  title,
  text,
}: {
  onRetry?: () => void;
  title?: string;
  text?: ReactNode;
}) {
  const t = useTranslations('states');
  const c = useTranslations('common.actions');
  return (
    <div className={styles.state} role="alert">
      <span className={`${styles.icon} ${styles.danger}`}>
        <WifiOff size={28} aria-hidden="true" />
      </span>
      <h2 className={styles.title}>{title ?? t('network.title')}</h2>
      <p className={styles.text}>{text ?? t('network.text')}</p>
      {onRetry && (
        <div className={styles.actions}>
          <Button onClick={onRetry}>{c('retry')}</Button>
        </div>
      )}
    </div>
  );
}

/** Empty search / filter result. */
export function NoResults({
  query,
  onReset,
}: {
  query?: string;
  onReset?: () => void;
}) {
  const t = useTranslations('states.noResults');
  return (
    <div className={styles.state}>
      <span className={styles.icon}>
        <SearchX size={28} aria-hidden="true" />
      </span>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.text}>
        {query ? t('query', { query }) : ''}
        {t('hint')}
      </p>
      {onReset && (
        <div className={styles.actions}>
          <Button variant="outline" onClick={onReset}>
            {t('reset')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Full-page 404 body. */
export function NotFoundState({ title }: { title?: string } = {}) {
  const t = useTranslations('states.notFound');
  const c = useTranslations('common.actions');
  return (
    <div className={styles.page}>
      <div className={styles.state}>
        <span className={styles.code}>404</span>
        <h1 className={styles.title}>{title ?? t('title')}</h1>
        <p className={styles.text}>{t('text')}</p>
        <div className={styles.actions}>
          <LinkButton href="/">{c('toHome')}</LinkButton>
          <LinkButton href="/catalog" variant="outline">
            {c('toCatalog')}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Picks the right state for a failed query: 404 → not found, 403 → no access,
 * anything else (network, 5xx) → retryable network error.
 */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : '';
  if (/^API 404/.test(message)) return <NotFoundState />;
  if (/^API 403/.test(message)) return <Forbidden />;
  return <NetworkError onRetry={onRetry} />;
}
