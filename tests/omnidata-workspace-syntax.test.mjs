import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Omnidata workspace is valid classic browser JavaScript', async () => {
  const source = await readFile(new URL('../public/modules/omnidata-workspace.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /(?:\u00d0|\u00d1)[\u0080-\u00ff]/u);
});
