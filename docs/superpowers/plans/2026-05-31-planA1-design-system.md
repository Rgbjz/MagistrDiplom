# Plan A1 — Design System Foundation (tokens, dark theme, UI kit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a token-based design system with light/dark theming (Polished Blue), a small UI-kit, Inter + lucide icons, and apply it to the Header, Footer, CourseCard, and auth pages.

**Architecture:** CSS custom properties (design tokens) in `globals.scss`; SCSS modules and UI primitives reference `var(--…)`. Dark theme = token overrides under `[data-theme="dark"]`, toggled via a client component, persisted in `localStorage`, applied pre-paint by an inline script (no flash). No new UI framework.

**Tech Stack:** Next.js 15 + TS, SCSS modules, `next/font` (Inter), `lucide-react`.

> **Tests out of scope** (project has no test infra). Verification = `npm run build`, dev-server boot, and a manual theme-toggle/visual check.

> **Env note:** Node not on default PATH — prepend `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Frontend dir: `/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend`. Turbopack CSS Modules require pure selectors (nest element selectors under a class).

> **Spec:** `docs/superpowers/specs/2026-05-31-design-system-and-student-cabinet-design.md` (subproject A). Cabinet itself is Plan A2.

---

## File Structure

```
frontend/src/
  app/globals.scss                      # MODIFY: design tokens (light + dark) + base
  app/layout.tsx                        # MODIFY: Inter font + no-flash theme script
  lib/theme.ts                          # theme get/set helpers
  components/ui/
    Button.tsx          Button.module.scss
    Card.tsx            Card.module.scss
    Badge.tsx           Badge.module.scss
    Avatar.tsx          Avatar.module.scss
    Skeleton.tsx        Skeleton.module.scss
    EmptyState.tsx      EmptyState.module.scss
    Input.tsx           Input.module.scss      # Input + Textarea + Select
    ThemeToggle.tsx
    Toast.tsx           Toast.module.scss      # ToastProvider + useToast
    index.ts                                   # re-exports
  components/Header.tsx + Header.module.scss   # MODIFY
  components/Footer.module.scss                # MODIFY (tokens)
  components/CourseCard.tsx + .module.scss     # MODIFY
  app/(auth)/auth-form.module.scss             # MODIFY (tokens)
```

---

## Task 1: Design tokens + base globals + Inter font + lucide

**Files:** Modify `frontend/src/app/globals.scss`, `frontend/src/app/layout.tsx`; install `lucide-react`

- [ ] **Step 1: Install lucide-react**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm install lucide-react
```

- [ ] **Step 2: Replace `frontend/src/app/globals.scss`**

```scss
:root {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-soft: #dbeafe;
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-2: #f1f5f9;
  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-border: #e5e7eb;
  --color-success: #22c55e;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-header: #1e293b;
  --color-header-text: #ffffff;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 14px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 30px rgba(0, 0, 0, 0.12);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --fs-xs: 12px;
  --fs-sm: 14px;
  --fs-md: 15px;
  --fs-lg: 18px;
  --fs-xl: 22px;
  --fs-2xl: 28px;
}

[data-theme='dark'] {
  --color-primary: #3b82f6;
  --color-primary-hover: #60a5fa;
  --color-primary-soft: #1e293b;
  --color-bg: #0b1220;
  --color-surface: #131c2e;
  --color-surface-2: #1b2740;
  --color-text: #e7ecf3;
  --color-text-muted: #93a1b5;
  --color-border: #25324a;
  --color-header: #0c1424;
  --color-header-text: #e7ecf3;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 10px 30px rgba(0, 0, 0, 0.6);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  background: var(--color-bg);
  color: var(--color-text);
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

a {
  color: inherit;
  text-decoration: none;
}

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Replace `frontend/src/app/layout.tsx`** (Inter + no-flash theme script)

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.scss';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'Learning Platform',
  description: 'LMS',
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Build to verify**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
rm -rf .next
npm run build
```
Expected: `✓ Compiled successfully`. If errors, STOP and report.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/app/globals.scss frontend/src/app/layout.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): design tokens + light/dark theming base + Inter + lucide"
```

---

## Task 2: Theme helpers + ThemeToggle

**Files:** Create `frontend/src/lib/theme.ts`, `frontend/src/components/ui/ThemeToggle.tsx`

- [ ] **Step 1: `lib/theme.ts`**

```typescript
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
```

- [ ] **Step 2: `components/ui/ThemeToggle.tsx`**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/lib/theme.ts frontend/src/components/ui/ThemeToggle.tsx
git commit -m "feat(frontend): theme helpers + ThemeToggle"
```

---

## Task 3: UI-kit primitives (Button, Card, Badge, Avatar, Skeleton, EmptyState, Input)

**Files:** Create the `frontend/src/components/ui/*` files below + `index.ts`

- [ ] **Step 1: `Button.tsx` + `Button.module.scss`**

```typescript
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.scss';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  loading = false,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={styles.spinner} />}
      {children}
    </button>
  );
}
```

```scss
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--fs-sm);
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.primary {
  background: var(--color-primary);
  color: #fff;

  &:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
}

.outline {
  background: transparent;
  border-color: var(--color-primary);
  color: var(--color-primary);

  &:hover:not(:disabled) {
    background: var(--color-primary-soft);
  }
}

.ghost {
  background: transparent;
  color: var(--color-text);

  &:hover:not(:disabled) {
    background: var(--color-surface-2);
  }
}

.danger {
  background: var(--color-danger);
  color: #fff;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 2: `Card.tsx` + `Card.module.scss`**

```typescript
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.scss';

export function Card({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`${styles.card} ${className}`} {...rest}>
      {children}
    </div>
  );
}
```

```scss
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 3: `Badge.tsx` + `Badge.module.scss`**

```typescript
import type { ReactNode } from 'react';
import styles from './Badge.module.scss';

type Tone = 'neutral' | 'success' | 'warning' | 'primary';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
```

```scss
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: 600;
}

.neutral {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}

.success {
  background: #ecfdf5;
  color: #166534;
}

.warning {
  background: #fffbeb;
  color: #92400e;
}

.primary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
```

- [ ] **Step 4: `Avatar.tsx` + `Avatar.module.scss`**

```typescript
import styles from './Avatar.module.scss';

export function Avatar({
  src,
  name,
  size = 36,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
}) {
  const initial = (name ?? '?').charAt(0).toUpperCase();
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? 'avatar'} />
      ) : (
        <span style={{ fontSize: size * 0.42 }}>{initial}</span>
      )}
    </span>
  );
}
```

```scss
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  flex: none;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
```

- [ ] **Step 5: `Skeleton.tsx` + `Skeleton.module.scss`**

```typescript
import styles from './Skeleton.module.scss';

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-sm)',
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
}) {
  return (
    <span
      className={styles.skeleton}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
```

```scss
.skeleton {
  display: block;
  background: linear-gradient(
    90deg,
    var(--color-surface-2) 25%,
    var(--color-border) 37%,
    var(--color-surface-2) 63%
  );
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
```

- [ ] **Step 6: `EmptyState.tsx` + `EmptyState.module.scss`**

```typescript
import type { ReactNode } from 'react';
import styles from './EmptyState.module.scss';

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <p className={styles.title}>{title}</p>
      {children}
    </div>
  );
}
```

```scss
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6);
  color: var(--color-text-muted);
  text-align: center;
}

.icon {
  color: var(--color-text-muted);
  opacity: 0.7;
}

.title {
  font-size: var(--fs-md);
}
```

- [ ] **Step 7: `Input.tsx` + `Input.module.scss`** (Input, Textarea, Select share styles)

```typescript
import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from 'react';
import styles from './Input.module.scss';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`${styles.field} ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea className={`${styles.field} ${className}`} {...rest} />;
}

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode },
) {
  const { className = '', children, ...rest } = props;
  return (
    <select className={`${styles.field} ${className}`} {...rest}>
      {children}
    </select>
  );
}
```

```scss
.field {
  width: 100%;
  padding: var(--space-3) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--fs-sm);
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-muted);
  }
}
```

- [ ] **Step 8: `index.ts` re-exports**

```typescript
export { Button } from './Button';
export { Card } from './Card';
export { Badge } from './Badge';
export { Avatar } from './Avatar';
export { Skeleton } from './Skeleton';
export { EmptyState } from './EmptyState';
export { Input, Textarea, Select } from './Input';
export { ThemeToggle } from './ThemeToggle';
```

- [ ] **Step 9: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/ui
git commit -m "feat(frontend): UI kit primitives (Button/Card/Badge/Avatar/Skeleton/EmptyState/Input)"
```

---

## Task 4: Toast provider

**Files:** Create `frontend/src/components/ui/Toast.tsx` + `Toast.module.scss`; Modify `frontend/src/app/providers.tsx`, `frontend/src/components/ui/index.ts`

- [ ] **Step 1: `Toast.tsx` + `Toast.module.scss`**

```typescript
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import styles from './Toast.module.scss';

type Toast = { id: number; message: string; tone: 'success' | 'error' };
type ToastCtx = (message: string, tone?: 'success' | 'error') => void;

const Ctx = createContext<ToastCtx>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<ToastCtx>((message, tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className={styles.wrap}>
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.tone]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
```

```scss
.wrap {
  position: fixed;
  bottom: var(--space-5);
  right: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 1000;
}

.toast {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--fs-sm);
  color: #fff;
  animation: slidein 0.2s ease;
}

.success {
  background: var(--color-success);
}

.error {
  background: var(--color-danger);
}

@keyframes slidein {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

- [ ] **Step 2: Wrap app in `ToastProvider`** — edit `frontend/src/app/providers.tsx` to nest the ToastProvider inside the QueryClientProvider:

```typescript
'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '../components/ui/Toast';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 3: Add Toast exports to `index.ts`** — append:

```typescript
export { ToastProvider, useToast } from './Toast';
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/ui/Toast.tsx frontend/src/components/ui/Toast.module.scss frontend/src/components/ui/index.ts frontend/src/app/providers.tsx
git commit -m "feat(frontend): toast provider"
```

---

## Task 5: Refactor Header (theme toggle, profile menu, active link, mobile, icons)

**Files:** Replace `frontend/src/components/Header.tsx` + `Header.module.scss`

- [ ] **Step 1: Replace `Header.tsx`**

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { BookOpen, Plus, MessageSquare, User, LogOut, Menu } from 'lucide-react';
import { Avatar, ThemeToggle } from './ui';
import styles from './Header.module.scss';

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const user = session?.user;
  if (!user) return <header className={styles.header} />;

  const email = user.email ?? '';
  const links = [
    { href: '/', label: 'Courses', icon: <BookOpen size={16} /> },
    ...(user.role === 'TEACHER'
      ? [
          {
            href: '/teacher/courses/new',
            label: 'Create',
            icon: <Plus size={16} />,
          },
        ]
      : []),
    { href: '/chat', label: 'Chat', icon: <MessageSquare size={16} /> },
    { href: '/profile', label: 'Profile', icon: <User size={16} /> },
  ];

  return (
    <header className={styles.header}>
      <button
        className={styles.burger}
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>

      <nav className={`${styles.nav} ${open ? styles.navOpen : ''}`}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className={`${styles.link} ${pathname === l.href ? styles.active : ''}`}
          >
            {l.icon}
            {l.label}
          </Link>
        ))}
      </nav>

      <div className={styles.right}>
        <ThemeToggle />
        <span className={styles.email}>{email}</span>
        <Avatar name={email} size={34} />
        <button
          className={styles.logout}
          onClick={() => signOut({ callbackUrl: '/login' })}
          aria-label="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Replace `Header.module.scss`**

```scss
.header {
  height: 64px;
  background: var(--color-header);
  color: var(--color-header-text);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-5);
}

.nav {
  display: flex;
  gap: var(--space-2);
}

.link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-header-text);
  font-size: var(--fs-sm);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  opacity: 0.85;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.08);
  }
}

.active {
  opacity: 1;
  background: rgba(255, 255, 255, 0.14);
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.email {
  font-size: var(--fs-sm);
  white-space: nowrap;
}

.logout {
  background: transparent;
  border: none;
  color: var(--color-header-text);
  cursor: pointer;
  display: inline-flex;
  opacity: 0.85;

  &:hover {
    opacity: 1;
  }
}

.burger {
  display: none;
  background: transparent;
  border: none;
  color: var(--color-header-text);
  cursor: pointer;
}

@media (max-width: 720px) {
  .email {
    display: none;
  }

  .burger {
    display: inline-flex;
  }

  .nav {
    display: none;
    position: absolute;
    top: 64px;
    left: 0;
    right: 0;
    flex-direction: column;
    background: var(--color-header);
    padding: var(--space-3);
    z-index: 50;
  }

  .navOpen {
    display: flex;
  }
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/Header.tsx frontend/src/components/Header.module.scss
git commit -m "feat(frontend): refactor Header (theme toggle, icons, active link, mobile menu)"
```

---

## Task 6: Refactor CourseCard, Footer, auth styles to tokens/kit

**Files:** Replace `frontend/src/components/CourseCard.tsx` + `CourseCard.module.scss`, `frontend/src/components/Footer.module.scss`, `frontend/src/app/(auth)/auth-form.module.scss`

- [ ] **Step 1: Replace `CourseCard.tsx`** (gradient cover, status Badge, Button)

```typescript
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientApi } from '../lib/api/client';
import type { CourseListItem, SessionUser } from '../lib/types';
import { Button, Badge } from './ui';
import styles from './CourseCard.module.scss';

const ASSET_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
).replace(/\/api$/, '');

export function CourseCard({
  course,
  user,
}: {
  course: CourseListItem;
  user: SessionUser;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const imageSrc = course.imageUrl
    ? course.imageUrl.startsWith('/public')
      ? `${ASSET_BASE}${course.imageUrl}`
      : course.imageUrl
    : null;

  async function enroll() {
    setBusy(true);
    try {
      await clientApi(`/courses/${course.id}/enroll`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.image}>
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={course.title} />
        ) : (
          <div className={styles.gradient}>{course.title.charAt(0)}</div>
        )}
        {course.enrollmentStatus === 'ACTIVE' && (
          <span className={styles.statusBadge}>
            <Badge tone="success">Active</Badge>
          </span>
        )}
        {course.enrollmentStatus === 'PENDING' && (
          <span className={styles.statusBadge}>
            <Badge tone="warning">Pending</Badge>
          </span>
        )}
      </div>
      <div className={styles.content}>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <div className={styles.actions}>{renderActions()}</div>
      </div>
    </div>
  );

  function renderActions() {
    if (user.role === 'STUDENT') {
      if (course.enrollmentStatus === 'ACTIVE') {
        return (
          <Link href={`/courses/${course.id}`}>
            <Button variant="primary">Open</Button>
          </Link>
        );
      }
      if (course.enrollmentStatus === 'PENDING') {
        return (
          <Button variant="ghost" disabled>
            Pending
          </Button>
        );
      }
      return (
        <Button variant="primary" onClick={enroll} loading={busy}>
          Enroll
        </Button>
      );
    }
    const canEdit = user.role === 'ADMIN' || user.id === course.teacherId;
    return (
      <>
        <Link href={`/courses/${course.id}`}>
          <Button variant="outline">View</Button>
        </Link>
        {canEdit && (
          <Link href={`/teacher/courses/${course.id}/builder`}>
            <Button variant="outline">Edit</Button>
          </Link>
        )}
      </>
    );
  }
}
```

- [ ] **Step 2: Replace `CourseCard.module.scss`**

```scss
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition:
    transform 0.15s,
    box-shadow 0.15s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }
}

.image {
  position: relative;
  height: 160px;
  background: var(--color-surface-2);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.gradient {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), #7c3aed);
}

.statusBadge {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
}

.content {
  padding: var(--space-4);

  h3 {
    font-size: var(--fs-lg);
    margin-bottom: var(--space-2);
    color: var(--color-text);
  }

  p {
    font-size: var(--fs-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--space-4);
    min-height: 20px;
  }
}

.actions {
  display: flex;
  gap: var(--space-2);
}
```

- [ ] **Step 3: Replace `Footer.module.scss`**

```scss
.footer {
  height: 48px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-sm);
  border-top: 1px solid var(--color-border);
}
```

- [ ] **Step 4: Replace `(auth)/auth-form.module.scss`** (tokens; the Login/RegisterForm keep their markup but inherit themed fields/buttons)

```scss
.wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  padding: var(--space-4);
}

.form {
  width: 100%;
  max-width: 380px;
  background: var(--color-surface);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  h1 {
    text-align: center;
    font-size: var(--fs-xl);
    margin-bottom: var(--space-1);
    color: var(--color-text);
  }
}

.input,
.select {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--fs-sm);
  background: var(--color-surface);
  color: var(--color-text);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.button {
  width: 100%;
  padding: var(--space-3);
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--fs-md);
  cursor: pointer;

  &:hover {
    background: var(--color-primary-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.error {
  color: var(--color-danger);
  text-align: center;
  font-size: var(--fs-sm);
}

.fieldError {
  color: var(--color-danger);
  font-size: var(--fs-xs);
  margin-top: -6px;
}

.switch {
  text-align: center;
  font-size: var(--fs-sm);

  a {
    color: var(--color-primary);
  }
}
```

- [ ] **Step 5: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add frontend/src/components/CourseCard.tsx frontend/src/components/CourseCard.module.scss frontend/src/components/Footer.module.scss "frontend/src/app/(auth)/auth-form.module.scss"
git commit -m "feat(frontend): refactor CourseCard/Footer/auth to tokens + UI kit"
```

---

## Task 7: Verification

**Files:** none (runtime).

- [ ] **Step 1: Build, then run dev**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest.log 2>&1 & ) ; sleep 10
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/frontend
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; sleep 1
( npm run dev > /tmp/next.log 2>&1 & ) ; sleep 8
grep -iE "ready|error" /tmp/next.log | head -2
curl -s http://localhost:3000/login | grep -o 'Sign in' | head -1
```
Expected: dev ready; `/login` renders `Sign in`.

- [ ] **Step 2: MANUAL browser check** (record results) — log in (`teacher@example.com` / `password123`):
  1. Header shows icons, active-link highlight, theme toggle, avatar.
  2. Click the theme toggle → whole app switches dark/light instantly, no flash; reload preserves the choice.
  3. Course cards show gradient covers (no-image) + status badges; buttons themed.
  4. Resize narrow → burger menu appears and works.
  5. Login/Register pages are themed (dark + light).

- [ ] **Step 3: Stop servers**

```bash
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null
true
```

No commit.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** tokens + dark theme + no-flash script (Task 1–2); UI kit Button/Card/Badge/Avatar/Skeleton/EmptyState/Input/ThemeToggle (Task 3), Toast (Task 4); Header refactor with toggle/menu/icons (Task 5); CourseCard/Footer/auth to tokens (Task 6). Matches spec §3–5. ✓
- **Deferred to A2 (per spec):** the cabinet/dashboard page + `GET /api/dashboard` + `?search=`. Login/Register markup keeps its own `.module.scss` classes (now tokenized) rather than swapping to `<Input>`/`<Button>` to avoid touching the rhf wiring — visually equivalent, themed. ✓
- **Placeholder scan:** none. **Type consistency:** `Theme` type, `useToast` signature, UI prop names consistent; `index.ts` re-exports match component exports. ✓
- **Turbopack purity:** element selectors are nested under classes (`.content h3`, `.form h1`, `.field:focus`); no bare top-level element selectors. ✓
