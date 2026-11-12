import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import styles from './Logo.module.scss';

export function Logo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <Link href="/" className={`${styles.logo} ${tone === 'dark' ? styles.dark : ''}`}>
      <span className={styles.mark}>
        <BookOpen size={18} aria-hidden="true" />
      </span>
      LMS
    </Link>
  );
}
