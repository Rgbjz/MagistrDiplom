'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '../../i18n/format';
import type { QuestionResponse, SubmitResult, TestStartResponse } from '../../lib/types';
import { Button, ConfirmDialog, useToast } from '../ui';
import { track } from '../../lib/analytics';
import { QuestionInput, isAnswered, toResponse, type Draft } from './QuestionInputs';
import styles from './TestRunner.module.scss';

const LETTERS = 'ABCDEFGHIJ';

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Full-width test session: one question at a time, timer, navigator. */
export function TestRunner({
  session,
  testId,
  testTitle,
  courseId,
  courseTitle,
  passingScore,
  onExit,
}: {
  session: TestStartResponse;
  testId: number;
  testTitle: string;
  courseId: number;
  courseTitle: string;
  passingScore: number;
  onExit: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('test.runner');
  const errorText = useApiErrorMessage();
  const questions = session.questions;
  const [index, setIndex] = useState(0);
  // Ordering questions start from the shown order — leaving it as is is an answer too.
  const [answers, setAnswers] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(
      questions.filter((x) => x.type === 'ORDERING').map((x) => [x.id, (x.items ?? []).map((i) => i.id)]),
    ),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const submittedRef = useRef(false);

  const deadline = useMemo(
    () => new Date(session.startedAt).getTime() + session.timeLimit * 60_000,
    [session.startedAt, session.timeLimit],
  );
  const [left, setLeft] = useState(() => Math.round((deadline - Date.now()) / 1000));

  const submitMutation = useMutation({
    mutationFn: () =>
      clientApi<SubmitResult>(`/tests/${session.testResultId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: Object.fromEntries(
            questions
              .map((x) => [x.id, toResponse(x, answers[x.id])] as const)
              .filter((e): e is readonly [number, QuestionResponse] => e[1] !== null),
          ),
        }),
      }),
    onSuccess: (result) => {
      track('test_complete', {
        test_id: String(testId),
        score: result.score,
        passed: result.passed === true,
      });
      queryClient.invalidateQueries({ queryKey: ['myTestResult', testId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push(`/courses/${courseId}/tests/${testId}/result`);
    },
    onError: (e) => {
      submittedRef.current = false;
      toast(errorText(e, t('submitError')), 'error');
    },
  });

  const submit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setConfirmOpen(false);
    submitMutation.mutate();
  }, [submitMutation]);

  useEffect(() => {
    const timer = setInterval(() => {
      const s = Math.round((deadline - Date.now()) / 1000);
      setLeft(s);
      if (s <= 0) {
        clearInterval(timer);
        submit();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, submit]);

  const q = questions[index];
  const answeredCount = questions.filter((x) => isAnswered(x, answers[x.id])).length;
  const isChoice = q.type === 'SINGLE' || q.type === 'MULTIPLE';
  const unanswered = questions.length - answeredCount;
  const urgent = left <= 60;

  function toggle(answerId: number) {
    setAnswers((prev) => {
      const cur = (prev[q.id] as number[] | undefined) ?? [];
      const next =
        q.type === 'SINGLE'
          ? [answerId]
          : cur.includes(answerId)
            ? cur.filter((x) => x !== answerId)
            : [...cur, answerId];
      return { ...prev, [q.id]: next };
    });
  }

  function finish() {
    if (unanswered > 0) setConfirmOpen(true);
    else submit();
  }

  return (
    <div className={styles.runner}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <button
            type="button"
            className={styles.exit}
            aria-label={t('exit')}
            onClick={() => setExitOpen(true)}
          >
            <X size={22} aria-hidden="true" />
          </button>
          <div className={styles.titleBox}>
            <span className={styles.course}>
              {t('attempt', { course: courseTitle, attempt: session.attempt })}
            </span>
            <span className={styles.title}>{testTitle}</span>
          </div>
          <div
            role="timer"
            aria-label={t('timeLeft', {
              minutes: Math.floor(Math.max(left, 0) / 60),
              seconds: Math.max(left, 0) % 60,
            })}
            className={`${styles.timer} ${urgent ? styles.timerUrgent : ''}`}
          >
            <Clock size={18} aria-hidden="true" />
            {formatClock(left)}
          </div>
          <Button
            variant="outline"
            className={styles.finishDesktop}
            loading={submitMutation.isPending}
            onClick={finish}
          >
            {t('finish')}
          </Button>
        </div>
        <div
          role="progressbar"
          aria-label={t('answers')}
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={questions.length}
          className={styles.track}
        >
          <div
            className={styles.fill}
            style={{ width: `${(answeredCount / Math.max(questions.length, 1)) * 100}%` }}
          />
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.card} aria-label={t('questionOf', { n: index + 1, total: questions.length })}>
          <div className={styles.qHead}>
            <span className={styles.qCount}>
              {t('questionOf', { n: index + 1, total: questions.length })}
            </span>
            <span className={styles.qType}>
              {t(`type.${q.type}`)}
              {q.points !== 1 && ` · ${t('points', { count: q.points })}`}
            </span>
          </div>
          <h2 className={styles.qText}>{q.text}</h2>

          {!isChoice && (
            <QuestionInput
              key={q.id}
              q={q}
              draft={answers[q.id]}
              onChange={(d) => setAnswers((prev) => ({ ...prev, [q.id]: d }))}
            />
          )}
          {isChoice && (
          <fieldset className={styles.options}>
            <legend className="sr-only">{t('options')}</legend>
            {q.answers.map((a, i) => {
              const selected = ((answers[q.id] as number[] | undefined) ?? []).includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={selected}
                  className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                  onClick={() => toggle(a.id)}
                >
                  <span
                    className={`${styles.dot} ${q.type === 'MULTIPLE' ? styles.square : ''} ${selected ? styles.dotOn : ''}`}
                    aria-hidden="true"
                  >
                    {selected && <span className={styles.dotInner} />}
                  </span>
                  <span className={styles.letter}>{LETTERS[i]}</span>
                  <span className={styles.optionText}>{a.text}</span>
                </button>
              );
            })}
          </fieldset>
          )}

          <div className={styles.nav}>
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              aria-label={t('prevQuestion')}
            >
              <ChevronLeft size={18} aria-hidden="true" />
              <span className={styles.navText}>{t('prev')}</span>
            </Button>
            {index < questions.length - 1 ? (
              <Button className={styles.grow} onClick={() => setIndex((i) => i + 1)}>
                {t('next')}
                <ChevronRight size={18} aria-hidden="true" />
              </Button>
            ) : (
              <Button className={styles.grow} loading={submitMutation.isPending} onClick={finish}>
                {t('finish')}
              </Button>
            )}
          </div>
        </section>

        <aside className={styles.side}>
          <nav aria-label={t('navigator')} className={styles.navigator}>
            <span className={styles.sideTitle}>{t('questions')}</span>
            <div className={styles.grid}>
              {questions.map((x, i) => {
                const current = i === index;
                const done = isAnswered(x, answers[x.id]);
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    aria-label={
                      current
                        ? t('questionCurrent', { n: i + 1 })
                        : done
                          ? t('questionAnswered', { n: i + 1 })
                          : t('questionLabel', { n: i + 1 })
                    }
                    className={`${styles.num} ${current ? styles.numCurrent : done ? styles.numDone : ''}`}
                    onClick={() => setIndex(i)}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className={styles.legend}>
              <span><i className={`${styles.swatch} ${styles.numDone}`} />{t('legendAnswered')}</span>
              <span><i className={`${styles.swatch} ${styles.numCurrent}`} />{t('legendCurrent')}</span>
              <span><i className={styles.swatch} />{t('legendEmpty')}</span>
            </div>
          </nav>
          <div className={styles.info}>
            <span>{t.rich('passingScore', { score: passingScore, b: (c) => <b>{c}</b> })}</span>
            <span>{t.rich('timeLimit', { minutes: session.timeLimit, b: (c) => <b>{c}</b> })}</span>
            <span>
              {t.rich('answered', { done: answeredCount, total: questions.length, b: (c) => <b>{c}</b> })}
            </span>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('finishTitle')}
        description={t('finishDescription', { left: unanswered, total: questions.length })}
        confirmLabel={t('finishConfirm')}
        loading={submitMutation.isPending}
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={exitOpen}
        title={t('exitTitle')}
        description={t('exitDescription')}
        confirmLabel={t('exitConfirm')}
        danger
        onConfirm={() => {
          setExitOpen(false);
          onExit();
        }}
        onCancel={() => setExitOpen(false)}
      />
    </div>
  );
}
