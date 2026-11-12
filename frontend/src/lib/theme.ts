'use client';

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return (document.documentElement.getAttribute('data-theme') as Theme) ?? 'light';
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // ignore
  }
}

export type ThemePref = Theme | 'system';

/** Stored preference; "system" when nothing is saved. */
export function getThemePref(): ThemePref {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

/** Apply a preference; "system" clears the stored choice and follows the OS. */
export function setThemePref(pref: ThemePref) {
  if (pref !== 'system') {
    setTheme(pref);
    return;
  }
  try {
    localStorage.removeItem('theme');
  } catch {
    // ignore
  }
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
