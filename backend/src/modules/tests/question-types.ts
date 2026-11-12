/**
 * Question types: config validation, scoring and the student-facing shape.
 * Pure functions (no I/O) so every rule is unit-testable.
 *
 * Responses (what a student submits per question):
 *   SINGLE / MULTIPLE  { answerIds: number[] }   (a bare number[] is accepted too)
 *   TRUE_FALSE         { value: boolean }
 *   SHORT_TEXT / ESSAY { text: string }
 *   NUMERIC            { value: number }
 *   MATCHING           { pairs: Record<leftIndex, rightIndex> }   (indexes into config.pairs)
 *   ORDERING           { order: number[] }                         (item indexes in the chosen order)
 *
 * Scoring:
 *   SINGLE, TRUE_FALSE, SHORT_TEXT, NUMERIC — all or nothing;
 *   MULTIPLE — all or nothing, or with partialCredit: (correct picked − wrong picked) / correct, floored at 0;
 *   MATCHING — always partial: correct pairs / pairs;
 *   ORDERING — all or nothing, or with partialCredit: items in the right position / items;
 *   ESSAY — manual (PENDING until staff grade it).
 */
import { BadRequestException } from '@nestjs/common';

export const QUESTION_TYPES = [
  'SINGLE',
  'MULTIPLE',
  'TRUE_FALSE',
  'SHORT_TEXT',
  'NUMERIC',
  'MATCHING',
  'ORDERING',
  'ESSAY',
] as const;
export type QType = (typeof QUESTION_TYPES)[number];

/** Types whose options live in the Answer table. */
export const CHOICE_TYPES: QType[] = ['SINGLE', 'MULTIPLE'];

export interface ShortTextConfig {
  accepted: string[];
  caseSensitive?: boolean;
}
export interface NumericConfig {
  value: number;
  tolerance: number;
}
export interface MatchingConfig {
  pairs: { left: string; right: string }[];
}
export interface OrderingConfig {
  items: string[];
}
export interface TrueFalseConfig {
  correct: boolean;
}
export interface EssayConfig {
  maxWords?: number;
  rubric?: string;
}

export interface QuestionLike {
  id: number;
  type: string;
  text: string;
  points: number;
  partialCredit: boolean;
  config: unknown;
  answers: { id: number; text: string; isCorrect: boolean }[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Default config for a freshly created question of `type`. */
export function defaultConfig(type: QType): Obj | null {
  switch (type) {
    case 'TRUE_FALSE':
      return { correct: true };
    case 'SHORT_TEXT':
      return { accepted: [], caseSensitive: false };
    case 'NUMERIC':
      return { value: 0, tolerance: 0 };
    case 'MATCHING':
      return { pairs: [] };
    case 'ORDERING':
      return { items: [] };
    case 'ESSAY':
      return { maxWords: null, rubric: '' };
    default:
      return null;
  }
}

/** Validates and normalises a teacher-supplied config; throws 400 on bad input. */
export function normalizeConfig(type: QType, config: unknown): Obj | null {
  if (CHOICE_TYPES.includes(type)) return null;
  const c: Obj = isObj(config) ? config : {};
  const bad = (msg: string) => {
    throw new BadRequestException(`Invalid ${type} config: ${msg}`);
  };
  switch (type) {
    case 'TRUE_FALSE':
      return { correct: c.correct !== false };
    case 'SHORT_TEXT': {
      const accepted = Array.isArray(c.accepted)
        ? [...new Set(c.accepted.map(str).filter(Boolean))]
        : [];
      if (accepted.some((a) => a.length > 500)) bad('answer too long');
      return { accepted, caseSensitive: c.caseSensitive === true };
    }
    case 'NUMERIC': {
      const value = Number(c.value ?? 0);
      const tolerance = Math.abs(Number(c.tolerance ?? 0));
      if (!Number.isFinite(value) || !Number.isFinite(tolerance))
        bad('value and tolerance must be numbers');
      return { value, tolerance };
    }
    case 'MATCHING': {
      const pairs = Array.isArray(c.pairs)
        ? c.pairs
            .filter(isObj)
            .map((p) => ({ left: str(p.left), right: str(p.right) }))
        : [];
      if (pairs.length > 20) bad('at most 20 pairs');
      return { pairs };
    }
    case 'ORDERING': {
      const items = Array.isArray(c.items) ? c.items.map(str) : [];
      if (items.length > 20) bad('at most 20 items');
      return { items };
    }
    case 'ESSAY': {
      const max = Number(c.maxWords);
      return {
        maxWords: Number.isInteger(max) && max > 0 ? max : null,
        rubric: str(c.rubric).slice(0, 2000),
      };
    }
  }
  return null;
}

function cfg<T>(q: QuestionLike): T {
  return (
    isObj(q.config) ? q.config : (defaultConfig(q.type as QType) ?? {})
  ) as T;
}

/**
 * Why a question can't be answered yet, or null when it is complete:
 * choice questions need ≥2 options and a correct one, matching/ordering ≥2
 * filled entries, short text ≥1 accepted answer, numeric a finite value.
 */
export type QuestionProblem =
  | 'noText'
  | 'fewOptions'
  | 'noCorrect'
  | 'noAccepted'
  | 'noValue'
  | 'fewPairs'
  | 'fewItems';

export function questionProblem(q: QuestionLike): QuestionProblem | null {
  if (!q.text?.trim()) return 'noText';
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE':
      if (q.answers.filter((a) => a.text?.trim()).length < 2)
        return 'fewOptions';
      return q.answers.some((a) => a.isCorrect) ? null : 'noCorrect';
    case 'SHORT_TEXT':
      return cfg<ShortTextConfig>(q).accepted?.length > 0 ? null : 'noAccepted';
    case 'NUMERIC':
      return Number.isFinite(Number(cfg<NumericConfig>(q).value))
        ? null
        : 'noValue';
    case 'MATCHING':
      return (cfg<MatchingConfig>(q).pairs ?? []).filter(
        (p) => p.left && p.right,
      ).length >= 2
        ? null
        : 'fewPairs';
    case 'ORDERING':
      return (cfg<OrderingConfig>(q).items ?? []).filter(Boolean).length >= 2
        ? null
        : 'fewItems';
    default:
      return null;
  }
}

/** A question can be put into an attempt only when it has something to answer. */
export function isPlayable(q: QuestionLike): boolean {
  return questionProblem(q) === null;
}

/** Number of options to shuffle for an attempt (answer ids / matching rights / ordering items). */
export function optionKeys(q: QuestionLike): number[] {
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE':
      return q.answers.map((a) => a.id);
    case 'MATCHING':
      return cfg<MatchingConfig>(q).pairs.map((_, i) => i);
    case 'ORDERING':
      return cfg<OrderingConfig>(q).items.map((_, i) => i);
    default:
      return [];
  }
}

/** What the student sees for a question — never contains the key. */
export function studentView(q: QuestionLike, optionOrder: number[] | null) {
  const base = { id: q.id, text: q.text, type: q.type, points: q.points };
  const order = optionOrder ?? optionKeys(q);
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE': {
      const byId = new Map(q.answers.map((a) => [a.id, a]));
      return {
        ...base,
        answers: order
          .map((id) => byId.get(id))
          .filter((a): a is QuestionLike['answers'][number] => !!a)
          .map((a) => ({ id: a.id, text: a.text })),
      };
    }
    case 'MATCHING': {
      const pairs = cfg<MatchingConfig>(q).pairs;
      return {
        ...base,
        answers: [],
        left: pairs.map((p, i) => ({ id: i, text: p.left })),
        right: order
          .filter((i) => pairs[i])
          .map((i) => ({ id: i, text: pairs[i].right })),
      };
    }
    case 'ORDERING': {
      const items = cfg<OrderingConfig>(q).items;
      return {
        ...base,
        answers: [],
        items: order
          .filter((i) => i in items)
          .map((i) => ({ id: i, text: items[i] })),
      };
    }
    case 'ESSAY':
      return {
        ...base,
        answers: [],
        maxWords: cfg<EssayConfig>(q).maxWords ?? null,
      };
    default:
      return { ...base, answers: [] };
  }
}

/** Parses a raw response for `q`; throws 400 when the shape is wrong. Empty → null. */
export function parseResponse(q: QuestionLike, raw: unknown): Obj | null {
  if (raw === undefined || raw === null) return null;
  const bad = (msg: string) => {
    throw new BadRequestException(`Question ${q.id}: ${msg}`);
  };
  const r: Obj = Array.isArray(raw)
    ? { answerIds: raw }
    : isObj(raw)
      ? raw
      : {};
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE': {
      const ids = r.answerIds;
      if (!Array.isArray(ids) || !ids.every((v) => Number.isInteger(v)))
        bad('answerIds must be an array of ids');
      const unique = [...new Set(ids as number[])];
      const allowed = new Set(q.answers.map((a) => a.id));
      if (unique.some((id) => !allowed.has(id)))
        bad('answer does not belong to the question');
      if (q.type === 'SINGLE' && unique.length > 1)
        bad('accepts a single answer');
      return unique.length ? { answerIds: unique } : null;
    }
    case 'TRUE_FALSE':
      if (typeof r.value !== 'boolean') bad('value must be true or false');
      return { value: r.value };
    case 'SHORT_TEXT':
    case 'ESSAY': {
      if (typeof r.text !== 'string') bad('text must be a string');
      const text = (r.text as string).slice(
        0,
        q.type === 'ESSAY' ? 20000 : 500,
      );
      return text.trim() ? { text } : null;
    }
    case 'NUMERIC': {
      const value =
        typeof r.value === 'string'
          ? Number(r.value.replace(',', '.'))
          : r.value;
      if (typeof value !== 'number' || !Number.isFinite(value))
        bad('value must be a number');
      return { value };
    }
    case 'MATCHING': {
      const pairs = cfg<MatchingConfig>(q).pairs;
      if (!isObj(r.pairs)) bad('pairs must be an object');
      const out: Record<string, number> = {};
      for (const [left, right] of Object.entries(r.pairs as Obj)) {
        const l = Number(left);
        if (!Number.isInteger(l) || !pairs[l]) bad('unknown left item');
        if (right === null || right === undefined || right === '') continue;
        if (!Number.isInteger(right) || !pairs[right as number])
          bad('unknown right item');
        out[l] = right as number;
      }
      return Object.keys(out).length ? { pairs: out } : null;
    }
    case 'ORDERING': {
      const items = cfg<OrderingConfig>(q).items;
      const order = r.order;
      if (
        !Array.isArray(order) ||
        order.length !== items.length ||
        new Set(order).size !== items.length ||
        !order.every((i) => Number.isInteger(i) && i >= 0 && i < items.length)
      )
        bad('order must be a permutation of the items');
      return { order };
    }
  }
  return null;
}

const normText = (s: string, caseSensitive: boolean) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return caseSensitive ? t : t.toLocaleLowerCase('uk');
};

export interface Scored {
  /** Earned points (may be fractional with partial credit). */
  earned: number;
  status: 'AUTO' | 'PENDING';
}

/** Scores one response. ESSAY is left PENDING for staff. */
export function scoreQuestion(q: QuestionLike, response: Obj | null): Scored {
  const pts = q.points;
  if (q.type === 'ESSAY') {
    return { earned: 0, status: response ? 'PENDING' : 'AUTO' };
  }
  if (!response) return { earned: 0, status: 'AUTO' };
  const full = (ok: boolean): Scored => ({
    earned: ok ? pts : 0,
    status: 'AUTO',
  });

  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE': {
      const picked = new Set(response.answerIds as number[]);
      const correct = q.answers.filter((a) => a.isCorrect).map((a) => a.id);
      const right = correct.filter((id) => picked.has(id)).length;
      const wrong = picked.size - right;
      if (q.type === 'MULTIPLE' && q.partialCredit && correct.length) {
        const fraction = Math.max(0, (right - wrong) / correct.length);
        return { earned: round2(fraction * pts), status: 'AUTO' };
      }
      return full(right === correct.length && wrong === 0);
    }
    case 'TRUE_FALSE':
      return full(response.value === cfg<TrueFalseConfig>(q).correct);
    case 'SHORT_TEXT': {
      const c = cfg<ShortTextConfig>(q);
      const given = normText(String(response.text), !!c.caseSensitive);
      return full(
        c.accepted.some((a) => normText(a, !!c.caseSensitive) === given),
      );
    }
    case 'NUMERIC': {
      const c = cfg<NumericConfig>(q);
      return full(
        Math.abs(Number(response.value) - c.value) <= c.tolerance + 1e-9,
      );
    }
    case 'MATCHING': {
      const pairs = cfg<MatchingConfig>(q).pairs;
      const chosen = response.pairs as Record<string, number>;
      // A right item may repeat text; compare texts so duplicates count as right.
      const ok = pairs.filter((p, i) => {
        const r = chosen[i];
        return r !== undefined && pairs[r]?.right === p.right;
      }).length;
      return {
        earned: round2((ok / Math.max(pairs.length, 1)) * pts),
        status: 'AUTO',
      };
    }
    case 'ORDERING': {
      const order = response.order as number[];
      const items = cfg<OrderingConfig>(q).items;
      const inPlace = order.filter(
        (itemIndex, pos) => items[itemIndex] === items[pos],
      ).length;
      if (q.partialCredit) {
        return {
          earned: round2((inPlace / Math.max(items.length, 1)) * pts),
          status: 'AUTO',
        };
      }
      return full(inPlace === items.length);
    }
  }
  return { earned: 0, status: 'AUTO' };
}

/** The answer key in a student-readable form (shown only when allowed). */
export function correctSolution(q: QuestionLike): Obj | null {
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE':
      return {
        answerIds: q.answers.filter((a) => a.isCorrect).map((a) => a.id),
      };
    case 'TRUE_FALSE':
      return { value: cfg<TrueFalseConfig>(q).correct };
    case 'SHORT_TEXT':
      return { accepted: cfg<ShortTextConfig>(q).accepted };
    case 'NUMERIC': {
      const c = cfg<NumericConfig>(q);
      return { value: c.value, tolerance: c.tolerance };
    }
    case 'MATCHING':
      return { pairs: cfg<MatchingConfig>(q).pairs };
    case 'ORDERING':
      return { items: cfg<OrderingConfig>(q).items };
    case 'ESSAY': {
      const rubric = cfg<EssayConfig>(q).rubric;
      return rubric ? { rubric } : null;
    }
  }
  return null;
}

/** The student's response rendered with texts (for the review page). */
export function describeResponse(
  q: QuestionLike,
  response: Obj | null,
): Obj | null {
  if (!response) return null;
  switch (q.type) {
    case 'MATCHING': {
      const pairs = cfg<MatchingConfig>(q).pairs;
      const chosen = response.pairs as Record<string, number>;
      return {
        pairs: pairs.map((p, i) => ({
          left: p.left,
          right:
            chosen[i] !== undefined ? (pairs[chosen[i]]?.right ?? null) : null,
        })),
      };
    }
    case 'ORDERING': {
      const items = cfg<OrderingConfig>(q).items;
      return { items: (response.order as number[]).map((i) => items[i]) };
    }
    default:
      return response;
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentage of earned points, rounded to an integer. */
export function percent(earned: number, total: number): number {
  return total > 0 ? Math.round((earned / total) * 100) : 0;
}
