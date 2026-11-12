'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Library, Plus, Shuffle, Trash2 } from 'lucide-react';
import { questionProblem } from '../../lib/questionProblem';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '../../i18n/format';
import type { QuestionBankCategory, ShowAnswersMode, TestFull } from '../../lib/types';
import { Button, ConfirmDialog, Field, Input, Modal, Select, Skeleton, useToast } from '../ui';
import { QuestionItem, useTypeLabel } from './QuestionEditor';
import styles from './TestEditor.module.scss';

export function TestEditor({
  testId,
  courseId,
  onDeleted,
}: {
  testId: number;
  courseId: number;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('builder.test');
  const errorText = useApiErrorMessage();
  const onError = (e: unknown) => toast(errorText(e), 'error');
  const invalidateTest = () =>
    queryClient.invalidateQueries({ queryKey: ['test', testId] });
  const invalidateCourse = () =>
    queryClient.invalidateQueries({ queryKey: ['course', courseId] });

  const { data: test } = useQuery<TestFull>({
    queryKey: ['test', testId],
    queryFn: () => clientApi<TestFull>(`/tests/${testId}`),
  });

  const [title, setTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState(10);
  const [passingScore, setPassingScore] = useState(60);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (test) {
      setTitle(test.title);
      setTimeLimit(test.timeLimit);
      setPassingScore(test.passingScore);
    }
  }, [test]);

  const saveMeta = useMutation({
    mutationFn: () =>
      clientApi(`/tests/${testId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          timeLimit: Math.max(1, timeLimit || 1),
          passingScore: Math.min(100, Math.max(0, passingScore || 0)),
        }),
      }),
    onSuccess: () => {
      invalidateTest();
      invalidateCourse();
    },
    onError,
  });

  function saveIfChanged() {
    if (!test) return;
    if (
      title.trim() &&
      (title !== test.title ||
        timeLimit !== test.timeLimit ||
        passingScore !== test.passingScore)
    ) {
      saveMeta.mutate();
    }
  }

  const addQuestion = useMutation({
    mutationFn: () =>
      clientApi(`/tests/${testId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t('newQuestion'), type: 'SINGLE' }),
      }),
    onSuccess: invalidateTest,
    onError,
  });

  const delTest = useMutation({
    mutationFn: () => clientApi(`/tests/${testId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmDelete(false);
      toast(t('deleted'));
      invalidateCourse();
      onDeleted();
    },
    onError,
  });

  if (!test) {
    return (
      <div className={styles.editor}>
        <Skeleton height={80} />
        <Skeleton height={200} />
      </div>
    );
  }

  const incomplete = test.questions.filter((q) => questionProblem(q)).length;

  return (
    <section className={styles.editor} aria-label={t('aria')}>
      <div className={styles.headRow}>
        <span className={styles.kicker}>{t('kicker')}</span>
        {saveMeta.isPending && <span className={styles.status}>{t('saving')}</span>}
        {incomplete > 0 && (
          <span className={styles.problemBadge}>
            <AlertTriangle size={14} aria-hidden="true" />
            {t('incompleteBadge', { count: incomplete })}
          </span>
        )}
      </div>
      <div className={styles.meta}>
        <Field label={t('title')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveIfChanged} />
        </Field>
        <Field label={t('timeLimit')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={timeLimit}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
            onBlur={saveIfChanged}
          />
        </Field>
        <Field label={t('passingScore')}>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(Number(e.target.value))}
            onBlur={saveIfChanged}
          />
        </Field>
      </div>

      <TestSettings test={test} onSaved={invalidateTest} onError={onError} />

      {test.questions.length === 0 && test.randomRules.length === 0 && (
        <p className={styles.emptyNote}>{t('noQuestions')}</p>
      )}

      <ol className={styles.questions}>
        {test.questions.map((q, i) => (
          <QuestionItem key={q.id} index={i + 1} question={q} onChanged={invalidateTest} onError={onError} />
        ))}
      </ol>

      <button
        type="button"
        className={styles.addQuestion}
        disabled={addQuestion.isPending}
        onClick={() => addQuestion.mutate()}
      >
        <Plus size={18} aria-hidden="true" />
        {t('addQuestion')}
      </button>

      <BankLinks test={test} courseId={courseId} onChanged={invalidateTest} onError={onError} />

      <div className={styles.danger}>
        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} aria-hidden="true" />
          {t('delete')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t('confirmTitle')}
        description={t('confirmText', { title: test.title })}
        confirmLabel={t('confirmDelete')}
        danger
        loading={delTest.isPending}
        onConfirm={() => delTest.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}

const SHOW_MODES: ShowAnswersMode[] = ['AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_CLOSE', 'NEVER'];

/** Shuffling, attempt limit, subset size and when students see the key. */
function TestSettings({
  test,
  onSaved,
  onError,
}: {
  test: TestFull;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const t = useTranslations('builder.test');
  const [maxAttempts, setMaxAttempts] = useState(test.maxAttempts ? String(test.maxAttempts) : '');
  const [perAttempt, setPerAttempt] = useState(
    test.questionsPerAttempt ? String(test.questionsPerAttempt) : '',
  );
  useEffect(() => {
    setMaxAttempts(test.maxAttempts ? String(test.maxAttempts) : '');
    setPerAttempt(test.questionsPerAttempt ? String(test.questionsPerAttempt) : '');
  }, [test.maxAttempts, test.questionsPerAttempt]);

  const save = useMutation({
    mutationFn: (data: Partial<TestFull>) =>
      clientApi(`/tests/${test.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: onSaved,
    onError,
  });
  const positive = (v: string) => {
    const n = Math.round(Number(v));
    return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <fieldset className={styles.settings}>
      <legend className={styles.subLabel}>{t('settings')}</legend>
      <div className={styles.meta}>
        <Field label={t('maxAttempts')} hint={t('maxAttemptsHint')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(e.target.value)}
            onBlur={() => {
              const n = positive(maxAttempts);
              if (n !== test.maxAttempts) save.mutate({ maxAttempts: n });
            }}
          />
        </Field>
        <Field label={t('questionsPerAttempt')} hint={t('questionsPerAttemptHint')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={perAttempt}
            onChange={(e) => setPerAttempt(e.target.value)}
            onBlur={() => {
              const n = positive(perAttempt);
              if (n !== test.questionsPerAttempt) save.mutate({ questionsPerAttempt: n });
            }}
          />
        </Field>
        <Field label={t('showAnswers')}>
          <Select
            value={test.showCorrectAnswers}
            onChange={(e) => save.mutate({ showCorrectAnswers: e.target.value as ShowAnswersMode })}
          >
            {SHOW_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`showMode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className={styles.inline}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={test.shuffleQuestions}
            onChange={(e) => save.mutate({ shuffleQuestions: e.target.checked })}
          />
          {t('shuffleQuestions')}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={test.shuffleAnswers}
            onChange={(e) => save.mutate({ shuffleAnswers: e.target.checked })}
          />
          {t('shuffleAnswers')}
        </label>
      </div>
      <p className={styles.hint}>{t('questionCount', { count: test.questionCount })}</p>
    </fieldset>
  );
}

/** «Add from bank» (fixed copies) and «N random from a category» rules. */
function BankLinks({
  test,
  courseId,
  onChanged,
  onError,
}: {
  test: TestFull;
  courseId: number;
  onChanged: () => void;
  onError: (e: unknown) => void;
}) {
  const t = useTranslations('builder.test');
  const toast = useToast();
  const typeLabel = useTypeLabel();
  const [pickOpen, setPickOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [rules, setRules] = useState(test.randomRules.map((r) => ({ categoryId: r.categoryId, count: r.count })));
  useEffect(() => {
    setRules(test.randomRules.map((r) => ({ categoryId: r.categoryId, count: r.count })));
  }, [test.randomRules]);

  const { data: bank } = useQuery<QuestionBankCategory[]>({
    queryKey: ['questionBank', courseId],
    queryFn: () => clientApi<QuestionBankCategory[]>(`/courses/${courseId}/question-bank`),
  });

  const copy = useMutation({
    mutationFn: () =>
      clientApi<{ copied: number }>(`/tests/${test.id}/copy-from-bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds: picked }),
      }),
    onSuccess: (r) => {
      toast(t('copied', { count: r.copied }));
      setPickOpen(false);
      setPicked([]);
      onChanged();
    },
    onError,
  });
  const saveRules = useMutation({
    mutationFn: (next: { categoryId: number; count: number }[]) =>
      clientApi(`/tests/${test.id}/random-rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: next }),
      }),
    onSuccess: onChanged,
    onError,
  });

  const categories = bank ?? [];
  const unused = categories.filter((c) => !rules.some((r) => r.categoryId === c.id));

  return (
    <fieldset className={styles.settings}>
      <legend className={styles.subLabel}>{t('bankTitle')}</legend>
      {categories.length === 0 ? (
        <p className={styles.hint}>{t('bankEmpty')}</p>
      ) : (
        <>
          <div>
            <Button variant="outline" size="sm" onClick={() => setPickOpen(true)}>
              <Library size={16} aria-hidden="true" />
              {t('addFromBank')}
            </Button>
          </div>
          <span className={styles.subLabel}>{t('randomTitle')}</span>
          <p className={styles.hint}>{t('randomHint')}</p>
          {rules.map((r, i) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            const available = cat?.questions.length ?? 0;
            return (
              <div key={r.categoryId} className={styles.pairRow}>
                <Shuffle size={16} aria-hidden="true" />
                <span className={styles.ruleName}>{cat?.name ?? '—'}</span>
                <label className={styles.inline}>
                  <span className="sr-only">{t('randomCount', { category: cat?.name ?? '' })}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    className={styles.narrow}
                    value={r.count}
                    onChange={(e) =>
                      setRules(rules.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x)))
                    }
                    onBlur={() => saveRules.mutate(rules.filter((x) => x.count > 0))}
                  />
                  <span className={styles.hint}>{t('randomOf', { count: available })}</span>
                </label>
                {r.count > available && <span className={styles.warn}>{t('randomTooMany')}</span>}
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('randomDelete', { category: cat?.name ?? '' })}
                  onClick={() => saveRules.mutate(rules.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          {unused.length > 0 && (
            <label className={styles.inline}>
              <span className="sr-only">{t('randomAdd')}</span>
              <Select
                value=""
                aria-label={t('randomAdd')}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) saveRules.mutate([...rules, { categoryId: id, count: 1 }]);
                }}
              >
                <option value="">{t('randomAdd')}</option>
                {unused.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.questions.length})
                  </option>
                ))}
              </Select>
            </label>
          )}
        </>
      )}

      <Modal
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title={t('addFromBank')}
        footer={
          <>
            <Button variant="outline" onClick={() => setPickOpen(false)}>
              {t('cancel')}
            </Button>
            <Button disabled={picked.length === 0} loading={copy.isPending} onClick={() => copy.mutate()}>
              {t('copySelected', { count: picked.length })}
            </Button>
          </>
        }
      >
        <div className={styles.pickList}>
          {categories.map((c) => (
            <fieldset key={c.id} className={styles.answers}>
              <legend className={styles.subLabel}>{c.name}</legend>
              {c.questions.length === 0 && <p className={styles.hint}>{t('categoryEmpty')}</p>}
              {c.questions.map((q) => (
                <label key={q.id} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={picked.includes(q.id)}
                    onChange={(e) =>
                      setPicked(e.target.checked ? [...picked, q.id] : picked.filter((x) => x !== q.id))
                    }
                  />
                  <span>
                    {q.text} <span className={styles.hint}>· {typeLabel(q.type)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </Modal>
    </fieldset>
  );
}
