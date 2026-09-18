import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('V18 KPI runtime hardening validator passes repository invariants', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-kpi-runtime-hardening.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /KPI runtime hardening OK/);
});
