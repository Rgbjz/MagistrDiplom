'use client';

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ImagePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CourseLevel } from '../../../lib/types';
import { useFormat, useLabels } from '../../../i18n/format';
import { Badge, CourseCover, Field, Input, Select, Textarea } from '../../ui';
import { CATEGORIES, priceOf, type CourseFormError, type CourseFormState } from './courseForm';
import styles from './CourseFields.module.scss';

type SetForm = Dispatch<SetStateAction<CourseFormState>>;
type Errors = Partial<Record<'title' | 'price', CourseFormError>>;

const LEVELS: CourseLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

export function BasicFields({
  form,
  setForm,
  errors = {},
}: {
  form: CourseFormState;
  setForm: SetForm;
  errors?: Errors;
}) {
  const t = useTranslations('teacher.courseForm');
  const labels = useLabels();
  return (
    <div className={styles.fields}>
      <Field label={t('title')} error={errors.title && t(`validation.${errors.title}`)}>
        <Input
          value={form.title}
          maxLength={120}
          placeholder={t('titlePlaceholder')}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          aria-invalid={!!errors.title}
        />
      </Field>
      <Field
        label={t('description')}
        hint={t('descriptionHint', { count: form.description.length })}
      >
        <Textarea
          rows={5}
          value={form.description}
          placeholder={t('descriptionPlaceholder')}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Field>
      <div className={styles.row}>
        <Field label={t('category')}>
          <Select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">{t('notSelected')}</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(`categories.${c.labelKey}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('level')}>
          <Select
            value={form.level}
            onChange={(e) =>
              setForm((f) => ({ ...f, level: e.target.value as CourseLevel | '' }))
            }
          >
            <option value="">{t('notSelected')}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {labels.level(l)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  );
}

export function CoverPriceFields({
  form,
  setForm,
  errors = {},
  priceLocked = false,
}: {
  form: CourseFormState;
  setForm: SetForm;
  /** Only the course owner may change pricing. */
  priceLocked?: boolean;
  errors?: Errors;
}) {
  const t = useTranslations('teacher.courseForm');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  function pick(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFileError(t('coverWrongType'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError(t('coverTooLarge'));
      return;
    }
    setFileError(null);
    setForm((f) => {
      if (f.image && f.imagePreview) URL.revokeObjectURL(f.imagePreview);
      return { ...f, image: file, imagePreview: URL.createObjectURL(file) };
    });
  }

  return (
    <div className={styles.fields}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t('cover')}</span>
        <div
          className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          {form.imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.imagePreview} alt={t('coverAlt')} className={styles.coverImg} />
          ) : (
            <ImagePlus size={32} aria-hidden="true" />
          )}
          <button
            type="button"
            className={styles.dropBtn}
            onClick={() => inputRef.current?.click()}
          >
            {form.imagePreview ? t('coverReplace') : t('coverUpload')}
          </button>
          <span className={styles.dropHint}>{t('coverHint')}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('coverFile')}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>
        {fileError && (
          <span className={styles.error} role="alert">
            {fileError}
          </span>
        )}
      </div>

      <fieldset className={styles.group} disabled={priceLocked}>
        <legend className={styles.groupLabel}>{t('access')}</legend>
        {priceLocked && <p className={styles.note}>{t('priceOwnerOnly')}</p>}
        <div className={styles.choices}>
          <label className={`${styles.choice} ${!form.paid ? styles.choiceOn : ''}`}>
            <input
              type="radio"
              name="paid"
              checked={!form.paid}
              onChange={() => setForm((f) => ({ ...f, paid: false }))}
            />
            {t('free')}
          </label>
          <label className={`${styles.choice} ${form.paid ? styles.choiceOn : ''}`}>
            <input
              type="radio"
              name="paid"
              checked={form.paid}
              onChange={() => setForm((f) => ({ ...f, paid: true }))}
            />
            {t('paid')}
          </label>
        </div>
      </fieldset>

      {form.paid && (
        <Field label={t('price')} error={errors.price && t(`validation.${errors.price}`)}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            disabled={priceLocked}
            value={form.price}
            placeholder="1500"
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            aria-invalid={!!errors.price}
          />
        </Field>
      )}

      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{t('enrollment')}</legend>
        {form.paid ? (
          <p className={styles.note}>{t('paidEnrollNote')}</p>
        ) : (
          <div className={styles.choices}>
            <label className={`${styles.choice} ${form.autoApprove ? styles.choiceOn : ''}`}>
              <input
                type="radio"
                name="autoApprove"
                checked={form.autoApprove}
                onChange={() => setForm((f) => ({ ...f, autoApprove: true }))}
              />
              {t('autoApprove')}
            </label>
            <label className={`${styles.choice} ${!form.autoApprove ? styles.choiceOn : ''}`}>
              <input
                type="radio"
                name="autoApprove"
                checked={!form.autoApprove}
                onChange={() => setForm((f) => ({ ...f, autoApprove: false }))}
              />
              {t('manualApprove')}
            </label>
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** Live catalog-card preview of the course being edited. */
export function CardPreview({
  form,
  teacherName,
  sectionsCount = 0,
}: {
  form: CourseFormState;
  teacherName: string;
  sectionsCount?: number;
}) {
  const t = useTranslations('teacher.courseForm');
  const f = useFormat();
  const labels = useLabels();
  const categoryLabel = useCategoryLabel();
  const price = priceOf(form);
  const short =
    form.description.length > 120
      ? `${form.description.slice(0, 117).trimEnd()}…`
      : form.description;
  return (
    <div className={styles.preview}>
      <span className={styles.previewLabel}>{t('previewLabel')}</span>
      <article className={styles.card}>
        <CourseCover id={0} imageUrl={form.imagePreview} title={form.title || t('previewTitle')} height={150}>
          <span className={styles.priceTag}>{f.price(price)}</span>
        </CourseCover>
        <div className={styles.cardBody}>
          {form.level && (
            <Badge tone="primary">{t('previewLevel', { level: labels.level(form.level) })}</Badge>
          )}
          <h3 className={styles.cardTitle}>{form.title || t('previewTitle')}</h3>
          <p className={styles.cardText}>{short || t('previewDescription')}</p>
          <span className={styles.cardMeta}>
            {teacherName} · {t('previewSections', { count: sectionsCount })}
            {form.category ? ` · ${categoryLabel(form.category)}` : ''}
          </span>
        </div>
      </article>
    </div>
  );
}

/** Translated label for a stored (Ukrainian) category value; unknown values pass through. */
export function useCategoryLabel() {
  const t = useTranslations('teacher.courseForm');
  return (value: string): string => {
    const known = CATEGORIES.find((c) => c.value === value);
    return known ? t(`categories.${known.labelKey}`) : value;
  };
}
