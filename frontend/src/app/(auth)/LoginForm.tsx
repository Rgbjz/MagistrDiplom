'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import styles from './auth-form.module.scss';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await signIn('credentials', {
      ...values,
      redirect: false,
    });
    if (res?.error) {
      setServerError('Invalid credentials — and make sure your email is confirmed');
      return;
    }
    router.push('/');
    router.refresh();
  });

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={onSubmit}>
        <h1>Sign in</h1>
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
        {serverError && <p className={styles.error}>{serverError}</p>}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className={styles.switch}>
          No account? <Link href="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}
