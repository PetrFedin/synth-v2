import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Диалоги спецификации и обмерной таблицы написаны руками, а не через <dialog>, поэтому Escape
// вешается на `document` — и снимать его обязан каждый путь закрытия, а не только сам Escape.
// Раньше крестик, «Отмена», щелчок мимо и успешное сохранение оставляли слушателя на документе, и
// каждое открытие редактора добавляло ещё одного, вместе со ссылкой на оторванный диалог.
const root = process.cwd();
const editors = [
  { file: 'public/modules/bom.js', overlay: 'bom-modal-overlay' },
  { file: 'public/modules/measurements.js', overlay: 'measurement-modal-overlay' },
];

for (const editor of editors) {
  test(`${editor.file} detaches the Escape listener on every close path`, async () => {
    const source = await readFile(path.join(root, editor.file), 'utf8');
    assert.match(source, /function closeEditor\(\) \{ overlay\.remove\(\); document\.removeEventListener\('keydown', onEscape\); \}/);
    assert.match(source, /document\.addEventListener\('keydown', onEscape\)/);
    // Единственное место, где оверлей снимается, — сама `closeEditor`; любой другой вызов означал бы
    // путь закрытия, который снова оставит слушателя.
    assert.equal(source.split('overlay.remove()').length - 1, 1);
    // И каждый путь ведёт именно в неё: крестик, «Отмена», щелчок мимо, сохранение, Escape — плюс само
    // объявление. Порог, а не точное число: новый законный путь закрытия не должен ронять этот тест.
    assert.ok(source.split('closeEditor()').length - 1 >= 6, 'все пути закрытия идут через closeEditor');
  });
}
