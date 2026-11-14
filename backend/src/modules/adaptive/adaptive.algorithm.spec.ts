import {
  ADAPTIVE_CONFIG,
  ADAPTIVE_CONFIG_V1,
  ADAPTIVE_CONFIG_V2,
  adaptiveFor,
  assemblePlacementTest,
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
const V1 = ADAPTIVE_CONFIG_V1;
const V2 = ADAPTIVE_CONFIG_V2;

describe('learner model v1: mastery (EWMA)', () => {
  it('starts at the prior 0.5 without evidence', () => {
    expect(priorMastery()).toEqual({ mastery: 0.5, evidence: 0 });
  });

  it('m ← m + α·w·(s − m) for a correct medium question', () => {
    const next = updateMastery(
      priorMastery(),
      { kind: 'question', score: 1, difficulty: 2 },
      V1,
    );
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
    st = updateMastery(st, { kind: 'question', score: 0.5, difficulty: 2 }, V1);
    expect(st.mastery).toBeCloseTo(0.5, 10);
    for (let i = 0; i < 200; i++)
      st = updateMastery(st, { kind: 'question', score: 5, difficulty: 3 }, V1);
    expect(st.mastery).toBeLessThanOrEqual(1);
    expect(st.mastery).toBeGreaterThan(0.99);
  });

  it('converges to the true success rate of repeated evidence', () => {
    let st = priorMastery();
    const rng = rngFrom(7);
    for (let i = 0; i < 400; i++)
      st = updateMastery(
        st,
        { kind: 'question', score: rng() < 0.8 ? 1 : 0, difficulty: 2 },
        V1,
      );
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
    for (const [cfg, evidence] of [
      [V1, 3],
      [V2, 2], // v2: the lesson is not assessed evidence
    ] as const) {
      const res = replayHistory(events, cfg);
      let st = priorMastery(cfg);
      st = updateMastery(
        st,
        { kind: 'question', score: 1, difficulty: 2 },
        cfg,
      );
      st = updateMastery(st, { kind: 'lesson', score: 0.7 }, cfg);
      st = updateMastery(st, { kind: 'assignment', score: 0.4 }, cfg);
      expect(res.mastery.get('1:10')!.mastery).toBeCloseTo(st.mastery, 10);
      expect(res.mastery.get('1:10')!.evidence).toBe(evidence);
    }
    const res = replayHistory(events);
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

describe('recommendations (v1)', () => {
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
    const recs = recommend({ sections, mastery, thresholds: T, now }, V1);
    expect(recs[0].type).toBe('REVIEW');
    expect(recs[0].lessonId).toBe(11);
    expect(recs.map((r) => r.type)).toContain('RETRY_TEST');
    expect(recs[0].reason).toBe('review');
    expect(recs[0].params).toMatchObject({ section: 'HTML', mastery: 30 });
  });

  it('priority follows the documented formula', () => {
    const mastery = new Map([[1, { mastery: 0.3, evidence: 5 }]]);
    const recs = recommend({ sections, mastery, thresholds: T, now }, V1);
    const review = recs.find((r) => r.key === 'REVIEW:11')!;
    const w = V1.priority;
    // base + w_gap·(τ − m) + w_wrong·wrongShare (no deadline in section 1)
    expect(review.priority).toBeCloseTo(
      w.review + w.gap * 0.3 + w.wrongShare * 0.6,
      3,
    );
  });

  it('NEXT waits until earlier weak topics are fixed', () => {
    const weak = recommend(
      {
        sections,
        mastery: new Map([[1, { mastery: 0.3, evidence: 5 }]]),
        thresholds: T,
        now,
      },
      V1,
    );
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

describe('version 2 (the app): rules from the simulation diagnosis', () => {
  it('evidence gate: a completed lesson never makes a topic weak', () => {
    let st = priorMastery(V2);
    st = updateMastery(st, { kind: 'lesson', score: 0.7 }, V2);
    expect(st.evidence).toBe(0);
    expect(masteryLevel(st, T, V2)).toBe('unknown');
    // v1 read the same lesson as evidence and called the topic weak.
    const v1 = updateMastery(
      priorMastery(V1),
      { kind: 'lesson', score: 0.7 },
      V1,
    );
    expect(masteryLevel(v1, T, V1)).toBe('weak');
  });

  it('topic mastery is σ(θ_t): the probability of a reference (b = 0) item', () => {
    let st = priorMastery(V2);
    st = updateMastery(st, { kind: 'question', score: 1, difficulty: 2 }, V2);
    // θ_t = 0 + K·(1 − σ(0 − 0)) = 0.6·0.5 = 0.3
    expect(st.mastery).toBeCloseTo(1 / (1 + Math.exp(-0.3)), 10);
    expect(st.evidence).toBe(1);
  });

  it('acceleration can fire: answering at P≈0.7 on hard items means high mastery', () => {
    // A strong student answers hard items (b = +1) correctly 70 % of the time.
    // v1 (EWMA of raw scores) settles near 0.7; v2 reads θ_t ≈ 1 + logit(0.7).
    const rng = rngFrom(3);
    let v1 = priorMastery(V1);
    let v2 = priorMastery(V2);
    for (let i = 0; i < 300; i++) {
      const e = {
        kind: 'question' as const,
        score: rng() < 0.7 ? 1 : 0,
        difficulty: 3,
      };
      v1 = updateMastery(v1, e, V1);
      v2 = updateMastery(v2, e, V2);
    }
    expect(masteryLevel(v1, T, V1)).not.toBe('mastered');
    expect(masteryLevel(v2, T, V2)).toBe('mastered');
  });

  it('soft gating: a studied and tested weak topic no longer blocks NEXT', () => {
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
          },
        ],
      },
      {
        id: 2,
        title: 'CSS',
        lessons: [{ id: 21, title: 'Селектори', completed: false }],
      },
    ];
    const mastery = new Map([[1, { mastery: 0.3, evidence: 5 }]]);
    const v1 = recommend({ sections, mastery, thresholds: T, now: 0 }, V1);
    expect(v1.find((r) => r.type === 'NEXT')).toBeUndefined();
    const v2 = recommend({ sections, mastery, thresholds: T, now: 0 }, V2);
    expect(v2[0]).toMatchObject({ type: 'NEXT', lessonId: 21 });
    // Review stays suggested, behind the next lesson.
    expect(v2.map((r) => r.type)).toContain('REVIEW');
    // Not studied yet (test never attempted) → still blocks.
    const untested = sections.map((s) =>
      s.id === 1
        ? {
            ...s,
            lessons: s.lessons.map((l) =>
              l.test ? { ...l, test: { ...l.test, lastScore: null } } : l,
            ),
          }
        : s,
    );
    const blocked = recommend(
      { sections: untested, mastery, thresholds: T, now: 0 },
      V2,
    );
    expect(blocked.find((r) => r.type === 'NEXT')).toBeUndefined();
  });

  it('spaced review: after the course, the weakest topic is kept fresh', () => {
    const sections: CourseSectionInfo[] = [
      { id: 1, title: 'A', lessons: [{ id: 11, title: 'a', completed: true }] },
      { id: 2, title: 'B', lessons: [{ id: 21, title: 'b', completed: true }] },
    ];
    const mastery = new Map([
      [1, { mastery: 0.8, evidence: 4 }],
      [2, { mastery: 0.7, evidence: 4 }],
    ]);
    const recs = recommend({ sections, mastery, thresholds: T, now: 0 }, V2);
    expect(recs[0]).toMatchObject({
      type: 'REVIEW',
      sectionId: 2,
      lessonId: 21,
    });
    expect(recommend({ sections, mastery, thresholds: T, now: 0 }, V1)).toEqual(
      [],
    );
  });

  it('the app runs version 3 (v2 + retrieval practice)', () => {
    expect(ADAPTIVE_CONFIG.version).toBe(3);
    expect(ADAPTIVE_CONFIG).toEqual({
      ...V2,
      version: 3,
      retrievalPractice: true,
    });
  });
});

describe('version 3 candidates (pre-registered study)', () => {
  const V3 = ADAPTIVE_CONFIG;
  const studiedWeak: CourseSectionInfo[] = [
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
        },
      ],
    },
  ];
  const weak = new Map([[1, { mastery: 0.3, evidence: 5 }]]);

  it('retrieval practice: a studied weak topic is retested before re-reading', () => {
    const v2 = recommend(
      { sections: studiedWeak, mastery: weak, thresholds: T, now: 0 },
      V2,
    );
    expect(v2[0].type).toBe('REVIEW');
    const v3 = recommend(
      { sections: studiedWeak, mastery: weak, thresholds: T, now: 0 },
      V3,
    );
    expect(v3[0].type).toBe('RETRY_TEST');
    expect(v3.map((r) => r.type)).toContain('REVIEW');
  });

  it('retrieval practice does not apply before the lessons were studied', () => {
    const unstudied = [
      {
        ...studiedWeak[0],
        lessons: studiedWeak[0].lessons.map((l) => ({
          ...l,
          completed: l.id === 12,
        })),
      },
    ];
    const recs = recommend(
      { sections: unstudied, mastery: weak, thresholds: T, now: 0 },
      V3,
    );
    expect(recs.find((r) => r.type === 'REVIEW')!.priority).toBeGreaterThan(
      recs.find((r) => r.type === 'RETRY_TEST')!.priority,
    );
  });

  it('placement quiz takes the items nearest to b = 0, per section', () => {
    const pool = [
      { id: 1, b: -1.2, sectionId: 1 },
      { id: 2, b: 0.1, sectionId: 1 },
      { id: 3, b: -0.3, sectionId: 1 },
      { id: 4, b: 1.5, sectionId: 2 },
      { id: 5, b: 0.05, sectionId: 2 },
    ];
    expect(assemblePlacementTest(pool, 2)).toEqual([2, 3, 5, 4]);
  });

  it('skipping mastered topics and spaced review of all topics (candidates)', () => {
    const cfg = { ...V2, skipMasteredInNext: true, spacedAll: true };
    const sections: CourseSectionInfo[] = [
      {
        id: 1,
        title: 'A',
        lessons: [{ id: 11, title: 'a', completed: false }],
      },
      {
        id: 2,
        title: 'B',
        lessons: [{ id: 21, title: 'b', completed: false }],
      },
    ];
    const mastery = new Map([[1, { mastery: 0.9, evidence: 3 }]]);
    const next = recommend(
      { sections, mastery, thresholds: T, now: 0 },
      cfg,
    ).find((r) => r.type === 'NEXT');
    expect(next?.lessonId).toBe(21);
    const day = 86_400_000;
    const done = sections.map((s) => ({
      ...s,
      lessons: s.lessons.map((l) => ({
        ...l,
        completed: true,
        lastStudiedAt: 0,
      })),
    }));
    const recs = recommend(
      {
        sections: done,
        mastery: new Map([
          [1, { mastery: 0.9, evidence: 3 }],
          [2, { mastery: 0.9, evidence: 3 }],
        ]),
        thresholds: T,
        now: 2 * day,
        lastPractice: new Map([
          [1, 2 * day - 1000],
          [2, 0],
        ]),
      },
      cfg,
    );
    // Topic B was practised long ago: larger predicted gap, reviewed first.
    expect(recs[0]).toMatchObject({ type: 'REVIEW', sectionId: 2 });
  });
});
