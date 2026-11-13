'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Eye, FlaskConical, MousePointerClick, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { downloadFile } from '../../lib/api/download';
import { useFormat } from '../../i18n/format';
import type { AdaptiveOverview, AdaptiveSettings, MasteryLevel } from '../../lib/types';
import { Badge, Button, Field, Input, ScrollArea, Segmented, Skeleton, StatCard, useToast } from '../ui';
import { Forbidden, QueryError } from '../states';
import { MessageButton } from '../chat/MessageButton';
import ui from '../teacher/shared.module.scss';
import styles from './adaptive.module.scss';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/**
 * Course team: settings of the adaptation module, the A/B experiment,
 * recommendation statistics and a students × topics mastery heatmap.
 */
export function AdaptationTab({ courseId, canManage }: { courseId: number; canManage: boolean }) {
  const t = useTranslations('adaptive.tab');
  const tl = useTranslations('adaptive.panel.level');
  const f = useFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['adaptive-overview', courseId],
    queryFn: () => clientApi<AdaptiveOverview>(`/courses/${courseId}/adaptive/overview`),
  });

  const [form, setForm] = useState<AdaptiveSettings | null>(null);
  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  const save = useMutation({
    mutationFn: (body: Partial<AdaptiveSettings>) =>
      clientApi<AdaptiveSettings>(`/courses/${courseId}/adaptive/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast(t('saved'));
      void queryClient.invalidateQueries({ queryKey: ['adaptive-overview', courseId] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const recompute = useMutation({
    mutationFn: () =>
      clientApi<{ events: number }>(`/courses/${courseId}/adaptive/recompute`, { method: 'POST' }),
    onSuccess: (r) => {
      toast(t('recomputed', { events: r.events }));
      void queryClient.invalidateQueries({ queryKey: ['adaptive-overview', courseId] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (isLoading || (data && !form)) {
    return (
      <div className={styles.stack} aria-busy="true">
        <Skeleton height={220} radius="var(--radius-lg)" />
        <Skeleton height={320} radius="var(--radius-lg)" />
      </div>
    );
  }
  if (isError || !data || !form) {
    return String((error as Error | null)?.message).includes('403') ? (
      <Forbidden />
    ) : (
      <QueryError error={error} onRetry={() => void refetch()} />
    );
  }

  const percentInput = (key: 'masteryThreshold' | 'accelerationThreshold', label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="numeric"
        min={key === 'masteryThreshold' ? 30 : 50}
        max={key === 'masteryThreshold' ? 90 : 100}
        value={Math.round(form[key] * 100)}
        disabled={!canManage}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) / 100 })}
      />
    </Field>
  );

  const rec = data.recommendations;
  const share = (n: number) => (rec.shown ? ` (${Math.round((100 * n) / rec.shown)}%)` : '');

  return (
    <div className={styles.stack}>
      <section className={`${ui.card} ${ui.cardPad} ${styles.stack}`} aria-labelledby="adaptive-settings">
        <div className={ui.sectionHead}>
          <div>
            <h2 id="adaptive-settings" className={ui.h2}>
              <Sparkles size={20} aria-hidden="true" className={styles.inlineIcon} />
              {t('title')}
            </h2>
            <p className={ui.muted}>{t('subtitle')}</p>
          </div>
          <div className={styles.actions}>
            <Button
              variant="outline"
              size="sm"
              loading={recompute.isPending}
              disabled={!canManage}
              onClick={() => recompute.mutate()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {t('recompute')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void downloadFile(`/courses/${courseId}/adaptive/experiment/export`, 'adaptive-experiment.csv').catch(
                  (e: Error) => toast(e.message, 'error'),
                )
              }
            >
              <Download size={16} aria-hidden="true" />
              {t('export')}
            </Button>
          </div>
        </div>

        <form
          className={styles.settings}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              enabled: form.enabled,
              masteryThreshold: form.masteryThreshold,
              accelerationThreshold: form.accelerationThreshold,
              adaptiveTestsDefault: form.adaptiveTestsDefault,
              experimentMode: form.experimentMode,
            });
          }}
        >
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={!canManage}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            <span>
              <span className={styles.checkLabel}>{t('enabled')}</span>
              <span className={ui.muted}>{t('enabledHint')}</span>
            </span>
          </label>
          <div className={styles.fields}>
            {percentInput('masteryThreshold', t('threshold'), t('thresholdHint'))}
            {percentInput('accelerationThreshold', t('acceleration'), t('accelerationHint'))}
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.adaptiveTestsDefault}
              disabled={!canManage}
              onChange={(e) => setForm({ ...form, adaptiveTestsDefault: e.target.checked })}
            />
            <span>
              <span className={styles.checkLabel}>{t('adaptiveTests')}</span>
              <span className={ui.muted}>{t('adaptiveTestsHint')}</span>
            </span>
          </label>
          <fieldset className={styles.experiment} disabled={!canManage}>
            <legend className={styles.checkLabel}>
              <FlaskConical size={16} aria-hidden="true" className={styles.inlineIcon} />
              {t('experiment')}
            </legend>
            <p className={ui.muted}>{t('experimentHint')}</p>
            <Segmented<'OFF' | 'AB_TEST'>
              label={t('experiment')}
              value={form.experimentMode}
              onChange={(v) => setForm({ ...form, experimentMode: v })}
              items={[
                { value: 'OFF', label: 'OFF' },
                { value: 'AB_TEST', label: 'A/B' },
              ]}
            />
            {data.settings.experimentMode === 'AB_TEST' && (
              <p className={styles.note}>
                {data.settings.experimentStartedAt &&
                  t('experimentOn', { date: f.date(data.settings.experimentStartedAt) })}{' '}
                {t('groups', { adaptive: data.groups.ADAPTIVE, control: data.groups.CONTROL })}
              </p>
            )}
          </fieldset>
          {canManage && (
            <div>
              <Button type="submit" loading={save.isPending}>
                {t('save')}
              </Button>
            </div>
          )}
        </form>
      </section>

      <section aria-label={t('stats')} className={styles.statRow}>
        <StatCard icon={<Eye size={22} aria-hidden="true" />} value={rec.shown} label={t('shown')} />
        <StatCard
          icon={<MousePointerClick size={22} aria-hidden="true" />}
          value={`${rec.opened}${share(rec.opened)}`}
          label={t('opened')}
          tone="warning"
        />
        <StatCard
          icon={<CheckCircle2 size={22} aria-hidden="true" />}
          value={`${rec.followed}${share(rec.followed)}`}
          label={t('followed')}
          tone="success"
        />
      </section>
      <p className={ui.muted}>{t('followedHint')}</p>

      <section className={ui.card} aria-labelledby="adaptive-heatmap">
        <div className={`${ui.cardPad} ${styles.cardHead}`}>
          <h2 id="adaptive-heatmap" className={ui.h3}>
            {t('heatmap')}
          </h2>
          <p className={ui.muted}>{t('heatmapHint')}</p>
        </div>
        {data.students.length === 0 ? (
          <p className={`${ui.cardPad} ${ui.muted}`}>{t('noStudents')}</p>
        ) : (
          <ScrollArea className={ui.tableWrap}>
            <table className={`${ui.table} ${styles.heatmap}`}>
              <thead>
                <tr>
                  <th scope="col">{t('student')}</th>
                  {data.settings.experimentMode === 'AB_TEST' && <th scope="col">{t('group')}</th>}
                  {data.sections.map((s) => (
                    <th key={s.id} scope="col" className={styles.sectionHead}>
                      {s.title}
                    </th>
                  ))}
                  <th scope="col">{t('mean')}</th>
                  <th scope="col">{t('theta')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('write')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.userId}>
                    <th scope="row" className={styles.studentCell}>
                      <span className={styles.studentInner}>
                        <span className={ui.personName}>{s.name}</span>
                        {s.weakSections > 0 && (
                          <Badge tone="warning">
                            {t('weak')}: {s.weakSections}
                          </Badge>
                        )}
                      </span>
                    </th>
                    {data.settings.experimentMode === 'AB_TEST' && (
                      <td>{s.group ? t(`groupName.${s.group}`) : '—'}</td>
                    )}
                    {s.cells.map((c) => (
                      <td key={c.sectionId}>
                        <span
                          className={styles.cell}
                          data-level={c.level satisfies MasteryLevel}
                          title={tl(c.level)}
                        >
                          {c.evidence > 0 ? pct(c.mastery) : '—'}
                          <span className="sr-only"> — {tl(c.level)}</span>
                        </span>
                      </td>
                    ))}
                    <td className={styles.num}>{pct(s.meanMastery)}</td>
                    <td className={styles.num}>{s.theta === null ? '—' : s.theta.toFixed(2)}</td>
                    <td>
                      <MessageButton userId={s.userId} name={s.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('sectionMean')}</th>
                  {data.settings.experimentMode === 'AB_TEST' && <td />}
                  {data.sections.map((s) => (
                    <td key={s.id} className={styles.num}>
                      {pct(s.meanMastery)}
                    </td>
                  ))}
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </ScrollArea>
        )}
      </section>
    </div>
  );
}
