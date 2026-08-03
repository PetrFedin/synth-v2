import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflows = Object.freeze({
  verify: await readFile(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8'),
  postgres: await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
});

for (const [name, workflow] of Object.entries(workflows)) {
  test(`${name} workflow pins every external action to a full immutable SHA`, () => {
    const uses = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map(match => match[1]);
    assert.ok(uses.length >= 2);
    for (const action of uses) {
      assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/);
      assert.doesNotMatch(action, /@(main|master|v\d+)/);
    }
  });

  test(`${name} workflow is read-only and does not execute privileged fork code`, () => {
    assert.match(workflow, /^permissions:\n\s+contents:\s+read$/m);
    assert.doesNotMatch(workflow, /pull_request_target/);
    assert.match(workflow, /persist-credentials:\s+false/);
    assert.doesNotMatch(workflow, /permissions:\s+write|contents:\s+write|id-token:\s+write/);
  });

  test(`${name} workflow bounds duplicate and runaway executions`, () => {
    assert.match(workflow, /cancel-in-progress:\s+true/);
    assert.match(workflow, /timeout-minutes:\s+15/);
    assert.match(workflow, /npm run verify/);
    assert.match(workflow, /NPM_CONFIG_IGNORE_SCRIPTS:\s+"true"/);
  });

  test(`${name} workflow installs only from the immutable lockfile`, () => {
    assert.match(workflow, /cache:\s+npm/);
    assert.match(workflow, /cache-dependency-path:\s+package-lock\.json/);
    assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
    assert.doesNotMatch(workflow, /npm install/);
  });
}

test('PostgreSQL integration workflow runs against a healthy isolated database', () => {
  const workflow = workflows.postgres;
  assert.match(workflow, /services:\n\s+postgres:/);
  assert.match(workflow, /POSTGRES_TEST_URL:/);
  assert.match(workflow, /pg_isready -U syntha -d syntha_v2_test/);
  assert.match(workflow, /--health-retries 12/);
});
