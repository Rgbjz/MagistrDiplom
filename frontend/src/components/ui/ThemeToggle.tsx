'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getTheme, setTheme, type Theme } from '../../lib/theme';

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('light');

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
      aria-label="Toggle theme"
      style={{
        background: 'transparent',
        border: '1px solid var(--color-header-text)',
        color: 'var(--color-header-text)',
        borderRadius: 'var(--radius-sm)',
        width: 34,
        height: 34,
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
