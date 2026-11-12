'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTheme, setTheme, type Theme } from '../../lib/theme';

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('light');
  const t = useTranslations('nav.theme');

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? t('toLight') : t('toDark')}
      style={{
        background: 'transparent',
        border: 0,
        color: 'var(--color-header-muted)',
        borderRadius: 10,
        width: 44,
        height: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
