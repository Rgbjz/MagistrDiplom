'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../../lib/api/client';
import { useApiErrorMessage } from '../../../i18n/format';
import { getThemePref, setThemePref, type ThemePref } from '../../../lib/theme';
import type { Me, UserProfile } from '../../../lib/types';
import { Segmented, useToast } from '../../../components/ui';
import { LanguageSegmented } from '../../../components/layout/LanguageSwitcher';
import { useTranslations } from 'next-intl';
import styles from './profile.module.scss';

export function SettingsSection({ me }: { me: Me }) {
  const t = useTranslations('profile.settings');
  const errorText = useApiErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [theme, setThemeState] = useState<ThemePref>('system');

  useEffect(() => {
    setThemeState(getThemePref());
  }, []);

  const emailOn = me.profile?.emailNotifications ?? true;
  const remindersOn = me.profile?.deadlineReminders ?? true;
  type Toggle = { field: 'emailNotifications' | 'deadlineReminders'; on: boolean };
  // The inputs are controlled: show the new value until `me` has refetched.
  const [pending, setPending] = useState<Toggle | null>(null);
  const saveEmail = useMutation({
    mutationFn: ({ field, on }: Toggle) => {
      const fd = new FormData();
      fd.append(field, String(on));
      return clientApi<UserProfile>('/users/me/profile', { method: 'PUT', body: fd });
    },
    onSuccess: () => {
      toast(t('saved'));
      return queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorText(e), 'error'),
    onSettled: () => setPending(null),
  });
  const shown = (field: Toggle['field'], saved: boolean) =>
    pending?.field === field ? pending.on : saved;
  const toggle = (next: Toggle) => {
    setPending(next);
    saveEmail.mutate(next);
  };

  const tLang = useTranslations('nav.language');
  return (
    <section id="settings" className={styles.card} aria-labelledby="settings-title">
      <h2 id="settings-title" className={styles.sectionTitle}>
        {t('title')}
      </h2>
      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>{t('theme')}</span>
        <Segmented<ThemePref>
          label={t('theme')}
          value={theme}
          onChange={(v) => {
            setThemePref(v);
            setThemeState(v);
          }}
          items={[
            { value: 'light', label: t('themeLight') },
            { value: 'dark', label: t('themeDark') },
            { value: 'system', label: t('themeSystem') },
          ]}
        />
      </div>
      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>{tLang('label')}</span>
        <LanguageSegmented />
      </div>
      <fieldset className={styles.fieldset}>
        <legend className={styles.settingLabel}>{t('emailTitle')}</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={shown('emailNotifications', emailOn)}
            disabled={saveEmail.isPending}
            onChange={(e) =>
              toggle({ field: 'emailNotifications', on: e.currentTarget.checked })
            }
          />
          {t('emailToggle')}
        </label>
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend className={styles.settingLabel}>{t('remindersTitle')}</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={shown('deadlineReminders', remindersOn)}
            disabled={saveEmail.isPending}
            onChange={(e) =>
              toggle({ field: 'deadlineReminders', on: e.currentTarget.checked })
            }
          />
          {t('remindersToggle')}
        </label>
      </fieldset>
    </section>
  );
}
