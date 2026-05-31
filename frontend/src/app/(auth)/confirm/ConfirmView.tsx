'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../auth-form.module.scss';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export function ConfirmView() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    fetch(`${API}/auth/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => setState(r.ok ? 'ok' : 'error'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.form}>
        {state === 'loading' && <h1>Confirming…</h1>}
        {state === 'ok' && (
          <>
            <h1>Email confirmed ✓</h1>
            <p style={{ textAlign: 'center', fontSize: 14 }}>
              Your account is now active.
            </p>
            <Link
              href="/login"
              className={styles.button}
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              Sign in
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <h1>Link invalid</h1>
            <p className={styles.error}>
              This confirmation link is invalid or already used.
            </p>
            <p className={styles.switch}>
              <Link href="/register">Register again</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
