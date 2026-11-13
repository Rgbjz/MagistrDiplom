'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { questionProblem } from '../../lib/questionProblem';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import type { Answer, Question, QuestionConfig, QuestionType } from '../../lib/types';
import { Input, Select, Textarea } from '../ui';
import styles from './TestEditor.module.scss';

export const QUESTION_TYPES: QuestionType[] = [
  'SINGLE',
  'MULTIPLE',
  'TRUE_FALSE',
  'SHORT_TEXT',
  'NUMERIC',
  'MATCHING',
  'ORDERING',
  'ESSAY',
];

const json = (data: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

type QuestionPatch = Partial<{
  text: string;
  type: QuestionType;
  points: number;
  partialCredit: boolean;
  config: QuestionConfig;
}>;

/** Type label for pickers; SINGLE/MULTIPLE keep their original short labels. */
export function useTypeLabel() {
  const t = useTranslations('builder.test');
  return (type: QuestionType) =>
    type === 'SINGLE' ? t('single') : type === 'MULTIPLE' ? t('multiple') : t(`types.${type}`);
}

/** One editable question card — used by the test editor and the question bank. */
export function QuestionItem({
  index,
  question,
  onChanged,
  onError,
}: {
  index: number;
  question: Question;
  onChanged: () => void;
  onError: (e: unknown) => void;
}) {
  const t = useTranslations('builder.test');
  const typeLabel = useTypeLabel();
  const [text, setText] = useState(question.text);
  const [type, setType] = useState<QuestionType>(question.type);
  const [points, setPoints] = useState(question.points);

  useEffect(() => {
    setText(question.text);
    setType(question.type);
    setPoints(question.points);
  }, [question.id, question.text, question.type, question.points]);

  // Saves of one question run one after another: two quick blurs (e.g. a
  // matching pair's left then right field) must not reach the server out of
  // order, or the older config overwrites the newer one.
  const patchQuestion = useMutation({
    scope: { id: `question-${question.id}` },
    mutationFn: (data: QuestionPatch) =>
      clientApi(`/tests/questions/${question.id}`, { method: 'PATCH', ...json(data) }),
    onSuccess: onChanged,
    onError,
  });
  const delQuestion = useMutation({
    mutationFn: () => clientApi(`/tests/questions/${question.id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
    onError,
  });
  const addAnswer = useMutation({
    mutationFn: () =>
      clientApi(`/tests/questions/${question.id}/answers`, {
        method: 'POST',
        ...json({ text: t('newAnswer') }),
      }),
    onSuccess: onChanged,
    onError,
  });
  const patchAnswer = useMutation({
    scope: { id: `question-${question.id}-answers` },
    mutationFn: ({ id, data }: { id: number; data: Partial<{ text: string; isCorrect: boolean }> }) =>
      clientApi(`/tests/answers/${id}`, { method: 'PATCH', ...json(data) }),
    onSuccess: onChanged,
    onError,
  });
  const delAnswer = useMutation({
    mutationFn: (id: number) => clientApi(`/tests/answers/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
    onError,
  });

  function changeType(newType: QuestionType) {
    if (newType === type) return;
    setType(newType);
    patchQuestion.mutate({ type: newType });
    // Normalize to a single correct answer when switching to SINGLE.
    if (newType === 'SINGLE') {
      const firstCorrect = question.answers.find((a) => a.isCorrect) ?? question.answers[0];
      question.answers.forEach((a) => {
        const shouldBe = a.id === firstCorrect?.id;
        if (a.isCorrect !== shouldBe) {
          patchAnswer.mutate({ id: a.id, data: { isCorrect: shouldBe } });
        }
      });
    }
  }

  function toggleCorrect(answer: Answer) {
    if (type === 'SINGLE') {
      question.answers.forEach((a) => {
        const shouldBe = a.id === answer.id;
        if (a.isCorrect !== shouldBe) {
          patchAnswer.mutate({ id: a.id, data: { isCorrect: shouldBe } });
        }
      });
    } else {
      patchAnswer.mutate({ id: answer.id, data: { isCorrect: !answer.isCorrect } });
    }
  }

  const isChoice = type === 'SINGLE' || type === 'MULTIPLE';
  const groupName = `q-${question.id}`;
  const problem = questionProblem({ ...question, text });
  const problemId = `q-${question.id}-problem`;
  return (
    <li
      className={`${styles.questionCard} ${problem ? styles.questionCardInvalid : ''}`}
      aria-describedby={problem ? problemId : undefined}
    >
      <div className={styles.questionTop}>
        <span className={styles.qNum} aria-hidden="true">
          {index}
        </span>
        <Input
          className={styles.qText}
          aria-label={t('questionText', { index })}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text.trim() && text !== question.text) patchQuestion.mutate({ text });
          }}
        />
        <label className={styles.typeLabel}>
          <span className="sr-only">{t('questionType', { index })}</span>
          <Select value={type} onChange={(e) => changeType(e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((x) => (
              <option key={x} value={x}>
                {typeLabel(x)}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.pointsLabel}>
          <span className="sr-only">{t('pointsLabel', { index })}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            onBlur={() => {
              const p = Math.min(100, Math.max(1, Math.round(points || 1)));
              setPoints(p);
              if (p !== question.points) patchQuestion.mutate({ points: p });
            }}
          />
          <span className={styles.pointsUnit} aria-hidden="true">
            {t('pointsUnit')}
          </span>
        </label>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('deleteQuestion', { index })}
          onClick={() => delQuestion.mutate()}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      {(type === 'MULTIPLE' || type === 'ORDERING') && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={question.partialCredit}
            onChange={(e) => patchQuestion.mutate({ partialCredit: e.target.checked })}
          />
          {type === 'MULTIPLE' ? t('partialMultiple') : t('partialOrdering')}
        </label>
      )}

      {isChoice ? (
        <fieldset className={styles.answers}>
          <legend className="sr-only">{t('answersLegend', { index })}</legend>
          {question.answers.map((a, ai) => (
            <AnswerRow
              key={a.id}
              answer={a}
              index={ai + 1}
              type={type}
              groupName={groupName}
              onToggle={() => toggleCorrect(a)}
              onText={(newText) => {
                if (newText.trim() && newText !== a.text)
                  patchAnswer.mutate({ id: a.id, data: { text: newText } });
              }}
              onDelete={() => delAnswer.mutate(a.id)}
            />
          ))}
          <button type="button" className={styles.addAnswer} onClick={() => addAnswer.mutate()}>
            <Plus size={16} aria-hidden="true" />
            {t('addAnswer')}
          </button>
        </fieldset>
      ) : (
        // Remount on type change: the server resets the config to the new type's default.
        <ConfigEditor
          key={`${question.id}-${question.type}`}
          type={question.type}
          index={index}
          config={question.config ?? {}}
          onSave={(config) => patchQuestion.mutate({ config })}
        />
      )}
      {problem && (
        <p id={problemId} className={styles.problem}>
          <AlertTriangle size={16} aria-hidden="true" />
          {t(`problems.${problem}`)} {t('problemHidden')}
        </p>
      )}
    </li>
  );
}

function ConfigEditor({
  type,
  index,
  config,
  onSave,
}: {
  type: QuestionType;
  index: number;
  config: QuestionConfig;
  onSave: (c: QuestionConfig) => void;
}) {
  const t = useTranslations('builder.test');
  const [c, setC] = useState<QuestionConfig>(config);
  const [draft, setDraft] = useState('');
  const save = (next: QuestionConfig) => {
    setC(next);
    onSave(next);
  };

  switch (type) {
    case 'TRUE_FALSE':
      return (
        <fieldset className={styles.answers}>
          <legend className={styles.subLabel}>{t('tfLegend', { index })}</legend>
          <div className={styles.inline}>
            {[true, false].map((v) => (
              <label key={String(v)} className={`${styles.answer} ${c.correct === v ? styles.correct : ''}`}>
                <input
                  type="radio"
                  name={`tf-${index}`}
                  className={styles.mark}
                  checked={c.correct === v}
                  onChange={() => save({ correct: v })}
                />
                {v ? t('tfTrue') : t('tfFalse')}
              </label>
            ))}
          </div>
        </fieldset>
      );

    case 'SHORT_TEXT': {
      const accepted = c.accepted ?? [];
      const add = () => {
        const v = draft.trim();
        setDraft('');
        if (v && !accepted.includes(v)) save({ ...c, accepted: [...accepted, v] });
      };
      return (
        <div className={styles.answers}>
          <span className={styles.subLabel}>{t('acceptedLegend')}</span>
          {accepted.length === 0 && <p className={styles.warn}>{t('acceptedEmpty')}</p>}
          <ul className={styles.chips}>
            {accepted.map((a) => (
              <li key={a} className={styles.chip}>
                {a}
                <button
                  type="button"
                  aria-label={t('acceptedRemove', { answer: a })}
                  onClick={() => save({ ...c, accepted: accepted.filter((x) => x !== a) })}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.inline}>
            <Input
              aria-label={t('acceptedNew', { index })}
              value={draft}
              placeholder={t('acceptedPlaceholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button type="button" className={styles.addAnswer} onClick={add}>
              <Plus size={16} aria-hidden="true" />
              {t('acceptedAdd')}
            </button>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={!!c.caseSensitive}
              onChange={(e) => save({ ...c, caseSensitive: e.target.checked })}
            />
            {t('caseSensitive')}
          </label>
        </div>
      );
    }

    case 'NUMERIC':
      return (
        <div className={`${styles.answers} ${styles.inline}`}>
          <NumberField
            label={t('numericValue', { index })}
            value={c.value ?? 0}
            onSave={(value) => save({ ...c, value })}
          />
          <span aria-hidden="true">±</span>
          <NumberField
            label={t('numericTolerance', { index })}
            value={c.tolerance ?? 0}
            onSave={(tolerance) => save({ ...c, tolerance: Math.abs(tolerance) })}
          />
        </div>
      );

    case 'MATCHING': {
      const pairs = c.pairs ?? [];
      const set = (i: number, side: 'left' | 'right', v: string) =>
        setC({ ...c, pairs: pairs.map((p, j) => (j === i ? { ...p, [side]: v } : p)) });
      return (
        <fieldset className={styles.answers}>
          <legend className={styles.subLabel}>{t('pairsLegend')}</legend>
          {pairs.filter((p) => p.left && p.right).length < 2 && <p className={styles.warn}>{t('pairsMin')}</p>}
          {pairs.map((p, i) => (
            <div key={i} className={styles.pairRow}>
              <Input
                aria-label={t('pairLeft', { n: i + 1 })}
                value={p.left}
                onChange={(e) => set(i, 'left', e.target.value)}
                onBlur={() => onSave(c)}
              />
              <span aria-hidden="true">→</span>
              <Input
                aria-label={t('pairRight', { n: i + 1 })}
                value={p.right}
                onChange={(e) => set(i, 'right', e.target.value)}
                onBlur={() => onSave(c)}
              />
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={t('pairDelete', { n: i + 1 })}
                onClick={() => save({ ...c, pairs: pairs.filter((_, j) => j !== i) })}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {pairs.length < 20 && (
            <button
              type="button"
              className={styles.addAnswer}
              onClick={() => setC({ ...c, pairs: [...pairs, { left: '', right: '' }] })}
            >
              <Plus size={16} aria-hidden="true" />
              {t('pairAdd')}
            </button>
          )}
        </fieldset>
      );
    }

    case 'ORDERING': {
      const items = c.items ?? [];
      const move = (from: number, to: number) => {
        const next = [...items];
        const [x] = next.splice(from, 1);
        next.splice(to, 0, x);
        save({ ...c, items: next });
      };
      return (
        <fieldset className={styles.answers}>
          <legend className={styles.subLabel}>{t('itemsLegend')}</legend>
          {items.filter(Boolean).length < 2 && <p className={styles.warn}>{t('itemsMin')}</p>}
          {items.map((it, i) => (
            <div key={i} className={styles.pairRow}>
              <span className={styles.qNum} aria-hidden="true">
                {i + 1}
              </span>
              <Input
                aria-label={t('itemText', { n: i + 1 })}
                value={it}
                onChange={(e) => setC({ ...c, items: items.map((x, j) => (j === i ? e.target.value : x)) })}
                onBlur={() => onSave(c)}
              />
              <button
                type="button"
                className={styles.iconBtn}
                disabled={i === 0}
                aria-label={t('itemUp', { n: i + 1 })}
                onClick={() => move(i, i - 1)}
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                disabled={i === items.length - 1}
                aria-label={t('itemDown', { n: i + 1 })}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={t('itemDelete', { n: i + 1 })}
                onClick={() => save({ ...c, items: items.filter((_, j) => j !== i) })}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {items.length < 20 && (
            <button
              type="button"
              className={styles.addAnswer}
              onClick={() => setC({ ...c, items: [...items, ''] })}
            >
              <Plus size={16} aria-hidden="true" />
              {t('itemAdd')}
            </button>
          )}
        </fieldset>
      );
    }

    case 'ESSAY':
      return (
        <div className={styles.answers}>
          <p className={styles.hint}>{t('essayHint')}</p>
          <label className={styles.subLabel}>
            {t('maxWords')}
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              className={styles.narrow}
              value={c.maxWords ?? ''}
              placeholder={t('maxWordsNone')}
              onChange={(e) => setC({ ...c, maxWords: e.target.value ? Number(e.target.value) : null })}
              onBlur={() => onSave(c)}
            />
          </label>
          <label className={styles.subLabel}>
            {t('rubric')}
            <Textarea
              rows={3}
              maxLength={2000}
              value={c.rubric ?? ''}
              onChange={(e) => setC({ ...c, rubric: e.target.value })}
              onBlur={() => onSave(c)}
            />
          </label>
        </div>
      );

    default:
      return null;
  }
}

function NumberField({ label, value, onSave }: { label: string; value: number; onSave: (n: number) => void }) {
  const [raw, setRaw] = useState(String(value));
  const n = Number(raw.trim().replace(',', '.'));
  const valid = raw.trim() !== '' && Number.isFinite(n);
  return (
    <label className={styles.subLabel}>
      {label}
      <Input
        inputMode="decimal"
        className={styles.narrow}
        value={raw}
        aria-invalid={!valid}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          if (valid && n !== value) onSave(n);
        }}
      />
    </label>
  );
}

function AnswerRow({
  answer,
  index,
  type,
  groupName,
  onToggle,
  onText,
  onDelete,
}: {
  answer: Answer;
  index: number;
  type: QuestionType;
  groupName: string;
  onToggle: () => void;
  onText: (text: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('builder.test');
  const [text, setText] = useState(answer.text);
  useEffect(() => {
    setText(answer.text);
  }, [answer.id, answer.text]);

  return (
    <div className={`${styles.answer} ${answer.isCorrect ? styles.correct : ''}`}>
      <input
        type={type === 'SINGLE' ? 'radio' : 'checkbox'}
        name={groupName}
        className={styles.mark}
        checked={answer.isCorrect}
        onChange={onToggle}
        aria-label={t('answerCorrect', { index })}
      />
      <input
        className={styles.answerText}
        aria-label={t('answerText', { index })}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onText(text)}
      />
      {answer.isCorrect && <span className={styles.correctTag}>{t('correctTag')}</span>}
      <button
        type="button"
        className={styles.iconBtn}
        aria-label={t('deleteAnswer', { index })}
        onClick={onDelete}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
