import ExcelJS from 'exceljs';
import type {
  GradebookCell,
  GradebookColumn,
  GradebookRow,
  GradebookStats,
} from './gradebook.compute';

export interface ExportData {
  course: {
    title: string;
    testsWeight: number;
    assignmentsWeight: number;
    gradePassThreshold: number;
    gradingScale?: string;
  };
  columns: GradebookColumn[];
  rows: GradebookRow[];
  stats: GradebookStats;
}

/** Export texts per interface language (the file follows the teacher's UI). */
const TEXT = {
  uk: {
    submitted: 'здано, не перевірено',
    returned: 'на доопрацюванні',
    late: 'прострочено',
    test: 'Тест',
    assignment: 'Завдання',
    max: 'макс.',
    sheet: 'Журнал',
    summary: 'Підсумки',
    student: 'Студент',
    tests: 'Тести, %',
    assignments: 'Завдання, %',
    final: 'Підсумок, %',
    passed: 'Зараховано',
    progress: 'Прогрес, %',
    yes: 'так',
    no: 'ні',
    course: 'Курс',
    date: 'Дата експорту',
    students: 'Студентів',
    avgFinal: 'Середній підсумок',
    passRate: 'Частка тих, хто склав',
    testsWeight: 'Вага тестів',
    assignmentsWeight: 'Вага завдань',
    threshold: 'Поріг зарахування',
    item: 'Елемент',
    itemStats: 'Середнє / здали',
    intl: 'uk-UA',
    scaleGrade: 'Оцінка за шкалою',
    five: {
      '5': 'відмінно',
      '4': 'добре',
      '3': 'задовільно',
      '2': 'незадовільно',
    },
    pass: 'зараховано',
    fail: 'не зараховано',
    overridden: 'Змінено вручну',
    legend: '* — оцінку змінено вручну',
  },
  en: {
    submitted: 'submitted, not graded',
    returned: 'returned for revision',
    late: 'overdue',
    test: 'Test',
    assignment: 'Assignment',
    max: 'max',
    sheet: 'Gradebook',
    summary: 'Summary',
    student: 'Student',
    tests: 'Tests, %',
    assignments: 'Assignments, %',
    final: 'Final, %',
    passed: 'Passed',
    progress: 'Progress, %',
    yes: 'yes',
    no: 'no',
    course: 'Course',
    date: 'Export date',
    students: 'Students',
    avgFinal: 'Average final',
    passRate: 'Pass rate',
    testsWeight: 'Tests weight',
    assignmentsWeight: 'Assignments weight',
    threshold: 'Pass threshold',
    item: 'Item',
    itemStats: 'Average / submitted',
    intl: 'en-GB',
    scaleGrade: 'Scale grade',
    five: {
      '5': 'excellent',
      '4': 'good',
      '3': 'satisfactory',
      '2': 'unsatisfactory',
    },
    pass: 'pass',
    fail: 'fail',
    overridden: 'Changed manually',
    legend: '* — grade changed manually',
  },
  pl: {
    submitted: 'oddane, niesprawdzone',
    returned: 'do poprawy',
    late: 'po terminie',
    test: 'Test',
    assignment: 'Zadanie',
    max: 'maks.',
    sheet: 'Dziennik',
    summary: 'Podsumowanie',
    student: 'Student',
    tests: 'Testy, %',
    assignments: 'Zadania, %',
    final: 'Ocena końcowa, %',
    passed: 'Zaliczono',
    progress: 'Postęp, %',
    yes: 'tak',
    no: 'nie',
    course: 'Kurs',
    date: 'Data eksportu',
    students: 'Studentów',
    avgFinal: 'Średnia końcowa',
    passRate: 'Odsetek zaliczeń',
    testsWeight: 'Waga testów',
    assignmentsWeight: 'Waga zadań',
    threshold: 'Próg zaliczenia',
    item: 'Element',
    itemStats: 'Średnia / oddało',
    intl: 'pl-PL',
    scaleGrade: 'Ocena w skali',
    five: {
      '5': 'bardzo dobry',
      '4': 'dobry',
      '3': 'dostateczny',
      '2': 'niedostateczny',
    },
    pass: 'zaliczone',
    fail: 'niezaliczone',
    overridden: 'Zmieniono ręcznie',
    legend: '* — ocena zmieniona ręcznie',
  },
} as const;

export type ExportLang = keyof typeof TEXT;
type Text = (typeof TEXT)[ExportLang];

export function exportLang(value: unknown): ExportLang {
  return value === 'en' || value === 'pl' ? value : 'uk';
}

function stateText(tx: Text, state: string): string {
  return state === 'submitted' || state === 'returned' || state === 'late'
    ? tx[state]
    : '';
}

function header(tx: Text, c: GradebookColumn) {
  const kind = c.kind === 'test' ? tx.test : tx.assignment;
  return `${c.sectionTitle}: ${kind} «${c.title}» (${c.kind === 'test' ? '%' : `${tx.max} ${c.max}`})`;
}

/** Cell as a number (graded) or a short status text. */
function cellValue(
  tx: Text,
  c: GradebookColumn,
  cell: GradebookCell,
): number | string {
  if (cell.state === 'graded' && cell.value !== null) {
    return c.kind === 'test' ? cell.value / 100 : cell.value;
  }
  return stateText(tx, cell.state);
}

function headers(tx: Text, data: ExportData): string[] {
  return [
    tx.student,
    'Email',
    ...data.columns.map((c) => header(tx, c)),
    tx.tests,
    tx.assignments,
    tx.final,
    tx.scaleGrade,
    tx.passed,
    tx.progress,
  ];
}

/** «5 (відмінно)», «A», «зараховано», «85%» — the final grade on the course scale. */
export function scaleText(
  tx: Text,
  scale: string | undefined,
  code: string | undefined,
): string {
  if (!code) return '';
  if (scale === 'FIVE_POINT') {
    const word = (tx.five as Record<string, string>)[code];
    return word ? `${code} (${word})` : code;
  }
  if (scale === 'PASS_FAIL') return code === 'PASS' ? tx.pass : tx.fail;
  if (scale === 'ECTS') return code;
  return `${code}%`;
}

function overrideNote(tx: Text, o: { reason: string; by: string }) {
  return `${tx.overridden}: ${o.reason}${o.by ? ` (${o.by})` : ''}`;
}

export async function gradebookXlsx(
  data: ExportData,
  lang: ExportLang = 'uk',
): Promise<Buffer> {
  const tx = TEXT[lang];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LMS';
  wb.created = new Date();

  const ws = wb.addWorksheet(tx.sheet, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });
  const head_ = headers(tx, data);
  ws.addRow(head_);
  for (const r of data.rows) {
    ws.addRow([
      r.name,
      r.email,
      ...data.columns.map((c) => cellValue(tx, c, r.cells[c.key])),
      r.testsAvg === null ? '' : r.testsAvg / 100,
      r.assignmentsAvg === null ? '' : r.assignmentsAvg / 100,
      r.final === null ? '' : r.final / 100,
      scaleText(tx, data.course.gradingScale, r.scaleGrade?.code),
      r.passed ? tx.yes : tx.no,
      r.progress / 100,
    ]);
  }

  // Manually changed values: italic + a note with the reason.
  const finalCol = 3 + data.columns.length + 2;
  data.rows.forEach((r, ri) => {
    const row = ws.getRow(ri + 2);
    data.columns.forEach((c, ci) => {
      const o = r.cells[c.key]?.overridden;
      if (!o) return;
      const cell = row.getCell(3 + ci);
      cell.font = { italic: true };
      cell.note = overrideNote(tx, o);
    });
    if (r.finalOverridden) {
      const cell = row.getCell(finalCol);
      cell.font = { italic: true };
      cell.note = overrideNote(tx, r.finalOverridden);
    }
  });

  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 48;
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: head_.length },
  };

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 28;
  data.columns.forEach((c, i) => {
    const col = ws.getColumn(3 + i);
    col.width = 18;
    if (c.kind === 'test') col.numFmt = '0%';
  });
  const first = 3 + data.columns.length;
  for (let i = 0; i < 6; i++) {
    const col = ws.getColumn(first + i);
    col.width = i === 3 ? 18 : 14;
    if (i !== 3 && i !== 4) col.numFmt = '0.0%';
  }

  const summary = wb.addWorksheet(tx.summary);
  summary.columns = [{ width: 46 }, { width: 22 }];
  const pct = (v: number | null) => (v === null ? '—' : v / 100);
  const rows: [string, string | number][] = [
    [tx.course, data.course.title],
    [tx.date, new Date().toLocaleDateString(tx.intl)],
    [tx.students, data.stats.studentsCount],
    [tx.avgFinal, pct(data.stats.avgFinal)],
    [tx.passRate, pct(data.stats.passRate)],
    [tx.testsWeight, data.course.testsWeight / 100],
    [tx.assignmentsWeight, data.course.assignmentsWeight / 100],
    [tx.threshold, data.course.gradePassThreshold / 100],
  ];
  for (const [k, v] of rows) {
    const row = summary.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    if (typeof v === 'number' && k !== tx.students)
      row.getCell(2).numFmt = '0.0%';
  }
  summary.addRow([]);
  const sub = summary.addRow([tx.item, tx.itemStats]);
  sub.font = { bold: true };
  for (const c of data.columns) {
    const s = data.stats.perColumn[c.key];
    const avg =
      s?.avg === null || s?.avg === undefined
        ? '—'
        : c.kind === 'test'
          ? `${s.avg}%`
          : `${s.avg} / ${c.max}`;
    summary.addRow([header(tx, c), `${avg} · ${s?.submitted ?? 0}`]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvNumber(n: number): string {
  return String(n).replace('.', ',');
}

function csvField(v: string | number): string {
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with BOM and ";" — opens correctly in Excel with a Ukrainian locale. */
export function gradebookCsv(
  data: ExportData,
  lang: ExportLang = 'uk',
): Buffer {
  const tx = TEXT[lang];
  const lines: string[] = [];
  lines.push(headers(tx, data).map(csvField).join(';'));
  for (const r of data.rows) {
    const cells = data.columns.map((c) => {
      const cell = r.cells[c.key];
      if (cell.overridden && cell.value !== null) {
        return `${csvNumber(cell.value)}*`;
      }
      return cell.state === 'graded' && cell.value !== null
        ? cell.value
        : stateText(tx, cell.state);
    });
    lines.push(
      [
        r.name,
        r.email,
        ...cells,
        r.testsAvg ?? '',
        r.assignmentsAvg ?? '',
        r.final === null
          ? ''
          : r.finalOverridden
            ? `${csvNumber(r.final)}*`
            : r.final,
        scaleText(tx, data.course.gradingScale, r.scaleGrade?.code),
        r.passed ? tx.yes : tx.no,
        r.progress,
      ]
        .map(csvField)
        .join(';'),
    );
  }
  if (
    data.rows.some(
      (r) =>
        r.finalOverridden || Object.values(r.cells).some((c) => c.overridden),
    )
  ) {
    lines.push('');
    lines.push(csvField(tx.legend));
  }
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}
