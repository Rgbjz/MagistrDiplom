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
