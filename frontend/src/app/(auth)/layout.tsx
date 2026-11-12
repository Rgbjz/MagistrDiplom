import { CheckCircle2, MessageCircle, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Logo } from '../../components/layout/Logo';
import { ThemeToggle } from '../../components/ui';
import styles from './auth-form.module.scss';

const BENEFITS = [
  { icon: TrendingUp, key: 'progress' },
  { icon: CheckCircle2, key: 'tests' },
  { icon: MessageCircle, key: 'chat' },
] as const;

/** Split screen shared by sign-in, registration and password flows. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('auth.layout');
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <div className={styles.top}>
          <Logo tone="dark" />
          <ThemeToggle />
        </div>
        <div className={styles.center}>
          <div className={styles.panel}>{children}</div>
        </div>
      </main>
      <aside className={styles.aside}>
        <h2 className={styles.asideTitle}>{t('asideTitle')}</h2>
        <ul className={styles.benefits}>
          {BENEFITS.map((b) => (
            <li key={b.key}>
              <span className={styles.benefitIcon}>
                <b.icon size={20} aria-hidden="true" />
              </span>
              <span className={styles.benefitText}>
                <span className={styles.benefitTitle}>{t(`benefits.${b.key}.title`)}</span>
                <span>{t(`benefits.${b.key}.text`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
