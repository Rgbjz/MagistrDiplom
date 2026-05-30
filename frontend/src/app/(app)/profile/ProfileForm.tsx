'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../../lib/api/client';
import type { Me, UserProfile } from '../../../lib/types';
import styles from './profile.module.scss';

const ASSET_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
).replace(/\/api$/, '');

const MAX = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const schema = z.object({
  firstName: z.string().max(50, 'Too long').optional(),
  lastName: z.string().max(50, 'Too long').optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  avatar: z
    .instanceof(File)
    .optional()
    .refine((f) => !f || f.size <= MAX, 'Max size 2MB')
    .refine((f) => !f || TYPES.includes(f.type), 'Unsupported format'),
});

type FormValues = z.infer<typeof schema>;

export function ProfileForm() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });

  const [preview, setPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (me?.profile) {
      reset({
        firstName: me.profile.firstName ?? '',
        lastName: me.profile.lastName ?? '',
        bio: me.profile.bio ?? '',
      });
    }
  }, [me, reset]);

  const mutation = useMutation({
    mutationFn: (fd: FormData) =>
      clientApi<UserProfile>('/users/me/profile', {
        method: 'PUT',
        body: fd,
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const onSubmit = handleSubmit((values) => {
    setSaved(false);
    const fd = new FormData();
    fd.append('firstName', values.firstName ?? '');
    fd.append('lastName', values.lastName ?? '');
    fd.append('bio', values.bio ?? '');
    if (values.avatar) fd.append('avatar', values.avatar);
    mutation.mutate(fd);
  });

  if (!me) return <p>Loading…</p>;

  const currentAvatar = me.profile?.avatarUrl
    ? `${ASSET_BASE}${me.profile.avatarUrl}`
    : null;
  const shown = preview ?? currentAvatar;
  const initial = me.email.charAt(0).toUpperCase();

  return (
    <div className={styles.profile}>
      <h1>Profile</h1>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.avatarBlock}>
          <div className={styles.avatar}>
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt="avatar" />
            ) : (
              initial
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) {
                setValue('avatar', file, { shouldValidate: true });
                setPreview(URL.createObjectURL(file));
              }
            }}
          />
        </div>
        {errors.avatar && (
          <span className={styles.error}>{errors.avatar.message}</span>
        )}

        <div className={styles.field}>
          <label>Email</label>
          <input value={me.email} disabled />
        </div>
        <div className={styles.field}>
          <label>First name</label>
          <input {...register('firstName')} />
          {errors.firstName && (
            <span className={styles.error}>{errors.firstName.message}</span>
          )}
        </div>
        <div className={styles.field}>
          <label>Last name</label>
          <input {...register('lastName')} />
          {errors.lastName && (
            <span className={styles.error}>{errors.lastName.message}</span>
          )}
        </div>
        <div className={styles.field}>
          <label>Bio</label>
          <textarea rows={4} {...register('bio')} />
          {errors.bio && (
            <span className={styles.error}>{errors.bio.message}</span>
          )}
        </div>

        {saved && <span className={styles.saved}>Saved ✓</span>}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
