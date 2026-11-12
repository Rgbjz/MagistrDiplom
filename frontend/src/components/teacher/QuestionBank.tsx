'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FolderPlus, Library, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { downloadFile } from '../../lib/api/download';
import { useApiErrorMessage } from '../../i18n/format';
import type { GiftImportResult, QuestionBankCategory, QuestionType } from '../../lib/types';
import { Button, ConfirmDialog, EmptyState, Field, Input, Select, Skeleton, useToast } from '../ui';
import { QUESTION_TYPES, QuestionItem, useTypeLabel } from './QuestionEditor';
import styles from './TestEditor.module.scss';

const json = (data: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

/** Course question bank: categories, their questions, GIFT import/export. */
export function QuestionBank({ courseId }: { courseId: number }) {
  const t = useTranslations('builder.bank');
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorText = useApiErrorMessage();
  const onError = (e: unknown) => toast(errorText(e), 'error');
  const typeLabel = useTypeLabel();
  const [newName, setNewName] = useState('');
  const [filter, setFilter] = useState<QuestionType | ''>('');

  const key = ['questionBank', courseId];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const { data: bank, isLoading } = useQuery<QuestionBankCategory[]>({
    queryKey: key,
    queryFn: () => clientApi<QuestionBankCategory[]>(`/courses/${courseId}/question-bank`),
  });

  const create = useMutation({
    mutationFn: (name: string) =>
      clientApi(`/courses/${courseId}/question-bank/categories`, { method: 'POST', ...json({ name }) }),
    onSuccess: () => {
      setNewName('');
      invalidate();
    },
    onError,
  });

  const exportAll = useMutation({
    mutationFn: () => downloadFile(`/courses/${courseId}/question-bank/export`, 'question-bank.gift'),
    onSuccess: (name) => toast(t('exported', { name })),
    onError,
  });

  if (isLoading || !bank) return <Skeleton height={240} radius="var(--radius-lg)" />;

  return (
    <section className={styles.editor} aria-label={t('aria')}>
      <div className={styles.headRow}>
        <span className={styles.kicker}>{t('kicker')}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={bank.length === 0}
          loading={exportAll.isPending}
          onClick={() => exportAll.mutate()}
        >
          <Download size={16} aria-hidden="true" />
          {t('exportAll')}
        </Button>
      </div>
      <p className={styles.hint}>{t('intro')}</p>

      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) create.mutate(newName.trim());
        }}
      >
        <Input
          aria-label={t('newCategory')}
          placeholder={t('newCategory')}
          value={newName}
          maxLength={120}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!newName.trim()} loading={create.isPending}>
          <FolderPlus size={16} aria-hidden="true" />
          {t('addCategory')}
        </Button>
      </form>

      <GiftImport courseId={courseId} categories={bank} onImported={invalidate} />

      {bank.length > 0 && (
        <Field label={t('filter')}>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as QuestionType | '')}>
            <option value="">{t('filterAll')}</option>
            {QUESTION_TYPES.map((x) => (
              <option key={x} value={x}>
                {typeLabel(x)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {bank.length === 0 ? (
        <EmptyState icon={<Library size={36} aria-hidden="true" />} title={t('empty')}>
          <p className={styles.hint}>{t('emptyHint')}</p>
        </EmptyState>
      ) : (
        bank.map((c) => (
          <CategoryCard
            key={c.id}
            courseId={courseId}
            category={c}
            filter={filter}
            onChanged={invalidate}
            onError={onError}
          />
        ))
      )}
    </section>
  );
}

function CategoryCard({
  courseId,
  category,
  filter,
  onChanged,
  onError,
}: {
  courseId: number;
  category: QuestionBankCategory;
  filter: QuestionType | '';
  onChanged: () => void;
  onError: (e: unknown) => void;
}) {
  const t = useTranslations('builder.bank');
  const toast = useToast();
  const [name, setName] = useState(category.name);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setName(category.name), [category.name]);

  const rename = useMutation({
    mutationFn: () =>
      clientApi(`/question-bank/categories/${category.id}`, { method: 'PATCH', ...json({ name }) }),
    onSuccess: onChanged,
    onError,
  });
  const remove = useMutation({
    mutationFn: () => clientApi(`/question-bank/categories/${category.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirm(false);
      toast(t('categoryDeleted'));
      onChanged();
    },
    onError,
  });
  const addQuestion = useMutation({
    mutationFn: () =>
      clientApi(`/question-bank/categories/${category.id}/questions`, {
        method: 'POST',
        ...json({ text: t('newQuestion'), type: filter || 'SINGLE' }),
      }),
    onSuccess: onChanged,
    onError,
  });
  const exportOne = useMutation({
    mutationFn: () =>
      downloadFile(
        `/courses/${courseId}/question-bank/export?categoryId=${category.id}`,
        'question-bank.gift',
      ),
    onError,
  });

  const shown = category.questions.filter((q) => !filter || q.type === filter);
  return (
    <section className={styles.settings} aria-label={t('categoryAria', { name: category.name })}>
      <div className={styles.pairRow}>
        <Input
          aria-label={t('categoryName')}
          className={styles.qText}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== category.name) rename.mutate();
          }}
        />
        <span className={styles.hint}>{t('count', { count: category.questions.length })}</span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('exportCategory', { name: category.name })}
          onClick={() => exportOne.mutate()}
        >
          <Download size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('deleteCategory', { name: category.name })}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      {shown.length > 0 && (
        <ol className={styles.questions}>
          {shown.map((q, i) => (
            <QuestionItem key={q.id} index={i + 1} question={q} onChanged={onChanged} onError={onError} />
          ))}
        </ol>
      )}
      <button
        type="button"
        className={styles.addAnswer}
        disabled={addQuestion.isPending}
        onClick={() => addQuestion.mutate()}
      >
        <Plus size={16} aria-hidden="true" />
        {t('addQuestion')}
      </button>
      <ConfirmDialog
        open={confirm}
        title={t('deleteTitle')}
        description={t('deleteText', { name: category.name, count: category.questions.length })}
        confirmLabel={t('deleteConfirm')}
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </section>
  );
}

function GiftImport({
  courseId,
  categories,
  onImported,
}: {
  courseId: number;
  categories: QuestionBankCategory[];
  onImported: () => void;
}) {
  const t = useTranslations('builder.bank');
  const toast = useToast();
  const errorText = useApiErrorMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<GiftImportResult | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 500_000) throw new Error(t('tooLarge'));
      const text = await file.text();
      return clientApi<GiftImportResult>(`/courses/${courseId}/question-bank/import`, {
        method: 'POST',
        ...json({ text, ...(target ? { categoryId: Number(target) } : {}) }),
      });
    },
    onSuccess: (r) => {
      setResult(r);
      toast(t('imported', { count: r.imported }));
      onImported();
    },
    onError: (e) => toast(e instanceof Error && e.message === t('tooLarge') ? e.message : errorText(e), 'error'),
  });

  return (
    <div className={styles.settings}>
      <span className={styles.subLabel}>{t('importTitle')}</span>
      <p className={styles.hint}>{t('importHint')}</p>
      <div className={styles.inline}>
        <Select aria-label={t('importTarget')} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{t('importByCategory')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <input
          ref={fileRef}
          type="file"
          accept=".gift,.txt,text/plain"
          className="sr-only"
          aria-label={t('importFile')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
        <Button variant="outline" size="sm" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
          <Upload size={16} aria-hidden="true" />
          {t('importButton')}
        </Button>
      </div>
      {result && (
        <div role="status" className={styles.hint}>
          <p>{t('importResult', { imported: result.imported, skipped: result.skipped.length })}</p>
          {result.skipped.length > 0 && (
            <ul>
              {result.skipped.slice(0, 20).map((s) => (
                <li key={s.line}>
                  {t('skippedLine', { line: s.line, reason: s.reason })}: <code>{s.text}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
