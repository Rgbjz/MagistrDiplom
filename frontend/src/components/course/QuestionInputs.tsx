'use client';

import { useId, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { QuestionResponse, SessionQuestion } from '../../lib/types';
import { Input, Select, Textarea } from '../ui';
import styles from './TestRunner.module.scss';

/**
 * What the runner keeps per question while the student works:
 * choice → answer ids, TRUE_FALSE → boolean, SHORT_TEXT/NUMERIC/ESSAY → text,
 * MATCHING → {leftId: rightId}, ORDERING → item ids in the chosen order.
 */
export type Draft = number[] | boolean | string | Record<number, number>;

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function isAnswered(q: SessionQuestion, d: Draft | undefined): boolean {
  if (d === undefined) return false;
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE':
      return (d as number[]).length > 0;
    case 'TRUE_FALSE':
      return typeof d === 'boolean';
    case 'SHORT_TEXT':
    case 'NUMERIC':
    case 'ESSAY':
      return String(d).trim() !== '';
    case 'MATCHING':
      return Object.keys(d as Record<number, number>).length === (q.left?.length ?? 0);
    case 'ORDERING':
      return true;
    default:
      return false;
  }
}

/** Draft → the payload the API expects; null when there is nothing to send. */
export function toResponse(q: SessionQuestion, d: Draft | undefined): QuestionResponse | null {
  if (d === undefined) return null;
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE':
      return (d as number[]).length ? { answerIds: d as number[] } : null;
    case 'TRUE_FALSE':
      return typeof d === 'boolean' ? { value: d } : null;
    case 'SHORT_TEXT':
    case 'ESSAY':
      return String(d).trim() ? { text: String(d) } : null;
    case 'NUMERIC': {
      const n = Number(String(d).trim().replace(',', '.'));
      return String(d).trim() && Number.isFinite(n) ? { value: n } : null;
    }
    case 'MATCHING':
      return Object.keys(d as object).length ? { pairs: d as Record<number, number> } : null;
    case 'ORDERING':
      return { order: d as number[] };
    default:
      return null;
  }
}

/** Inputs for every non-choice question type (choice options live in TestRunner). */
export function QuestionInput({
  q,
  draft,
  onChange,
}: {
  q: SessionQuestion;
  draft: Draft | undefined;
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('test.runner');
  const id = useId();
  const [announce, setAnnounce] = useState('');

  switch (q.type) {
    case 'TRUE_FALSE':
      return (
        <fieldset className={styles.options}>
          <legend className="sr-only">{t('options')}</legend>
          {[true, false].map((v) => {
            const selected = draft === v;
            return (
              <button
                key={String(v)}
                type="button"
                aria-pressed={selected}
                className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                onClick={() => onChange(v)}
              >
                <span className={`${styles.dot} ${selected ? styles.dotOn : ''}`} aria-hidden="true">
                  {selected && <span className={styles.dotInner} />}
                </span>
                <span className={styles.optionText}>{v ? t('true') : t('false')}</span>
              </button>
            );
          })}
        </fieldset>
      );

    case 'SHORT_TEXT':
    case 'NUMERIC':
      return (
        <div className={styles.freeInput}>
          <label htmlFor={id} className={styles.inputLabel}>
            {q.type === 'NUMERIC' ? t('numericLabel') : t('shortLabel')}
          </label>
          <Input
            id={id}
            value={typeof draft === 'string' ? draft : ''}
            inputMode={q.type === 'NUMERIC' ? 'decimal' : undefined}
            autoComplete="off"
            maxLength={500}
            placeholder={q.type === 'NUMERIC' ? t('numericPlaceholder') : t('shortPlaceholder')}
            onChange={(e) => onChange(e.target.value)}
          />
          {q.type === 'NUMERIC' &&
            typeof draft === 'string' &&
            draft.trim() &&
            !Number.isFinite(Number(draft.trim().replace(',', '.'))) && (
              <span className={styles.inputError} role="alert">
                {t('numericInvalid')}
              </span>
            )}
        </div>
      );

    case 'ESSAY': {
      const text = typeof draft === 'string' ? draft : '';
      const words = countWords(text);
      const over = !!q.maxWords && words > q.maxWords;
      return (
        <div className={styles.freeInput}>
          <label htmlFor={id} className={styles.inputLabel}>
            {t('essayLabel')}
          </label>
          <Textarea
            id={id}
            rows={9}
            value={text}
            maxLength={20000}
            aria-describedby={`${id}-count`}
            onChange={(e) => onChange(e.target.value)}
          />
          <span id={`${id}-count`} className={over ? styles.inputError : styles.inputHint} aria-live="polite">
            {q.maxWords ? t('wordsOf', { count: words, max: q.maxWords }) : t('words', { count: words })}
          </span>
          <span className={styles.inputHint}>{t('essayHint')}</span>
        </div>
      );
    }

    case 'MATCHING': {
      const pairs = (draft as Record<number, number> | undefined) ?? {};
      return (
        <fieldset className={styles.matching}>
          <legend className="sr-only">{t('matchingLegend')}</legend>
          {(q.left ?? []).map((l) => (
            <div key={l.id} className={styles.matchRow}>
              <label htmlFor={`${id}-${l.id}`} className={styles.matchLeft}>
                {l.text}
              </label>
              <Select
                id={`${id}-${l.id}`}
                value={pairs[l.id] !== undefined ? String(pairs[l.id]) : ''}
                onChange={(e) => {
                  const next = { ...pairs };
                  if (e.target.value === '') delete next[l.id];
                  else next[l.id] = Number(e.target.value);
                  onChange(next);
                }}
              >
                <option value="">{t('matchingPick')}</option>
                {(q.right ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </fieldset>
      );
    }

    case 'ORDERING': {
      const items = q.items ?? [];
      const order = (draft as number[] | undefined) ?? items.map((i) => i.id);
      const byId = new Map(items.map((i) => [i.id, i.text]));
      const move = (from: number, to: number) => {
        const next = [...order];
        const [x] = next.splice(from, 1);
        next.splice(to, 0, x);
        onChange(next);
        setAnnounce(t('orderingMoved', { item: byId.get(x) ?? '', position: to + 1, total: next.length }));
      };
      return (
        <div>
          <p className={styles.inputHint}>{t('orderingHint')}</p>
          <ol className={styles.ordering} aria-label={t('orderingLegend')}>
            {order.map((itemId, i) => (
              <li key={itemId} className={styles.orderItem}>
                <span className={styles.letter}>{i + 1}</span>
                <span className={styles.optionText}>{byId.get(itemId)}</span>
                <button
                  type="button"
                  className={styles.orderBtn}
                  disabled={i === 0}
                  aria-label={t('moveUp', { item: byId.get(itemId) ?? '' })}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.orderBtn}
                  disabled={i === order.length - 1}
                  aria-label={t('moveDown', { item: byId.get(itemId) ?? '' })}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <span className="sr-only" aria-live="polite">
            {announce}
          </span>
        </div>
      );
    }

    default:
      return null;
  }
}
