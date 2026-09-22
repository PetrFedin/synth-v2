import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

test('a refusal by rights is told in the reader’s language, not the server’s log voice', async () => {
  const api = await readFile(path.join(root, 'public/modules/api.js'), 'utf8');
  // Транспорт знал только 401: всё остальное приходило на экран как ошибка загрузки, то есть
  // «у вас нет прав» выглядело неотличимо от обрыва сети, и человек жал «обновить».
  assert.match(api, /const forbidden = response\.status === 403;/);
  assert.match(api, /forbidden\s*\?\s*I18N\.t\('common\.forbidden'\)/);
  assert.match(api, /if \(forbidden\) error\.forbidden = true;/);
  // Код и детали остаются на ошибке: по ним ветвятся вызывающие и по ним ищут в журнале.
  assert.match(api, /error\.code = code;/);
  assert.match(api, /error\.details = payload\.error\?\.details \|\| \{\};/);
});

test('a refusal is never retried', async () => {
  const api = await readFile(path.join(root, 'public/modules/api.js'), 'utf8');
  const retry = api.match(/function isRetryableTransportError[\s\S]*?\n\}/)[0];
  // Повтор ничего не изменит, пока роль та же. Повторяются только тайм-аут и обрыв.
  assert.match(retry, /REQUEST_TIMEOUT/);
  assert.match(retry, /TypeError/);
  assert.doesNotMatch(retry, /40\d/);
});

test('a section that is closed to your role does not look broken', async () => {
  const dom = await readFile(path.join(root, 'public/modules/dom-1.js'), 'utf8');
  assert.match(dom, /function isForbiddenText\(text\)/);
  assert.match(dom, /text === I18N\.t\('common\.forbidden'\)/);
  // Красная плашка предлагает повторить, а повторять нечего: отдельный вид говорит, что раздел
  // существует и закрыт, — это другая новость.
  assert.match(dom, /const kind = type === 'error' && isForbiddenText\(text\) \? 'denied' : type;/);

  const css = await readFile(path.join(root, 'public/omnidata-v14-role-system.css'), 'utf8');
  assert.match(css, /\.notice\.denied/);
});

test('both languages say what happened and what to do about it', async () => {
  const strings = await readFile(path.join(root, 'public/modules/i18n-runtime.js'), 'utf8');
  assert.match(strings, /'common\.forbidden':/);
  // Ни одна из фраз не предлагает «повторить попытку»: это не сбой.
  const forbidden = strings.match(/'common\.forbidden': \[([^\]]*)\]/)[1];
  assert.doesNotMatch(forbidden, /Try again|\\u041f\\u043e\\u0432\\u0442\\u043e\\u0440/);
});

test('the two sections that offer a retry do not offer it on a refusal', async () => {
  // Кнопка «Повторить» — то же самое неверное сообщение, только в виде действия: роль та же,
  // отказ вернётся. Эти два раздела — единственные, где кнопка вообще предлагается.
  const doors = await readFile(path.join(root, 'public/modules/retail-doors.js'), 'utf8');
  assert.match(doors, /const denied = isForbiddenText\(error\.message\);/);
  assert.match(doors, /if \(!denied\) \{/);
  // И сам текст отказа не префиксуется: «не удалось загрузить» — неправда.
  assert.match(doors, /denied\s*\n\s*\? error\.message/);

  const materials = await readFile(path.join(root, 'public/modules/materials.js'), 'utf8');
  assert.match(materials, /if \(!isForbiddenText\(materialState\.error\)\) \{/);
});

test('no screen keeps a refusal helper that nothing calls', async () => {
  // Аудит раз за разом находит написанное и недостижимое; эта правка не добавляет ещё одного
  // такого места. Раздел, закрытый правами целиком, сегодня узнаётся только по ответу сервера,
  // поэтому отдельного помощника «весь раздел закрыт» нет — есть один путь, и он живой.
  const dom = await readFile(path.join(root, 'public/modules/dom-1.js'), 'utf8');
  assert.doesNotMatch(dom, /deniedNotice/);
});
