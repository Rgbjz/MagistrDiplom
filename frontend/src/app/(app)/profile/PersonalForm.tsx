'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../../lib/api/client';
import { useApiErrorMessage } from '../../../i18n/format';
import type { Me, UserProfile } from '../../../lib/types';
import { Button, Field, Input, Textarea, useToast } from '../../../components/ui';
import styles from './profile.module.scss';

function makeSchema(t: (key: 'max50' | 'max500') => string) {
  return z.object({
    firstName: z.string().trim().max(50, t('max50')),
    lastName: z.string().trim().max(50, t('max50')),
    bio: z.string().trim().max(500, t('max500')),
  });
}
type Values = z.infer<ReturnType<typeof makeSchema>>;

export function PersonalForm({ me }: { me: Me }) {
  const t = useTranslations('profile.personal');
  const errorText = useApiErrorMessage();
  const schema = useMemo(() => makeSchema(t), [t]);
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    reset({
      firstName: me.profile?.firstName ?? '',
      lastName: me.profile?.lastName ?? '',
      bio: me.profile?.bio ?? '',
    });
  }, [me, reset]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const fd = new FormData();
      fd.append('firstName', v.firstName);
      fd.append('lastName', v.lastName);
      fd.append('bio', v.bio);
      return clientApi<UserProfile>('/users/me/profile', { method: 'PUT', body: fd });
    },
    onSuccess: () => {
      toast(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <section className={styles.card} aria-labelledby="personal-title">
      <h2 id="personal-title" className={styles.sectionTitle}>
        {t('title')}
      </h2>
      <form className={styles.form} onSubmit={handleSubmit((v) => save.mutate(v))}>
        <div className={styles.row2}>
          <Field label={t('firstName')} error={errors.firstName?.message}>
            <Input autoComplete="given-name" {...register('firstName')} />
          </Field>
          <Field label={t('lastName')} error={errors.lastName?.message}>
            <Input autoComplete="family-name" {...register('lastName')} />
          </Field>
        </div>
        <Field label={t('bio')} error={errors.bio?.message}>
          <Textarea rows={3} {...register('bio')} />
        </Field>
        <div>
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            {t('save')}
          </Button>
        </div>
      </form>
    </section>
  );
}
