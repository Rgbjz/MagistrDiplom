'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { Answer, Question, QuestionType, TestFull } from '../../lib/types';
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
        body: JSON.stringify({ title, timeLimit, passingScore }),
      }),
    onSuccess: () => {
      invalidateTest();
      invalidateCourse();
    },
  });

  const addQuestion = useMutation({
    mutationFn: () =>
      clientApi(`/tests/${testId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'New question', type: 'SINGLE' }),
      }),
    onSuccess: invalidateTest,
  });

  const delTest = useMutation({
    mutationFn: () => clientApi(`/tests/${testId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateCourse();
      onDeleted();
    },
  });

  if (!test) return <p className={styles.loading}>Loading…</p>;

  return (
    <div className={styles.editor}>
      <div className={styles.meta}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveMeta.mutate()}
        />
        <div className={styles.row}>
          <label>
            Time limit (min)
            <input
              type="number"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              onBlur={() => saveMeta.mutate()}
            />
          </label>
          <label>
            Passing score (%)
            <input
              type="number"
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              onBlur={() => saveMeta.mutate()}
            />
          </label>
        </div>
        <button className={styles.deleteBtn} onClick={() => delTest.mutate()}>
          Delete test
        </button>
      </div>

      <div className={styles.questions}>
        <div className={styles.questionsHeader}>
          <h3>Questions</h3>
          <button onClick={() => addQuestion.mutate()}>+ Add question</button>
        </div>
        {test.questions.map((q) => (
          <QuestionItem key={q.id} question={q} onChanged={invalidateTest} />
        ))}
      </div>
    </div>
  );
}

function QuestionItem({
  question,
  onChanged,
}: {
  question: Question;
  onChanged: () => void;
}) {
  const [text, setText] = useState(question.text);
  const [type, setType] = useState<QuestionType>(question.type);

  useEffect(() => {
    setText(question.text);
    setType(question.type);
  }, [question.id, question.text, question.type]);

  const patchQuestion = useMutation({
    mutationFn: (data: Partial<{ text: string; type: QuestionType }>) =>
      clientApi(`/tests/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: onChanged,
  });
  const delQuestion = useMutation({
    mutationFn: () =>
      clientApi(`/tests/questions/${question.id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });
  const addAnswer = useMutation({
    mutationFn: () =>
      clientApi(`/tests/questions/${question.id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'New answer' }),
      }),
    onSuccess: onChanged,
  });
  const patchAnswer = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<{ text: string; isCorrect: boolean }>;
    }) =>
      clientApi(`/tests/answers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: onChanged,
  });
  const delAnswer = useMutation({
    mutationFn: (id: number) =>
      clientApi(`/tests/answers/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });

  function changeType(newType: QuestionType) {
    if (newType === type) return;
    setType(newType);
    patchQuestion.mutate({ type: newType });
    // Normalize to a single correct answer when switching to SINGLE.
    if (newType === 'SINGLE') {
      const firstCorrect =
        question.answers.find((a) => a.isCorrect) ?? question.answers[0];
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
      patchAnswer.mutate({
        id: answer.id,
        data: { isCorrect: !answer.isCorrect },
      });
    }
  }

  return (
    <div className={styles.questionCard}>
      <div className={styles.questionTop}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== question.text) patchQuestion.mutate({ text });
          }}
        />
        <select
          value={type}
          onChange={(e) => changeType(e.target.value as QuestionType)}
        >
          <option value="SINGLE">Single</option>
          <option value="MULTIPLE">Multiple</option>
        </select>
        <button onClick={() => delQuestion.mutate()}>🗑</button>
      </div>

      <div className={styles.answers}>
        {question.answers.map((a) => (
          <AnswerRow
            key={a.id}
            answer={a}
            type={type}
            onToggle={() => toggleCorrect(a)}
            onText={(newText) => {
              if (newText !== a.text)
                patchAnswer.mutate({ id: a.id, data: { text: newText } });
            }}
            onDelete={() => delAnswer.mutate(a.id)}
          />
        ))}
        <button className={styles.addAnswer} onClick={() => addAnswer.mutate()}>
          + Add answer
        </button>
      </div>
    </div>
  );
}

function AnswerRow({
  answer,
  type,
  onToggle,
  onText,
  onDelete,
}: {
  answer: Answer;
  type: QuestionType;
  onToggle: () => void;
  onText: (text: string) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(answer.text);
  useEffect(() => {
    setText(answer.text);
  }, [answer.id, answer.text]);

  return (
    <div className={styles.answer}>
      <input
        type={type === 'SINGLE' ? 'radio' : 'checkbox'}
        checked={answer.isCorrect}
        onChange={onToggle}
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onText(text)}
      />
      <button onClick={onDelete}>🗑</button>
    </div>
  );
}
