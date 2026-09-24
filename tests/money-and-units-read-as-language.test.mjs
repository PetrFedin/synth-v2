import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

// Аудит насчитал «более 250 точек» сломанного форматирования. Перемерено: машинерия была в
// порядке — `Intl` с локалью, — а сломано было другое и меньшее числом, зато конкретное:
// валюта печаталась кодом рядом с числом («4,10 EUR» вместо «4,10 €»), единицы печатались
// латинским кодом («100 m» вместо «100 м»), и шесть модулей держали по своему форматтеру денег
// с двумя разными договорённостями о копейках.

async function runtime() {
  const source = await readFile(path.join(root, 'public/modules/i18n-runtime.js'), 'utf8');
  const v7 = await readFile(path.join(root, 'public/modules/i18n-v7.js'), 'utf8');
  return { source, v7 };
}

test('money and units are formatted in one place, not in six', async () => {
  const { source } = await runtime();
  assert.match(source, /function formatMoney\(value, currency, \{ minor = false/);
  assert.match(source, /function formatUnit\(value, unit/);

  // Ни один экран не держит собственного денежного форматтера: два разных решения о копейках —
  // это возможность показать сумму в сто раз больше, и единственный способ её не иметь, это не
  // иметь шести форматтеров.
  const modules = await readFile(path.join(root, 'public/modules/dom-2.js'), 'utf8');
  assert.match(modules, /function money\(value,currency,options\)\{return I18N\.formatMoney/);
  for (const file of ['bom.js', 'linesheets.js', 'sourcing.js', 'supplier-portal.js', 'production-orders.js', 'tech-packs.js']) {
    const text = await readFile(path.join(root, 'public/modules', file), 'utf8');
    assert.doesNotMatch(text, /style: ?'currency'/, `${file} must not format money on its own`);
    assert.match(text, /I18N\.formatMoney\(/, `${file} must format money through the runtime`);
  }
});

test('the curated i18n surface declares the new formatters, or they vanish without a word', async () => {
  // Найдено живьём: `i18n-v7.js` переэкспортирует поверхность поимённо, поэтому добавленное в базу
  // и не названное там просто исчезает — без ошибки, без следа. Экран продолжал показывать старое.
  const { v7 } = await runtime();
  assert.match(v7, /formatMoney: base\.formatMoney/);
  assert.match(v7, /formatUnit: base\.formatUnit/);
});

test('no screen appends a bare currency code next to a number any more', async () => {
  const files = ['forms-3.js', 'catalog.js', 'materials.js', 'omnidata-workspace.js', 'views-4.js'];
  for (const file of files) {
    const text = await readFile(path.join(root, 'public/modules', file), 'utf8');
    assert.doesNotMatch(
      text,
      /\$\{money\([^}]*\)\} \$\{[A-Za-z_.?[\]]*[Cc]urrency[A-Za-z_.?[\]]*\}/,
      `${file} still prints a currency code beside the amount`,
    );
  }
});

test('no screen prints a raw unit code beside a quantity any more', async () => {
  for (const file of ['materials.js', 'measurements.js', 'tech-packs.js']) {
    const text = await readFile(path.join(root, 'public/modules', file), 'utf8');
    assert.doesNotMatch(
      text,
      /\$\{[A-Za-z_.?[\]()]*\} ?\$\{[A-Za-z_.?[\]]*\.unit\}/,
      `${file} still prints a unit code beside the number`,
    );
    assert.match(text, /unitAmount\(/, `${file} must format quantities with their unit`);
  }
});

test('an unknown currency or unit degrades to something readable instead of disappearing', async () => {
  const { source } = await runtime();
  // Неизвестный код валюты допечатывается как есть, а не теряется вместе с суммой.
  assert.match(source, /return code \? `\$\{number\} \$\{code\}` : number;/);
  // Неизвестная единица остаётся кодом рядом с числом — это хуже перевода, но лучше пустоты.
  assert.match(source, /: \(typeof unit === 'string' \? unit\.trim\(\) : ''\)/);
  // Не-число остаётся прочерком, а не «NaN».
  assert.match(source, /if \(!Number\.isFinite\(raw\)\) return '\\u2014';/);
});

// Продолжение той же находки, найденное живым обходом экрана планирования: в одной строке таблицы
// стояло «-10.7 п.п.» рядом с «56,0 %» и «99,00 EUR». Разделитель ставил не язык читателя, а
// `toFixed`, который всегда пишет точку, — либо `replace('.', ',')`, который всегда пишет запятую
// и потому неверен в английском интерфейсе. Восемь таких мест в шести модулях.
//
// Правило простое: число, которое читает человек, печатает слой чисел. Проверяется оно по всему
// клиенту сразу, потому что в прошлый раз правку сделали для процентов и пропустили значок
// отклонения в той же таблице.
test('no screen formats a number for the reader with toFixed or a hardcoded separator', async () => {
  const { readdir } = await import('node:fs/promises');
  const dir = path.join(root, 'public/modules');
  const offenders = [];
  for (const name of (await readdir(dir)).filter((file) => file.endsWith('.js'))) {
    const source = await readFile(path.join(dir, name), 'utf8');
    source.split('\n').forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\.toFixed\(/.test(code)) offenders.push(`${name}:${index + 1} toFixed`);
      // Замена разделителя вручную — тот же дефект с другой стороны: она верна ровно в одном языке.
      if (/replace\(\s*['"]\.['"]\s*,\s*['"],['"]\s*\)/.test(code)) offenders.push(`${name}:${index + 1} replace('.', ',')`);
    });
  }
  assert.deepEqual(offenders, [], `numbers must go through I18N.formatNumber:\n${offenders.join('\n')}`);
});

test('the percentage-point unit is translated like every other unit', async () => {
  const planning = await readFile(path.join(root, 'public/modules/planning.js'), 'utf8');
  // «п.п.» — русское сокращение, и английскому читателю оно ничего не говорит.
  // Модуль держит кириллицу escape-последовательностями, поэтому и ищется она в обоих видах:
  // проверять надо факт, а не способ записи файла.
  assert.match(planning, /text\('(п\.п\.|\\u043f\.\\u043f\.)', 'pp'\)/);
  // И печатается оно в одном месте: значок отклонения и карточка сезона берут один формат.
  assert.equal((planning.match(/text\('(п\.п\.|\\u043f\.\\u043f\.)', 'pp'\)/g) ?? []).length, 1);
  assert.match(planning, /rawText: signedPoints\(variance\)/);
});
