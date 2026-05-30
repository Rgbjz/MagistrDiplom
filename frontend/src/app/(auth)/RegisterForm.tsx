'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
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
    const login = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (login?.error) {
      setServerError('Registered, but auto sign-in failed. Try logging in.');
      return;
    }
    router.push('/');
    router.refresh();
  });

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
