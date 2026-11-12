'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Camera, MailWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import { displayName, fileUrl } from '../../../lib/format';
import { useApiErrorMessage, useLabels } from '../../../i18n/format';
import type { Me, MyCourse, UserProfile } from '../../../lib/types';
import { Avatar, Badge, useToast } from '../../../components/ui';
import styles from './profile.module.scss';

const MAX = 2 * 1024 * 1024;

export function ProfileSidebar({
  me,
  courses,
}: {
  me: Me;
  courses?: MyCourse[];
}) {
  const t = useTranslations('profile.sidebar');
  const labels = useLabels();
  const errorText = useApiErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const name = displayName(me.profile, me.email);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('avatar', file);
      return clientApi<UserProfile>('/users/me/profile', { method: 'PUT', body: fd });
    },
    onSuccess: () => {
      toast(t('photoUpdated'));
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => {
      setPreview(null);
      toast(errorText(e, t('photoUploadFailed')), 'error');
    },
  });

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast(t('chooseImage'), 'error');
      return;
    }
    if (file.size > MAX) {
      toast(t('tooLarge'), 'error');
      return;
    }
    setPreview(URL.createObjectURL(file));
    upload.mutate(file);
  }

  const stats = courses
    ? [
        { label: t('stats.courses'), value: courses.length },
        {
          label: t('stats.lessons'),
          value: courses.reduce((n, c) => n + c.progress.completed, 0),
        },
        {
          label: t('stats.certificates'),
          value: courses.filter((c) => c.certificateCode).length,
        },
      ]
    : null;

  return (
    <aside className={`${styles.card} ${styles.sidebar}`}>
      <Avatar src={preview ?? fileUrl(me.profile?.avatarUrl)} name={name} size={96} />
      <label className={styles.upload}>
        <Camera size={16} aria-hidden="true" />
        {upload.isPending ? t('uploading') : t('changePhoto')}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => onFile(e.currentTarget.files?.[0])}
        />
      </label>
      <span className={styles.hint}>{t('photoHint')}</span>

      <div className={styles.identity}>
        <span className={styles.name}>{name}</span>
        <Badge tone="primary">{labels.role(me.role)}</Badge>
      </div>
      <span className={styles.email}>{me.email}</span>
      {me.emailVerified === false ? (
        <span className={`${styles.verify} ${styles.verifyWarn}`}>
          <MailWarning size={16} aria-hidden="true" /> {t('emailNotVerified')}
        </span>
      ) : (
        <span className={styles.verify}>
          <BadgeCheck size={16} aria-hidden="true" /> {t('emailVerified')}
        </span>
      )}

      {stats && (
        <dl className={styles.stats}>
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
