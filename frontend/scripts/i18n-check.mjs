// Verifies that every locale has exactly the keys of the Ukrainian source files.
// Usage: npm run i18n:check
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../src/messages/', import.meta.url).pathname;
const locales = ['uk', 'en', 'pl'];
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

let problems = 0;
for (const file of readdirSync(join(dir, 'uk')).filter((f) => f.endsWith('.json'))) {
  const source = new Set(flatten(JSON.parse(readFileSync(join(dir, 'uk', file), 'utf8'))));
  for (const locale of locales.slice(1)) {
    let other;
    try {
      other = new Set(flatten(JSON.parse(readFileSync(join(dir, locale, file), 'utf8'))));
    } catch (err) {
      console.error(`✗ ${locale}/${file}: ${err.message}`);
      problems++;
      continue;
    }
    const missing = [...source].filter((k) => !other.has(k));
    const extra = [...other].filter((k) => !source.has(k));
    for (const k of missing) console.error(`✗ ${locale}/${file}: missing ${k}`);
    for (const k of extra) console.error(`✗ ${locale}/${file}: extra ${k}`);
    problems += missing.length + extra.length;
  }
}
if (problems) {
  console.error(`\n${problems} problem(s)`);
  process.exit(1);
}
console.log('i18n: all locales match the Ukrainian keys');
