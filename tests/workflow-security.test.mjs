import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');

test('verification workflow pins every external action to a full immutable SHA', () => {
  const uses = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map(match => match[1]);
  assert.ok(uses.length >= 2);
  for (const action of uses) {
    assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/);
    assert.doesNotMatch(action, /@(main|master|v\d+)/);
  }
});

test('verification workflow is read-only and does not execute privileged fork code', () => {
  assert.match(workflow, /^permissions:\n\s+contents:\s+read$/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /persist-credentials:\s+false/);
  assert.doesNotMatch(workflow, /permissions:\s+write|contents:\s+write|id-token:\s+write/);
});

test('verification workflow bounds duplicate and runaway executions', () => {
  assert.match(workflow, /cancel-in-progress:\s+true/);
  assert.match(workflow, /timeout-minutes:\s+15/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /NPM_CONFIG_IGNORE_SCRIPTS:\s+"true"/);
});
