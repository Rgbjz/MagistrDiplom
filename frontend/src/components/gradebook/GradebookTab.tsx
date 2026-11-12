'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileSpreadsheet, FileText, PencilLine, Search, Settings } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { downloadFile } from '../../lib/api/download';
import { useLocale, useTranslations } from 'next-intl';
import { fileUrl } from '../../lib/format';
import { useApiErrorMessage } from '../../i18n/format';
import type { Gradebook, GradebookColumn, OverrideMark } from '../../lib/types';
import { Avatar, Badge, Button, EmptyState, Skeleton, useToast } from '../ui';
import { NoResults, QueryError } from '../states';
import { cellText, groupBySection, pct as pctOf } from './grades';
import { OverrideDialog, type OverrideTarget } from './OverrideDialog';
import { useScaleLabel } from './scale';
import styles from './gradebook.module.scss';

/** Pencil mark for a manually changed value — icon plus text, not color alone. */
function OverrideIcon({ mark }: { mark: OverrideMark }) {
  const t = useTranslations('gradebook.override');
  return (
    <span className={styles.overrideMark} title={t('mark', { reason: mark.reason })}>
      <PencilLine size={12} aria-hidden="true" />
      <span className="sr-only">
        {t('markSr')}: {mark.reason}
      </span>
    </span>
  );
}

function ColumnHead({ column }: { column: GradebookColumn }) {
  const t = useTranslations('gradebook');
  return (
    <th scope="col" className={styles.colHead}>
      <span className={styles.kind}>{column.kind === 'test' ? t('column.test') : t('column.assignment')}</span>
      <span className={styles.colTitle} title={column.title}>
        {column.title}
      </span>
      <span className={styles.colMax}>{column.kind === 'test' ? '%' : t('column.outOf', { max: column.max })}</span>
    </th>
  );
}

export function GradebookTab({ courseId }: { courseId: number }) {
  const toast = useToast();
  const t = useTranslations('gradebook');
  const errorText = useApiErrorMessage();
  // English uses a decimal point, Ukrainian and Polish a comma.
  const locale = useLocale();
  const comma = locale !== 'en';
  const pct = (n: number | null) => pctOf(n, comma);
  const cellWord = (key: 'submitted' | 'returned' | 'late') => t(`cell.${key}`);
  const [query, setQuery] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);
  const [target, setTarget] = useState<OverrideTarget | null>(null);
  const scaleLabel = useScaleLabel();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['gradebook', courseId],
    queryFn: () => clientApi<Gradebook>(`/courses/${courseId}/gradebook`),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) &&
        (!failedOnly || !r.passed),
    );
  }, [data, query, failedOnly]);

  async function exportAs(format: 'xlsx' | 'csv') {
    setExporting(format);
    try {
      await downloadFile(
        `/courses/${courseId}/gradebook/export?format=${format}&lang=${locale}`,
        `gradebook-${courseId}.${format}`,
      );
    } catch (e) {
      toast(errorText(e, t('exportFailed')), 'error');
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) return <Skeleton height={320} radius="var(--radius-lg)" />;
  if (isError || !data) return <QueryError error={error} onRetry={() => void refetch()} />;

  const { columns, stats, course } = data;
  const groups = groupBySection(columns);

  if (columns.length === 0) {
    return (
      <EmptyState icon={<ClipboardList size={28} aria-hidden="true" />} title={t('emptyTitle')}>
        <p className={styles.muted}>{t('emptyHint')}</p>
      </EmptyState>
    );
  }

  return (
    <section className={styles.wrap} aria-labelledby="gradebook-title">
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 id="gradebook-title" className={styles.title}>
            {t('title')}
          </h2>
          <p className={styles.muted}>
            {t('weights', {
              tests: course.testsWeight,
              assignments: course.assignmentsWeight,
              threshold: course.gradePassThreshold,
            })}{' '}
            <Link href={`/teacher/courses/${courseId}/builder?tab=settings`} className={styles.link}>
              <Settings size={14} aria-hidden="true" /> {t('change')}
            </Link>
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="outline"
            loading={exporting === 'xlsx'}
            onClick={() => void exportAs('xlsx')}
          >
            <FileSpreadsheet size={16} aria-hidden="true" /> {t('exportExcel')}
          </Button>
          <Button variant="outline" loading={exporting === 'csv'} onClick={() => void exportAs('csv')}>
            <FileText size={16} aria-hidden="true" /> {t('exportCsv')}
          </Button>
        </div>
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>{t('stats.students')}</dt>
          <dd>{stats.studentsCount}</dd>
        </div>
        <div>
          <dt>{t('stats.avgFinal')}</dt>
          <dd>{pct(stats.avgFinal)}</dd>
        </div>
        <div>
          <dt>{t('stats.passed')}</dt>
          <dd>{stats.passRate === null ? '—' : `${stats.passRate}%`}</dd>
        </div>
      </dl>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{t('search')}</span>
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
          {t('failedOnly')}
        </label>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title={t('noStudents')} />
      ) : rows.length === 0 ? (
        <NoResults
          query={query}
          onReset={() => {
            setQuery('');
            setFailedOnly(false);
          }}
        />
      ) : (
        <div className={styles.tableWrap} tabIndex={0} aria-label={t('tableAria')}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" rowSpan={2} className={`${styles.sticky} ${styles.studentHead}`}>
                  {t('head.student')}
                </th>
                {groups.map((g, i) => (
                  <th key={`${g.title}-${i}`} scope="colgroup" colSpan={g.columns.length} className={styles.groupHead}>
                    {g.title}
                  </th>
                ))}
                <th scope="col" rowSpan={2} className={styles.sumHead}>
                  {t('head.tests')}
                </th>
                <th scope="col" rowSpan={2} className={styles.sumHead}>
                  {t('head.assignments')}
                </th>
                <th scope="col" rowSpan={2} className={styles.sumHead}>
                  {t('head.final')}
                </th>
                <th scope="col" rowSpan={2} className={styles.sumHead}>
                  {t('head.scale')}
                </th>
              </tr>
              <tr>
                {columns.map((c) => (
                  <ColumnHead key={c.key} column={c} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <th scope="row" className={styles.sticky}>
                    <span className={styles.person}>
                      <Avatar src={fileUrl(r.avatarUrl)} name={r.name} size={28} />
                      <span className={styles.personText}>
                        <span className={styles.personName}>{r.name}</span>
                        <span className={styles.personSub}>{r.email}</span>
                      </span>
                    </span>
                  </th>
                  {columns.map((c) => {
                    const cell = r.cells[c.key];
                    const label = `${t(`state.${cell.state}`)}${cell.late ? t('cell.lateSuffix') : ''}`;
                    return (
                      <td key={c.key}>
                        <button
                          type="button"
                          className={styles.cellButton}
                          aria-label={t('override.open', { name: r.name, item: c.title })}
                          onClick={() =>
                            setTarget({
                              userId: r.userId,
                              name: r.name,
                              itemKey: c.key,
                              itemTitle: c.title,
                              max: c.max,
                              unit: c.kind === 'test' ? '%' : 'points',
                              value: cell.value,
                              overridden: cell.overridden,
                              assignmentLink:
                                c.kind === 'assignment'
                                  ? `/courses/${courseId}/manage?tab=assignments`
                                  : undefined,
                            })
                          }
                        >
                          <span className={`${styles.cell} ${styles[cell.state]}`} title={label}>
                            {cellText(c, cell, cellWord, comma)}
                            {cell.late && cell.state !== 'late' && (
                              <span className={styles.lateMark} aria-hidden="true">
                                !
                              </span>
                            )}
                            <span className="sr-only">{label}</span>
                          </span>
                          {cell.overridden && <OverrideIcon mark={cell.overridden} />}
                        </button>
                      </td>
                    );
                  })}
                  <td className={styles.num}>{pct(r.testsAvg)}</td>
                  <td className={styles.num}>{pct(r.assignmentsAvg)}</td>
                  <td className={styles.final}>
                    <button
                      type="button"
                      className={styles.cellButton}
                      aria-label={t('override.open', { name: r.name, item: t('override.final') })}
                      onClick={() =>
                        setTarget({
                          userId: r.userId,
                          name: r.name,
                          itemKey: 'final',
                          itemTitle: t('override.final'),
                          max: 100,
                          unit: '%',
                          value: r.final,
                          overridden: r.finalOverridden,
                        })
                      }
                    >
                      <span className={styles.finalValue}>{pct(r.final)}</span>
                      {r.finalOverridden && <OverrideIcon mark={r.finalOverridden} />}
                    </button>
                    {r.final !== null &&
                      (r.passed ? (
                        <Badge tone="success">{t('passed')}</Badge>
                      ) : (
                        <Badge tone="danger">{t('failed')}</Badge>
                      ))}
                  </td>
                  <td className={styles.scaleCell}>
                    {r.scaleGrade ? (
                      <Badge tone={r.scaleGrade.passed ? 'primary' : 'warning'}>
                        {scaleLabel(course.gradingScale, r.scaleGrade.code)}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className={styles.sticky}>
                  {t('average')}
                </th>
                {columns.map((c) => {
                  const s = stats.perColumn[c.key];
                  return (
                    <td key={c.key} className={styles.num}>
                      {s?.avg === null || s?.avg === undefined
                        ? '—'
                        : c.kind === 'test'
                          ? pct(s.avg)
                          : `${s.avg}/${c.max}`}
                      <span className={styles.handedIn}>{t('handedIn', { count: s?.submitted ?? 0 })}</span>
                    </td>
                  );
                })}
                <td className={styles.num} colSpan={2} />
                <td className={styles.final}>{pct(stats.avgFinal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ul className={styles.legend} aria-label={t('legend')}>
        {(['graded', 'submitted', 'returned', 'late', 'missing'] as const).map((s) => (
          <li key={s}>
            <span className={`${styles.swatch} ${styles[s]}`} aria-hidden="true" />
            {t(`state.${s}`)}
          </li>
        ))}
        <li>
          <PencilLine size={12} aria-hidden="true" /> {t('legendOverridden')}
        </li>
      </ul>
      <OverrideDialog courseId={courseId} target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
