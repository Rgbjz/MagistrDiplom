/**
 * GIFT (Moodle) import/export for the question bank — the supported subset:
 *   multiple choice  {=right ~wrong}              → SINGLE
 *   weighted choice  {~%50%a ~%50%b ~%-100%c}     → MULTIPLE (partial credit)
 *   true/false       {T} {TRUE} {F} {FALSE}       → TRUE_FALSE
 *   short answer     {=answer =other}             → SHORT_TEXT
 *   numeric          {#3.14:0.01} {#1..5} {#7}    → NUMERIC
 *   matching         {=left -> right ...}         → MATCHING
 *   essay            {}                           → ESSAY
 * Supported syntax: `::title::`, `// comments`, `$CATEGORY: a/b`, `#feedback`
 * (ignored), escapes \: \~ \= \# \{ \}, `[html]`/`[markdown]` markers, and
 * "missing word" questions (text after the answer block). ORDERING has no GIFT
 * form and is skipped on export.
 */

export interface GiftQuestion {
  type:
    | 'SINGLE'
    | 'MULTIPLE'
    | 'TRUE_FALSE'
    | 'SHORT_TEXT'
    | 'NUMERIC'
    | 'MATCHING'
    | 'ESSAY';
  text: string;
  category: string | null;
  partialCredit: boolean;
  config: Record<string, unknown> | null;
  answers: { text: string; isCorrect: boolean }[];
}

export interface GiftSkip {
  line: number;
  reason: string;
  text: string;
}

const ESC = /\\([:~=#{}\\n])/g;
const unescape = (s: string) =>
  s.replace(ESC, (_, c: string) => (c === 'n' ? '\n' : c));

/** Index of the first unescaped `ch` in `s` at or after `from`, or -1. */
function findUnescaped(s: string, ch: string, from = 0): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === ch) return i;
  }
  return -1;
}

/** Splits an answer body into tokens that start with an unescaped `=` or `~`. */
function tokens(body: string): { mark: '=' | '~'; text: string }[] {
  const out: { mark: '=' | '~'; text: string }[] = [];
  let cur: { mark: '=' | '~'; text: string } | null = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) {
      if (cur) cur.text += c + body[i + 1];
      i++;
      continue;
    }
    if (c === '=' || c === '~') {
      if (cur) out.push(cur);
      cur = { mark: c, text: '' };
      continue;
    }
    if (cur) cur.text += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** Strips `#feedback` and returns [text, weight%|null]. */
function cleanAnswer(raw: string): { text: string; weight: number | null } {
  let s = raw;
  const hash = findUnescaped(s, '#');
  if (hash >= 0) s = s.slice(0, hash);
  let weight: number | null = null;
  const m = /^\s*%(-?\d+(?:\.\d+)?)%/.exec(s);
  if (m) {
    weight = Number(m[1]);
    s = s.slice(m[0].length);
  }
  return { text: unescape(s).trim(), weight };
}

function stripMarkers(s: string): string {
  return s.replace(/^\s*\[(html|markdown|plain|moodle)\]/i, '').trim();
}

function parseBlock(
  block: string,
  category: string | null,
): GiftQuestion | string {
  let src = block.trim();
  // ::title::
  if (src.startsWith('::')) {
    const end = src.indexOf('::', 2);
    if (end > 0) src = src.slice(end + 2).trim();
  }
  const open = findUnescaped(src, '{');
  if (open < 0) return 'no answer block {…}';
  const close = findUnescaped(src, '}', open + 1);
  if (close < 0) return 'unclosed answer block';
  const before = stripMarkers(unescape(src.slice(0, open)).trim());
  const after = unescape(src.slice(close + 1)).trim();
  const text = after ? `${before} _____ ${after}`.trim() : before;
  if (!text) return 'empty question text';
  const body = src.slice(open + 1, close).trim();
  const base = {
    text,
    category,
    partialCredit: false,
    answers: [] as GiftQuestion['answers'],
  };

  if (body === '')
    return { ...base, type: 'ESSAY', config: { maxWords: null, rubric: '' } };

  const tf = /^(T|F|TRUE|FALSE)\s*(#.*)?$/is.exec(body);
  if (tf) {
    return {
      ...base,
      type: 'TRUE_FALSE',
      config: { correct: tf[1].toUpperCase().startsWith('T') },
    };
  }

  if (body.startsWith('#')) {
    let num = body.slice(1).trim();
    if (num.startsWith('=')) num = tokens(num)[0]?.text ?? '';
    num = cleanAnswer(num).text;
    let value: number;
    let tolerance = 0;
    const range = /^(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/.exec(num);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      // Round away binary noise (3.13..3.15 → 3.14 ± 0.01).
      value = Number(((lo + hi) / 2).toPrecision(12));
      tolerance = Number((Math.abs(hi - lo) / 2).toPrecision(12));
    } else {
      const [v, t] = num.split(':');
      value = Number(v);
      tolerance = t !== undefined ? Math.abs(Number(t)) : 0;
    }
    if (!Number.isFinite(value) || !Number.isFinite(tolerance))
      return 'bad numeric answer';
    return { ...base, type: 'NUMERIC', config: { value, tolerance } };
  }

  const toks = tokens(body);
  if (!toks.length) return 'unsupported answer format';

  if (
    toks.every((t) => t.mark === '=') &&
    toks.some((t) => t.text.includes('->'))
  ) {
    const pairs = toks.map((t) => {
      const [l, r] = cleanAnswer(t.text).text.split('->');
      return { left: (l ?? '').trim(), right: (r ?? '').trim() };
    });
    if (pairs.length < 2 || pairs.some((p) => !p.right))
      return 'matching needs ≥ 2 pairs';
    return {
      ...base,
      type: 'MATCHING',
      config: { pairs },
      partialCredit: true,
    };
  }

  if (toks.every((t) => t.mark === '=')) {
    const accepted = toks.map((t) => cleanAnswer(t.text).text).filter(Boolean);
    if (!accepted.length) return 'no accepted answers';
    return {
      ...base,
      type: 'SHORT_TEXT',
      config: { accepted, caseSensitive: false },
    };
  }

  const answers = toks.map((t) => {
    const { text: a, weight } = cleanAnswer(t.text);
    return {
      text: a,
      isCorrect: t.mark === '=' || (weight !== null && weight > 0),
      weight,
    };
  });
  if (answers.some((a) => !a.text)) return 'empty answer option';
  const correct = answers.filter((a) => a.isCorrect).length;
  if (!correct) return 'no correct option';
  const weighted = answers.some((a) => a.weight !== null);
  const multiple =
    correct > 1 ||
    (weighted &&
      answers.some((a) => (a.weight ?? 0) > 0 && (a.weight ?? 0) < 100));
  return {
    ...base,
    type: multiple ? 'MULTIPLE' : 'SINGLE',
    partialCredit: multiple && weighted,
    config: null,
    answers: answers.map(({ text: a, isCorrect }) => ({ text: a, isCorrect })),
  };
}

export function parseGift(source: string): {
  questions: GiftQuestion[];
  skipped: GiftSkip[];
} {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const questions: GiftQuestion[] = [];
  const skipped: GiftSkip[] = [];
  let category: string | null = null;
  let block: string[] = [];
  let blockLine = 0;

  const flush = () => {
    const text = block.join('\n').trim();
    if (text) {
      const parsed = parseBlock(text, category);
      if (typeof parsed === 'string') {
        skipped.push({
          line: blockLine,
          reason: parsed,
          text: text.slice(0, 120),
        });
      } else {
        questions.push(parsed);
      }
    }
    block = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*\/\//.test(line)) return;
    const cat = /^\s*\$CATEGORY:\s*(.+)$/i.exec(line);
    if (cat) {
      flush();
      const parts = cat[1]
        .trim()
        .replace(/^\$(course|system)\$\/?/i, '')
        .split('/')
        .filter(Boolean);
      category = parts[parts.length - 1]?.trim() || null;
      return;
    }
    if (!line.trim()) {
      flush();
      return;
    }
    if (!block.length) blockLine = i + 1;
    block.push(line);
  });
  flush();
  return { questions, skipped };
}

// ---------------------------------------------------------------- export

const escapeGift = (s: string) =>
  s.replace(/([:~=#{}\\])/g, '\\$1').replace(/\n/g, '\\n');

export interface ExportQuestion {
  id: number;
  type: string;
  text: string;
  partialCredit: boolean;
  config: unknown;
  answers: { text: string; isCorrect: boolean }[];
}

function body(q: ExportQuestion): string | null {
  const c = (q.config ?? {}) as Record<string, unknown>;
  switch (q.type) {
    case 'SINGLE':
      return q.answers
        .map((a) => `${a.isCorrect ? '=' : '~'}${escapeGift(a.text)}`)
        .join(' ');
    case 'MULTIPLE': {
      const k = q.answers.filter((a) => a.isCorrect).length || 1;
      const w = Number((100 / k).toFixed(5));
      return q.answers
        .map((a) => `~%${a.isCorrect ? w : -100}%${escapeGift(a.text)}`)
        .join(' ');
    }
    case 'TRUE_FALSE':
      return c.correct === false ? 'F' : 'T';
    case 'SHORT_TEXT':
      return ((c.accepted as string[]) ?? [])
        .map((a) => `=${escapeGift(a)}`)
        .join(' ');
    case 'NUMERIC':
      return `#${Number(c.value ?? 0)}:${Number(c.tolerance ?? 0)}`;
    case 'MATCHING':
      return ((c.pairs as { left: string; right: string }[]) ?? [])
        .map((p) => `=${escapeGift(p.left)} -> ${escapeGift(p.right)}`)
        .join(' ');
    case 'ESSAY':
      return '';
    default:
      return null;
  }
}

export function exportGift(
  categories: { name: string; questions: ExportQuestion[] }[],
): { text: string; skipped: number } {
  const out: string[] = [
    '// Exported from LMS question bank (GIFT format)',
    '',
  ];
  let skipped = 0;
  for (const cat of categories) {
    out.push(`$CATEGORY: ${cat.name}`, '');
    for (const q of cat.questions) {
      const b = body(q);
      if (b === null) {
        skipped++;
        out.push(
          `// ${q.type} question is not supported by GIFT: ${q.text.replace(/\n/g, ' ')}`,
          '',
        );
        continue;
      }
      out.push(`::Q${q.id}:: ${escapeGift(q.text)} {${b}}`, '');
    }
  }
  return { text: out.join('\n'), skipped };
}
