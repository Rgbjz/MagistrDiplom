'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import Link from 'next/link';
import styles from './auth-form.module.scss';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 characters'),
  role: z.enum(['STUDENT', 'TEACHER']),
});

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmLink, setConfirmLink] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'STUDENT' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setServerError('Registration failed (email may be taken)');
      return;
    }
    const data = (await res.json()) as { email: string; confirmToken: string };
    setConfirmLink(`/confirm?token=${data.confirmToken}`);
  });

  if (confirmLink) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.form}>
          <h1>Confirm your email</h1>
          <p style={{ textAlign: 'center', fontSize: 14 }}>
            We&apos;ve &quot;sent&quot; a confirmation link. In a real product it
            would arrive by email — here it is:
          </p>
          <Link
            href={confirmLink}
            className={styles.button}
            style={{ textAlign: 'center', textDecoration: 'none' }}
          >
            Confirm email
          </Link>
          <p className={styles.switch}>
            Already confirmed? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={onSubmit}>
        <h1>Create account</h1>
        <input
          className={styles.input}
          placeholder="Email"
          {...register('email')}
        />
        {errors.email && (
          <span className={styles.fieldError}>{errors.email.message}</span>
        )}
        <input
          className={styles.input}
          type="password"
          placeholder="Password"
          {...register('password')}
        />
        {errors.password && (
          <span className={styles.fieldError}>{errors.password.message}</span>
        )}
        <select className={styles.select} {...register('role')}>
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
        </select>
        {serverError && <p className={styles.error}>{serverError}</p>}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Register'}
        </button>
        <p className={styles.switch}>
          Have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
