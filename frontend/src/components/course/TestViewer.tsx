'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type {
  MyTestResult,
  SessionUser,
  SubmitResult,
  TestFull,
  TestStartResponse,
} from '../../lib/types';
import styles from './TestViewer.module.scss';

export function TestViewer({
  testId,
  courseId,
  user,
}: {
  testId: number;
  courseId: number;
  user: SessionUser;
}) {
  const queryClient = useQueryClient();
  const isStudent = user.role === 'STUDENT';

  const { data: test } = useQuery<TestFull>({
    queryKey: ['test', testId],
    queryFn: () => clientApi<TestFull>(`/tests/${testId}`),
  });

  const { data: myResult } = useQuery<MyTestResult | null>({
    queryKey: ['myTestResult', testId],
    queryFn: () => clientApi<MyTestResult | null>(`/tests/${testId}/my-result`),
    enabled: isStudent,
  });

  const [session, setSession] = useState<TestStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const submittingRef = useRef(false);

  const startMutation = useMutation({
    mutationFn: () =>
      clientApi<TestStartResponse>(`/tests/${testId}/start`, { method: 'POST' }),
    onSuccess: (data) => {
      setSession(data);
      setAnswers({});
      setSubmitted(null);
      setTimeLeft(data.timeLimit * 60);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (resultId: number) =>
      clientApi<SubmitResult>(`/tests/${resultId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      }),
    onSuccess: (data) => {
      setSubmitted(data);
      setSession(null);
      setTimeLeft(null);
      queryClient.invalidateQueries({ queryKey: ['myTestResult', testId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    },
  });

  function doSubmit() {
    if (!session || submittingRef.current) return;
    submittingRef.current = true;
    submitMutation.mutate(session.testResultId);
  }

  // Countdown.
  useEffect(() => {
    if (!session || timeLeft === null) return;
    if (timeLeft <= 0) {
      doSubmit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => (v ?? 0) - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, session]);

  if (!test) return <p>Loading…</p>;

  // ===== Teacher: results table =====
  if (!isStudent) {
    return <TeacherResults testId={testId} />;
  }

  // ===== In progress =====
  if (session) {
    const mins = Math.floor((timeLeft ?? 0) / 60);
    const secs = ((timeLeft ?? 0) % 60).toString().padStart(2, '0');

    function toggle(qId: number, aId: number, type: string) {
      setAnswers((prev) => {
        const cur = prev[qId] ?? [];
        const next =
          type === 'SINGLE'
            ? [aId]
            : cur.includes(aId)
              ? cur.filter((x) => x !== aId)
              : [...cur, aId];
        return { ...prev, [qId]: next };
      });
    }

    return (
      <div className={styles.card}>
        <div className={styles.timer}>
          ⏱ {mins}:{secs}
        </div>
        {session.questions.map((q) => (
          <div key={q.id} className={styles.detailQuestion}>
            <p>
              <strong>{q.text}</strong>
            </p>
            {q.answers.map((a) => (
              <label key={a.id} className={styles.answerRow}>
                <input
                  type={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                  name={`q-${q.id}`}
                  checked={(answers[q.id] ?? []).includes(a.id)}
                  onChange={() => toggle(q.id, a.id, q.type)}
                />
                {a.text}
              </label>
            ))}
          </div>
        ))}
        <button
          className={styles.submitBtn}
          onClick={doSubmit}
          disabled={submitMutation.isPending}
        >
          Submit
        </button>
      </div>
    );
  }

  // ===== Result =====
  const finalResult = submitted
    ? { score: submitted.score, passed: submitted.passed }
    : myResult
      ? { score: myResult.score, passed: myResult.passed }
      : null;

  if (finalResult) {
    const isPerfect = finalResult.score === 100;
    return (
      <div className={styles.resultCard}>
        <div className={styles.resultLayout}>
          <aside className={styles.resultSide}>
            <div className={styles.score}>{finalResult.score}%</div>
            <p className={finalResult.passed ? styles.passed : styles.failed}>
              {finalResult.passed ? 'Passed' : 'Failed'}
            </p>
            <p>Passing score: {test.passingScore}%</p>
            {!isPerfect && (
              <button
                className={styles.startBtn}
                onClick={() => startMutation.mutate()}
              >
                Retry
              </button>
            )}
          </aside>
          <div className={styles.resultMain}>
            <div className={styles.details}>
              {test.questions.map((q) => {
                const d = myResult?.details.find((x) => x.questionId === q.id);
                return (
                  <div key={q.id} className={styles.detailQuestion}>
                    <p>
                      <strong>{q.text}</strong>
                    </p>
                    {q.answers.map((a) => {
                      const picked = d?.userAnswerIds.includes(a.id);
                      const correct = d?.correctAnswerIds.includes(a.id);
                      return (
                        <div
                          key={a.id}
                          className={`${styles.answerRow} ${
                            correct ? styles.correct : ''
                          } ${picked && !correct ? styles.wrong : ''}`}
                        >
                          {correct ? '✔' : picked ? '✖' : ''} {a.text}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Preview / start =====
  return (
    <div className={styles.card}>
      <h2>{test.title}</h2>
      <div className={styles.meta}>
        <span className={styles.metaBox}>⏱ {test.timeLimit} min</span>
        <span className={styles.metaBox}>Pass: {test.passingScore}%</span>
        <span className={styles.metaBox}>
          {test.questions.length} questions
        </span>
      </div>
      <button
        className={styles.startBtn}
        onClick={() => startMutation.mutate()}
        disabled={startMutation.isPending}
      >
        Start test
      </button>
    </div>
  );
}

function TeacherResults({ testId }: { testId: number }) {
  const { data: rows } = useQuery<
    {
      userId: number;
      userName: string;
      email: string;
      attempt: number;
      score: number | null;
      passed: boolean | null;
      finishedAt: string | null;
    }[]
  >({
    queryKey: ['testResults', testId],
    queryFn: () => clientApi(`/tests/${testId}/results`),
  });

  if (!rows) return <p>Loading…</p>;
  return (
    <table className={styles.resultsTable}>
      <thead>
        <tr>
          <th>Student</th>
          <th>Email</th>
          <th>Attempt</th>
          <th>Score</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.userId}>
            <td>{r.userName}</td>
            <td>{r.email}</td>
            <td>{r.attempt}</td>
            <td>{r.score}%</td>
            <td className={r.passed ? styles.passed : styles.failed}>
              {r.passed ? 'Passed' : 'Failed'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
