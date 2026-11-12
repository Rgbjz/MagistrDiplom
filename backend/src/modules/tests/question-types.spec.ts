import { BadRequestException } from '@nestjs/common';
import {
  correctSolution,
  describeResponse,
  normalizeConfig,
  parseResponse,
  questionProblem,
  scoreQuestion,
  studentView,
  type QuestionLike,
} from './question-types';
import { drawAttempt } from './draw';

function q(
  type: string,
  config: unknown = null,
  extra: Partial<QuestionLike> = {},
): QuestionLike {
  return {
    id: 1,
    type,
    text: 'Q',
    points: 2,
    partialCredit: false,
    config,
    answers: [],
    ...extra,
  };
}

const choices = [
  { id: 1, text: 'a', isCorrect: true },
  { id: 2, text: 'b', isCorrect: true },
  { id: 3, text: 'c', isCorrect: false },
];

describe('question scoring', () => {
  it('MULTIPLE: all-or-nothing, or partial (correct − wrong) floored at 0', () => {
    const strict = q('MULTIPLE', null, { answers: choices });
    expect(scoreQuestion(strict, { answerIds: [1] }).earned).toBe(0);
    expect(scoreQuestion(strict, { answerIds: [1, 2] }).earned).toBe(2);
    const partial = { ...strict, partialCredit: true };
    expect(scoreQuestion(partial, { answerIds: [1] }).earned).toBe(1);
    expect(scoreQuestion(partial, { answerIds: [1, 3] }).earned).toBe(0);
    expect(scoreQuestion(partial, { answerIds: [3] }).earned).toBe(0);
  });

  it('TRUE_FALSE', () => {
    const tf = q('TRUE_FALSE', { correct: false });
    expect(scoreQuestion(tf, { value: false }).earned).toBe(2);
    expect(scoreQuestion(tf, { value: true }).earned).toBe(0);
  });

  it('SHORT_TEXT: trimmed, case-insensitive (also Cyrillic), optional case-sensitive', () => {
    const st = q('SHORT_TEXT', { accepted: ['Київ', 'Kyiv'] });
    expect(scoreQuestion(st, { text: '  київ ' }).earned).toBe(2);
    expect(scoreQuestion(st, { text: 'KYIV' }).earned).toBe(2);
    expect(scoreQuestion(st, { text: 'Львів' }).earned).toBe(0);
    const cs = q('SHORT_TEXT', { accepted: ['SELECT'], caseSensitive: true });
    expect(scoreQuestion(cs, { text: 'select' }).earned).toBe(0);
  });

  it('NUMERIC: value ± tolerance', () => {
    const n = q('NUMERIC', { value: 3.14, tolerance: 0.01 });
    expect(scoreQuestion(n, { value: 3.15 }).earned).toBe(2);
    expect(scoreQuestion(n, { value: 3.2 }).earned).toBe(0);
  });

  it('MATCHING: partial credit per correct pair', () => {
    const m = q('MATCHING', {
      pairs: [
        { left: 'HTML', right: 'розмітка' },
        { left: 'CSS', right: 'стилі' },
        { left: 'JS', right: 'логіка' },
        { left: 'SQL', right: 'запити' },
      ],
    });
    expect(scoreQuestion(m, { pairs: { 0: 0, 1: 1, 2: 3, 3: 2 } }).earned).toBe(
      1,
    );
    expect(scoreQuestion(m, { pairs: { 0: 0, 1: 1, 2: 2, 3: 3 } }).earned).toBe(
      2,
    );
  });

  it('ORDERING: full order, or partial by positions', () => {
    const o = q('ORDERING', { items: ['a', 'b', 'c', 'd'] });
    expect(scoreQuestion(o, { order: [0, 1, 2, 3] }).earned).toBe(2);
    expect(scoreQuestion(o, { order: [0, 1, 3, 2] }).earned).toBe(0);
    expect(
      scoreQuestion({ ...o, partialCredit: true }, { order: [0, 1, 3, 2] })
        .earned,
    ).toBe(1);
  });

  it('ESSAY stays pending; an empty essay scores 0 without review', () => {
    const e = q('ESSAY', { maxWords: null, rubric: '' });
    expect(scoreQuestion(e, { text: 'text' })).toEqual({
      earned: 0,
      status: 'PENDING',
    });
    expect(scoreQuestion(e, null)).toEqual({ earned: 0, status: 'AUTO' });
  });
});

describe('response validation', () => {
  it('rejects malformed payloads per type', () => {
    expect(() => parseResponse(q('TRUE_FALSE'), { value: 'yes' })).toThrow(
      BadRequestException,
    );
    expect(() => parseResponse(q('NUMERIC'), { value: 'abc' })).toThrow(
      BadRequestException,
    );
    expect(parseResponse(q('NUMERIC'), { value: '3,5' })).toEqual({
      value: 3.5,
    });
    const o = q('ORDERING', { items: ['a', 'b'] });
    expect(() => parseResponse(o, { order: [0, 0] })).toThrow(
      BadRequestException,
    );
    const m = q('MATCHING', { pairs: [{ left: 'a', right: 'b' }] });
    expect(() => parseResponse(m, { pairs: { 5: 0 } })).toThrow(
      BadRequestException,
    );
    expect(
      parseResponse(q('SHORT_TEXT', { accepted: ['x'] }), { text: '   ' }),
    ).toBeNull();
  });

  it('normalises configs', () => {
    expect(
      normalizeConfig('SHORT_TEXT', { accepted: [' a ', 'a', ''] }),
    ).toEqual({
      accepted: ['a'],
      caseSensitive: false,
    });
    expect(normalizeConfig('NUMERIC', { value: '2', tolerance: -1 })).toEqual({
      value: 2,
      tolerance: 1,
    });
    expect(() => normalizeConfig('NUMERIC', { value: 'x' })).toThrow(
      BadRequestException,
    );
  });
});

describe('student view never contains the key', () => {
  it('hides isCorrect, accepted answers and pair order', () => {
    const choice = studentView(
      q('SINGLE', null, { answers: choices }),
      [3, 1, 2],
    );
    expect(JSON.stringify(choice)).not.toContain('isCorrect');
    expect((choice.answers as { id: number }[]).map((a) => a.id)).toEqual([
      3, 1, 2,
    ]);
    const st = studentView(q('SHORT_TEXT', { accepted: ['secret'] }), null);
    expect(JSON.stringify(st)).not.toContain('secret');
    const m = studentView(
      q('MATCHING', {
        pairs: [
          { left: 'L1', right: 'R1' },
          { left: 'L2', right: 'R2' },
        ],
      }),
      [1, 0],
    ) as { right: { id: number }[] };
    expect(m.right.map((r) => r.id)).toEqual([1, 0]);
  });

  it('solution and described response for review', () => {
    const o = q('ORDERING', { items: ['a', 'b'] });
    expect(correctSolution(o)).toEqual({ items: ['a', 'b'] });
    expect(describeResponse(o, { order: [1, 0] })).toEqual({
      items: ['b', 'a'],
    });
  });
});

describe('attempt draw', () => {
  const rng = (() => {
    let x = 0.1;
    return () => (x = (x * 9301 + 0.49297) % 1);
  })();
  const own = [1, 2, 3, 4].map((id) => ({
    ...q('TRUE_FALSE', { correct: true }),
    id,
  }));

  it('takes a subset, adds bank questions without repeats and keeps them stable', () => {
    const bank = [4, 5, 6].map((id) => ({
      ...q('TRUE_FALSE', { correct: true }),
      id,
    }));
    const drawn = drawAttempt(
      own,
      [{ questions: bank, count: 2 }],
      {
        shuffleQuestions: false,
        shuffleAnswers: false,
        questionsPerAttempt: 2,
      },
      rng,
    );
    const ids = drawn.map((d) => d.question.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(drawn.map((d) => d.position)).toEqual([0, 1, 2, 3]);
  });

  it('always shuffles ordering items away from the right order', () => {
    const ordering = { ...q('ORDERING', { items: ['a', 'b', 'c'] }), id: 9 };
    const [d] = drawAttempt(
      [ordering],
      [],
      {
        shuffleQuestions: false,
        shuffleAnswers: false,
        questionsPerAttempt: null,
      },
      rng,
    );
    expect(d.optionOrder).not.toEqual([0, 1, 2]);
    expect([...(d.optionOrder ?? [])].sort()).toEqual([0, 1, 2]);
  });

  it('skips questions that cannot be answered', () => {
    const broken = { ...q('SINGLE', null, { answers: [] }), id: 20 };
    expect(
      drawAttempt(
        [broken],
        [],
        {
          shuffleQuestions: false,
          shuffleAnswers: false,
          questionsPerAttempt: null,
        },
        rng,
      ),
    ).toEqual([]);
  });
});

describe('questionProblem (blocks publishing)', () => {
  const opt = (id: number, isCorrect: boolean, text = `A${id}`) => ({
    id,
    text,
    isCorrect,
  });
  it('choice questions need two options and a correct one', () => {
    expect(questionProblem(q('MULTIPLE'))).toBe('fewOptions');
    expect(
      questionProblem(
        q('SINGLE', null, { answers: [opt(1, false), opt(2, false)] }),
      ),
    ).toBe('noCorrect');
    expect(
      questionProblem(
        q('SINGLE', null, { answers: [opt(1, true), opt(2, false)] }),
      ),
    ).toBeNull();
  });
  it('typed questions need their key', () => {
    expect(questionProblem(q('SHORT_TEXT', { accepted: [] }))).toBe(
      'noAccepted',
    );
    expect(questionProblem(q('SHORT_TEXT', { accepted: ['x'] }))).toBeNull();
    expect(questionProblem(q('NUMERIC', { value: 'abc', tolerance: 0 }))).toBe(
      'noValue',
    );
    expect(
      questionProblem(q('NUMERIC', { value: 3, tolerance: 0 })),
    ).toBeNull();
    expect(
      questionProblem(q('MATCHING', { pairs: [{ left: 'a', right: 'b' }] })),
    ).toBe('fewPairs');
    expect(questionProblem(q('ORDERING', { items: ['a', ''] }))).toBe(
      'fewItems',
    );
    expect(questionProblem(q('ORDERING', { items: ['a', 'b'] }))).toBeNull();
    expect(questionProblem(q('ESSAY', {}))).toBeNull();
  });
  it('a question without text is incomplete', () => {
    expect(
      questionProblem(q('TRUE_FALSE', { correct: true }, { text: ' ' })),
    ).toBe('noText');
  });
});
