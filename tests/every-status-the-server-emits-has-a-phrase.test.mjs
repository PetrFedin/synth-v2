import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

// Найдено на экране реестра моделей: в колонке «Проверка» одна строка говорила `blocked`
// по-английски, а соседние — «готов». `statusLabel` ищет фразу по ключу `status.<значение>` и, не
// найдя, отдаёт значение как есть — то есть сырое слово из базы.
//
// Валидатор языка этого не ловил и не мог: он знает про фразы, но не про то, какие значения
// служба вообще умеет отдавать. Спросить об этом надо сам домен — он их перечисляет.

const RUNTIME = path.join(root, 'public/modules/i18n-runtime.js');

async function phrasedStatuses() {
  const source = await readFile(RUNTIME, 'utf8');
  const block = source.slice(source.indexOf('const statuses'), source.indexOf('const stages'));
  const keys = [...block.matchAll(/(?:^|[\s{,])'?([A-Za-z_][A-Za-z0-9_-]*)'?\s*:\s*\[/gm)].map(([, key]) => key);
  return { keys, set: new Set(keys) };
}

// Перечисления статусов, которые домен объявляет сам. Файлы читаются с диска, а не перечисляются
// руками: новое перечисление попадёт под проверку без правки теста.
async function domainStatusEnums() {
  const modules = path.join(root, 'src/modules');
  const found = new Map();
  for (const name of await readdir(modules)) {
    const file = path.join(modules, name, 'public.mjs');
    let source;
    try { source = await readFile(file, 'utf8'); } catch { continue; }
    for (const [, constant, body] of source.matchAll(/export const ([A-Z][A-Z0-9_]*STATUSES) = Object\.freeze\(\[([\s\S]*?)\]\)/g)) {
      const values = [...body.matchAll(/'([a-z][a-z0-9_-]*)'/g)].map(([, value]) => value);
      if (values.length) found.set(`${name}/${constant}`, values);
    }
  }
  return found;
}

test('the runtime names a phrase for every status a domain enum can emit', async () => {
  const { set } = await phrasedStatuses();
  const enums = await domainStatusEnums();
  assert.ok(enums.size >= 10, `the sweep must find the enums, found ${enums.size}`);

  const missing = [];
  for (const [where, values] of enums) {
    for (const value of values) if (!set.has(value)) missing.push(`${value} (${where})`);
  }
  assert.deepEqual(missing, [], `these statuses would reach the reader in English:\n${missing.join('\n')}`);
});

test('the readiness dimension states are phrased too', async () => {
  // Состояния измерений живут не в перечислении статусов, а в самой оценке — но читает их тот же
  // `statusLabel`, и именно на них дефект и вышел наружу.
  const { set } = await phrasedStatuses();
  for (const state of ['ready', 'blocked', 'not_applicable']) {
    assert.equal(set.has(state), true, `a readiness dimension state without a phrase: ${state}`);
  }
});

test('no status is declared twice, because the second one silently wins', async () => {
  const { keys } = await phrasedStatuses();
  const seen = new Set();
  const twice = keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
  assert.deepEqual(twice, [], `a duplicated status key hides whichever line came first: ${twice.join(', ')}`);
});

test('every phrase has both languages and neither is the bare code', async () => {
  const source = await readFile(RUNTIME, 'utf8');
  const block = source.slice(source.indexOf('const statuses'), source.indexOf('const stages'));
  for (const [, key, ru, en] of block.matchAll(/'?([A-Za-z_][A-Za-z0-9_-]*)'?\s*:\s*\['([^']*)'\s*,\s*'([^']*)'\]/g)) {
    assert.notEqual(ru.trim(), '', `${key} has no Russian phrase`);
    assert.notEqual(en.trim(), '', `${key} has no English phrase`);
    // Русская фраза, равная коду, — это не перевод, а тот же код другими глазами.
    assert.notEqual(ru, key, `${key} is phrased in Russian as its own code`);
  }
});
