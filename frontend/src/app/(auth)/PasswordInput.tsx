'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '../../components/ui';
import styles from './auth-form.module.scss';

/** Password field with a show/hide toggle; forwards `ref` for react-hook-form. */
export function PasswordInput(props: ComponentProps<'input'>) {
  const t = useTranslations('auth.password');
  const [visible, setVisible] = useState(false);
  return (
    <span className={styles.password}>
      <Input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className={styles.eye}
        aria-label={visible ? t('hide') : t('show')}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}
