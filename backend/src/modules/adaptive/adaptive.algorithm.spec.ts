import {
  ADAPTIVE_CONFIG,
  adaptiveFor,
  assembleAdaptiveTest,
  assignGroup,
  eloUpdate,
  evidenceWeight,
  initialDifficulty,
  masteryLevel,
  pCorrect,
  priorMastery,
  recommend,
  replayHistory,
  splitGroups,
  targetDifficulty,
  updateMastery,
  type CourseSectionInfo,
  type MasteryState,
} from './adaptive.algorithm';

/** Deterministic PRNG (mulberry32) for reproducible tests. */
function rngFrom(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T = { masteryThreshold: 0.6, accelerationThreshold: 0.85 };

describe('learner model: mastery (EWMA)', () => {
  it('starts at the prior 0.5 without evidence', () => {
    expect(priorMastery()).toEqual({ mastery: 0.5, evidence: 0 });
  });

  it('m ← m + α·w·(s − m) for a correct medium question', () => {
    const next = updateMastery(priorMastery(), {
      kind: 'question',
      score: 1,
      difficulty: 2,
    });
    // α = 0.3, w = 1·1 → 0.5 + 0.3·(1 − 0.5) = 0.65
    expect(next.mastery).toBeCloseTo(0.65, 10);
    expect(next.evidence).toBe(1);
  });

  it('weights: test answer > assignment > lesson; harder questions weigh more', () => {
    const q = evidenceWeight({ kind: 'question', score: 1, difficulty: 2 });
    const a = evidenceWeight({ kind: 'assignment', score: 1 });
    const l = evidenceWeight({ kind: 'lesson', score: 1 });
    expect(q).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(l);
    expect(
      evidenceWeight({ kind: 'question', score: 1, difficulty: 3 }),
    ).toBeGreaterThan(
      evidenceWeight({ kind: 'question', score: 1, difficulty: 1 }),
    );
  });

  it('partial credit moves mastery proportionally and stays in [0,1]', () => {
    let st: MasteryState = priorMastery();
    st = updateMastery(st, { kind: 'question', score: 0.5, difficulty: 2 });
    expect(st.mastery).toBeCloseTo(0.5, 10);
    for (let i = 0; i < 200; i++)
      st = updateMastery(st, { kind: 'question', score: 5, difficulty: 3 });
    expect(st.mastery).toBeLessThanOrEqual(1);
    expect(st.mastery).toBeGreaterThan(0.99);
  });

  it('converges to the true success rate of repeated evidence', () => {
    let st = priorMastery();
    const rng = rngFrom(7);
    for (let i = 0; i < 400; i++)
      st = updateMastery(st, {
        kind: 'question',
        score: rng() < 0.8 ? 1 : 0,
        difficulty: 2,
      });
    expect(st.mastery).toBeGreaterThan(0.55);
    expect(st.mastery).toBeLessThan(1);
  });

  it('levels: unknown → weak → progress → mastered (needs enough evidence)', () => {
    expect(masteryLevel({ mastery: 0.5, evidence: 0 }, T)).toBe('unknown');
    expect(masteryLevel({ mastery: 0.4, evidence: 2 }, T)).toBe('weak');
    expect(masteryLevel({ mastery: 0.7, evidence: 2 }, T)).toBe('progress');
    expect(masteryLevel({ mastery: 0.9, evidence: 2 }, T)).toBe('progress');
    expect(masteryLevel({ mastery: 0.9, evidence: 3 }, T)).toBe('mastered');
  });
});

describe('Rasch / Elo calibration', () => {
  it('P(correct) is 0.5 when ability equals difficulty', () => {
    expect(pCorrect(0.3, 0.3)).toBeCloseTo(0.5, 10);
    expect(pCorrect(1, 0)).toBeGreaterThan(0.7);
  });

  it('initial difficulty maps levels 1..3 to −1, 0, +1 logits', () => {
    expect([1, 2, 3].map((l) => initialDifficulty(l))).toEqual([-1, 0, 1]);
    expect(initialDifficulty(9)).toBe(1);
  });

  it('a correct answer raises θ and lowers b by K·(1 − P)', () => {
    const r = eloUpdate({ theta: 0, answers: 0 }, { b: 0, count: 0 }, 1);
    expect(r.p).toBeCloseTo(0.5, 10);
    expect(r.student.theta).toBeCloseTo(ADAPTIVE_CONFIG.elo.kTheta * 0.5, 10);
    expect(r.question.b).toBeCloseTo(-ADAPTIVE_CONFIG.elo.kB * 0.5, 10);
    expect(r.student.answers).toBe(1);
    expect(r.question.count).toBe(1);
  });

  it('step sizes decay with the number of answers', () => {
    const fresh = eloUpdate({ theta: 0, answers: 0 }, { b: 0, count: 0 }, 0);
    const seasoned = eloUpdate(
      { theta: 0, answers: 100 },
      { b: 0, count: 100 },
      0,
    );
    expect(Math.abs(seasoned.student.theta)).toBeLessThan(
      Math.abs(fresh.student.theta),
    );
    expect(Math.abs(seasoned.question.b)).toBeLessThan(
      Math.abs(fresh.question.b),
    );
  });

  it('recovers a student ability from simulated answers', () => {
    const trueTheta = 1.2;
    const rng = rngFrom(42);
    let st = { theta: 0, answers: 0 };
    const bank = Array.from({ length: 60 }, (_, i) => ({
      b: -2 + (4 * i) / 59,
      count: 50,
    }));
    for (let i = 0; i < 300; i++) {
      const q = bank[i % bank.length];
      const r = rng() < pCorrect(trueTheta, q.b) ? 1 : 0;
      st = eloUpdate(st, q, r).student;
    }
    expect(st.theta).toBeGreaterThan(0.6);
    expect(st.theta).toBeLessThan(1.8);
  });

  it('target difficulty b* = θ − ln(p/(1−p)) gives P(correct) = p', () => {
    const b = targetDifficulty(0.4, 0.7);
    expect(b).toBeCloseTo(0.4 - Math.log(0.7 / 0.3), 10);
    expect(pCorrect(0.4, b)).toBeCloseTo(0.7, 10);
  });
});

describe('replayHistory', () => {
  it('rebuilds the same state as incremental updates, in time order', () => {
    const events = [
      {
        at: 3,
        userId: 1,
        sectionId: 10,
        kind: 'assignment' as const,
        score: 0.4,
      },
      {
        at: 1,
        userId: 1,
        sectionId: 10,
        kind: 'question' as const,
        score: 1,
        questionId: 5,
        difficulty: 2,
      },
      { at: 2, userId: 1, sectionId: 10, kind: 'lesson' as const, score: 0.7 },
    ];
    const res = replayHistory(events);
    let st = priorMastery();
    st = updateMastery(st, { kind: 'question', score: 1, difficulty: 2 });
    st = updateMastery(st, { kind: 'lesson', score: 0.7 });
    st = updateMastery(st, { kind: 'assignment', score: 0.4 });
    expect(res.mastery.get('1:10')!.mastery).toBeCloseTo(st.mastery, 10);
    expect(res.mastery.get('1:10')!.evidence).toBe(3);
    expect(res.ability.get(1)!.answers).toBe(1);
    expect(res.calibration.get(5)!.count).toBe(1);
  });
});

describe('adaptive test assembly', () => {
  const pool = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((b, i) => ({
    id: i + 1,
    b,
    sectionId: 1,
  }));

  it('a weak student gets easier questions than a strong one', () => {
    const weak = assembleAdaptiveTest({
      pool,
      count: 3,
      theta: -1,
      rng: rngFrom(1),
    });
    const strong = assembleAdaptiveTest({
      pool,
      count: 3,
      theta: 2,
      rng: rngFrom(1),
    });
    const mean = (ids: number[]) =>
      ids.reduce((s, id) => s + pool.find((q) => q.id === id)!.b, 0) /
      ids.length;
    expect(mean(weak.ids)).toBeLessThan(mean(strong.ids));
    // b* for θ = −1: −1 − 0.847 ≈ −1.85 → the three easiest
    expect(weak.ids.sort()).toEqual([1, 2, 3]);
  });

  it('avoids repeating the previous attempt when the pool allows', () => {
    const first = assembleAdaptiveTest({
      pool,
      count: 3,
      theta: 0,
      rng: rngFrom(2),
    });
    const second = assembleAdaptiveTest({
      pool,
      count: 3,
      theta: 0,
      lastAttemptIds: first.ids,
      rng: rngFrom(3),
    });
    // Repeats are penalised (+1 logit), so the overlap shrinks…
    expect(
      second.ids.filter((id) => first.ids.includes(id)).length,
    ).toBeLessThan(first.ids.length);
    // …and an identical attempt is never produced while the pool has more.
    const pair = [
      { id: 1, b: 0, sectionId: 1 },
      { id: 2, b: 0.1, sectionId: 1 },
      { id: 3, b: 3, sectionId: 1 },
    ];
    const again = assembleAdaptiveTest({
      pool: pair,
      count: 2,
      theta: 0.8,
      lastAttemptIds: [1, 2],
      rng: rngFrom(5),
    });
    expect(again.ids.sort()).not.toEqual([1, 2]);
  });

  it('covers every weak section first', () => {
    const mixed = [
      { id: 1, b: 0, sectionId: 1 },
      { id: 2, b: 0.1, sectionId: 1 },
      { id: 3, b: 3, sectionId: 2 },
    ];
    const r = assembleAdaptiveTest({
      pool: mixed,
      count: 2,
      theta: 0.8,
      weakSectionIds: [2],
      rng: rngFrom(4),
    });
    expect(r.ids).toContain(3);
  });

  it('never returns more questions than requested or available', () => {
    expect(
      assembleAdaptiveTest({ pool, count: 50, theta: 0 }).ids,
    ).toHaveLength(9);
    expect(assembleAdaptiveTest({ pool, count: 0, theta: 0 }).ids).toHaveLength(
      0,
    );
  });
});

describe('recommendations', () => {
  const now = Date.UTC(2026, 10, 14);
  const day = 86_400_000;
  const sections: CourseSectionInfo[] = [
    {
      id: 1,
      title: 'HTML',
      lessons: [
        { id: 11, title: 'Теги', completed: true, wrongShare: 0.6 },
        {
          id: 12,
          title: 'Тест HTML',
          completed: true,
          test: { id: 100, lastScore: 40, passingScore: 60 },
          wrongShare: 0.2,
        },
      ],
    },
    {
      id: 2,
      title: 'CSS',
      lessons: [
        { id: 21, title: 'Селектори', completed: false },
        {
          id: 22,
          title: 'Лабораторна',
          completed: false,
          assignment: { id: 7, dueAt: now + 2 * day, submitted: false },
        },
      ],
    },
  ];

  it('a weak topic yields REVIEW (most wrong lesson first) and RETRY_TEST on top', () => {
    const mastery = new Map([[1, { mastery: 0.3, evidence: 5 }]]);
    const recs = recommend({ sections, mastery, thresholds: T, now });
    expect(recs[0].type).toBe('REVIEW');
    expect(recs[0].lessonId).toBe(11);
    expect(recs.map((r) => r.type)).toContain('RETRY_TEST');
    expect(recs[0].reason).toBe('review');
    expect(recs[0].params).toMatchObject({ section: 'HTML', mastery: 30 });
  });

  it('priority follows the documented formula', () => {
    const mastery = new Map([[1, { mastery: 0.3, evidence: 5 }]]);
    const recs = recommend({ sections, mastery, thresholds: T, now });
    const review = recs.find((r) => r.key === 'REVIEW:11')!;
    const w = ADAPTIVE_CONFIG.priority;
    // base + w_gap·(τ − m) + w_wrong·wrongShare (no deadline in section 1)
    expect(review.priority).toBeCloseTo(
      w.review + w.gap * 0.3 + w.wrongShare * 0.6,
      3,
    );
  });

  it('NEXT waits until earlier weak topics are fixed', () => {
    const weak = recommend({
      sections,
      mastery: new Map([[1, { mastery: 0.3, evidence: 5 }]]),
      thresholds: T,
      now,
    });
    expect(weak.find((r) => r.type === 'NEXT')).toBeUndefined();
    const ok = recommend({
      sections,
      mastery: new Map([[1, { mastery: 0.7, evidence: 5 }]]),
      thresholds: T,
      now,
    });
    expect(ok.find((r) => r.type === 'NEXT')?.lessonId).toBe(21);
  });

  it('a mastered topic with unfinished lessons suggests skipping ahead', () => {
    const recs = recommend({
      sections: [
        {
          id: 1,
          title: 'HTML',
          lessons: [
            { id: 11, title: 'a', completed: true },
            { id: 12, title: 'b', completed: false },
            { id: 13, title: 'c', completed: false },
          ],
        },
        sections[1],
      ],
      mastery: new Map([[1, { mastery: 0.95, evidence: 6 }]]),
      thresholds: T,
      now,
    });
    const skip = recs.find((r) => r.type === 'SKIP_AHEAD')!;
    expect(skip.params.optional).toBe(2);
    expect(skip.lessonId).toBe(21); // first incomplete lesson of the next topic
  });

  it('an upcoming deadline is recommended and gets more urgent closer to it', () => {
    const far = recommend({
      sections: [
        {
          ...sections[1],
          lessons: [
            {
              ...sections[1].lessons[1],
              assignment: { id: 7, dueAt: now + 6 * day, submitted: false },
            },
          ],
        },
      ],
      mastery: new Map(),
      thresholds: T,
      now,
    }).find((r) => r.type === 'DEADLINE')!;
    const near = recommend({
      sections: [sections[1]],
      mastery: new Map(),
      thresholds: T,
      now,
    }).find((r) => r.type === 'DEADLINE')!;
    expect(near.priority).toBeGreaterThan(far.priority);
    expect(near.params.days).toBe(2);
  });

  it('is deterministic, unique by key and limited to topN', () => {
    const mastery = new Map([[1, { mastery: 0.2, evidence: 5 }]]);
    const a = recommend({ sections, mastery, thresholds: T, now, topN: 3 });
    const b = recommend({ sections, mastery, thresholds: T, now, topN: 3 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((r) => r.key)).size).toBe(a.length);
    for (let i = 1; i < a.length; i++)
      expect(a[i - 1].priority).toBeGreaterThanOrEqual(a[i].priority);
  });
});

describe('A/B experiment', () => {
  it('newcomers join the smaller arm; ties are random', () => {
    expect(assignGroup({ ADAPTIVE: 3, CONTROL: 5 })).toBe('ADAPTIVE');
    expect(assignGroup({ ADAPTIVE: 5, CONTROL: 3 })).toBe('CONTROL');
    expect(assignGroup({ ADAPTIVE: 2, CONTROL: 2 }, () => 0.1)).toBe(
      'ADAPTIVE',
    );
    expect(assignGroup({ ADAPTIVE: 2, CONTROL: 2 }, () => 0.9)).toBe('CONTROL');
  });

  it('splits existing students into balanced random arms', () => {
    for (const n of [0, 1, 7, 20, 51]) {
      const items = Array.from({ length: n }, (_, i) => i);
      const split = splitGroups(items, rngFrom(n + 1));
      const a = [...split.values()].filter((g) => g === 'ADAPTIVE').length;
      expect(split.size).toBe(n);
      expect(Math.abs(a - (n - a))).toBeLessThanOrEqual(1);
    }
  });

  it('the split is random: different seeds give different arms', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = [...splitGroups(items, rngFrom(1)).entries()].join();
    const b = [...splitGroups(items, rngFrom(2)).entries()].join();
    expect(a).not.toBe(b);
  });

  it('control students get no adaptive behaviour', () => {
    const on = { enabled: true, experimentMode: 'OFF' as const };
    const ab = { enabled: true, experimentMode: 'AB_TEST' as const };
    expect(adaptiveFor(on, null)).toBe(true);
    expect(adaptiveFor({ ...on, enabled: false }, null)).toBe(false);
    expect(adaptiveFor(ab, 'ADAPTIVE')).toBe(true);
    expect(adaptiveFor(ab, 'CONTROL')).toBe(false);
    expect(adaptiveFor(ab, null)).toBe(false);
  });
});
