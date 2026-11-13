/**
 * Analysis of a REAL A/B pilot: reads the CSV exported by
 * GET /api/courses/:id/adaptive/experiment/export and compares the ADAPTIVE
 * and CONTROL groups with the same statistics as the simulation.
 *
 *   npm run sim:analyze -- --input export.csv [--metric gain] [--metric post_score]
 */
import { readFileSync } from 'fs';
import { mulberry32 } from './prng';
import { compare, type Comparison } from './stats';

export interface ExportRow {
  [column: string]: string;
}

/** Parses the export (UTF-8 with BOM, comma-separated, CRLF). */
export function parseExport(text: string): ExportRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

/** Compares groups on numeric columns; rows with an empty value are skipped. */
export function analyzeExport(
  rows: ExportRow[],
  metrics: string[],
  seed = 1,
): Comparison[] {
  const rng = mulberry32(seed);
  const pick = (group: string, m: string) =>
    rows
      .filter((r) => r.group === group && r[m] !== '' && r[m] !== undefined)
      .map((r) => Number(r[m]))
      .filter(Number.isFinite);
  return metrics.map((m) =>
    compare(m, pick('ADAPTIVE', m), pick('CONTROL', m), rng),
  );
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const input = args[args.indexOf('--input') + 1];
  if (!input || args.indexOf('--input') < 0) {
    console.error(
      'Usage: npm run sim:analyze -- --input export.csv [--metric gain]',
    );
    process.exit(1);
  }
  const metrics = args.flatMap((a, i) =>
    a === '--metric' ? [args[i + 1]] : [],
  );
  const rows = parseExport(readFileSync(input, 'utf8'));
  const result = analyzeExport(
    rows,
    metrics.length
      ? metrics
      : ['gain', 'post_score', 'mean_mastery', 'lessons_completed_pct'],
  );
  for (const c of result) {
    console.log(
      `${c.metric}: ADAPTIVE ${c.meanA.toFixed(3)} (n=${c.nA}) vs CONTROL ${c.meanC.toFixed(3)} (n=${c.nC}); ` +
        `Δ=${c.diff.toFixed(3)}, d=${c.d.toFixed(2)} [${c.dLo.toFixed(2)}; ${c.dHi.toFixed(2)}], ` +
        `Welch p=${c.pWelch.toFixed(4)}, Mann–Whitney p=${c.pMW.toFixed(4)}`,
    );
  }
  if (result.some((c) => c.nA < 10 || c.nC < 10))
    console.log(
      'Note: fewer than 10 students in a group — treat the result as exploratory.',
    );
}
