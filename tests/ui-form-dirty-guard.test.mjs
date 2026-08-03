import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/modules/open-form.js', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../public/modules/i18n-runtime.js', import.meta.url), 'utf8');

test('forms guard dirty and in-flight state across close escape and browser navigation', () => {
  assert.match(source, /const baseline = snapshot\(\)/);
  assert.match(source, /const isDirty = \(\) => snapshot\(\) !== baseline/);
  assert.match(source, /const shouldBlockNavigation = \(\) => !saved && \(submitting \|\| isDirty\(\)\)/);
  assert.match(source, /window\.addEventListener\('beforeunload', beforeUnload\)/);
  assert.match(source, /dialog\.addEventListener\('cancel', cancelDialog\)/);
  assert.match(source, /window\.confirm\(I18N\.t\('common\.unsavedChangesConfirm'\)\)/);
  assert.match(source, /if \(submitting\) return false/);
});

test('form lifecycle removes global listeners and distinguishes mutation success from refresh failure', () => {
  assert.match(source, /window\.removeEventListener\('beforeunload', beforeUnload\)/);
  assert.match(source, /dialog\.removeEventListener\('cancel', cancelDialog\)/);
  assert.match(source, /dialog\.addEventListener\('close', cleanup, \{ once: true \}\)/);
  assert.match(source, /await submitAction\(values\);\s*saved = true;\s*dialog\.close\(\)/s);
  assert.match(source, /common\.savedRefreshFailed/);
  assert.match(source, /if \(submit\.isConnected\) setButtonBusy/);
  assert.match(i18n, /common\.unsavedChangesConfirm/);
  assert.match(i18n, /common\.savedRefreshFailed/);
});
