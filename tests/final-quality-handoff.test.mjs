import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function exportedMembers(js, globalName) {
  const start = js.indexOf(`global.${globalName} = Object.freeze({`);
  assert.notEqual(start, -1, `${globalName} must be exported`);
  const open = js.indexOf('{', js.indexOf('Object.freeze(', start));
  let depth = 0;
  let end = open;
  for (let i = open; i < js.length; i += 1) {
    if (js[i] === '{') depth += 1;
    else if (js[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  return js.slice(open + 1, end).split(',').map((part) => part.split(':')[0].trim()).filter(Boolean);
}

// The Production Execution screen hands a ready-for-QC batch to Final Quality by calling
// openForExecution on this export. It previously checked for that method, did not find it, and told
// the user to refresh — advice that could never help, because the method was never exported.
// Asserting on the export list rather than on the presence of the name somewhere in the file is the
// difference between testing the wiring and testing that a word appears in a source file.
test('Final Quality exports the handoff the Production Execution screen calls', async () => {
  const js = await source('public/modules/final-quality.js');
  const members = exportedMembers(js, 'SynthaFinalQualityWorkspace');

  assert.ok(members.includes('openForExecution'), `exported members were: ${members.join(', ')}`);
  assert.match(js, /function openForExecution\(/);
});

test('the handoff opens the Final Quality view and carries the execution code across', async () => {
  const js = await source('public/modules/final-quality.js');
  const body = js.slice(js.indexOf('function openForExecution('));

  assert.match(body, /ui\.executionCode = code/, 'the code must be carried over, not retyped');
  assert.match(body, /state\.view = 'final-quality'/, 'the handoff must switch to the Final Quality view');
  assert.match(body, /renderApp\(\)/, 'the view must be re-rendered');
});

test('Production Execution still calls that exact handoff', async () => {
  const js = await source('public/modules/production-executions.js');
  assert.match(js, /workspace\.openForExecution\(value\.executionCode\)/);
});
