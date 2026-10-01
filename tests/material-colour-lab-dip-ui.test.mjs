import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { LAB_DIP_STATUSES } from '../src/modules/material-colours/public.mjs';

const root = process.cwd();

// docs/omnidata-screens-gap-analysis.md, п.26: the lab dip write side (add a colour to a material's
// palette; request, submit, decide, cancel a lab dip) was fully built in the domain/service/HTTP
// layers from the start, but no form in materials.js ever called any of the five material-colour
// mutation endpoints — the palette tab was read-only. This test confirms the wiring landed and that
// the decision verdicts offered in the UI are exactly the ones the domain treats as real verdicts
// (not 'submitted'/'requested', which decideLabDip refuses, and not 'cancelled', which has its own
// dedicated endpoint and UI action).
test('the material palette finally wires colour and lab dip mutations into the UI', async () => {
  const materials = await readFile(path.join(root, 'public/modules/materials.js'), 'utf8');
  for (const fragment of [
    "api('/v2/libraries/colour.colour/entries?limit=200')",
    "await mutate('/v2/material-colours'",
    "await mutate('/v2/lab-dips'",
    '/submit`, { expectedVersion: dip.version }',
    '/decide`,',
    '/cancel`,',
  ]) {
    assert.ok(materials.includes(fragment), `missing: ${fragment}`);
  }

  const verdictMatch = materials.match(/selectDef\('verdict',[\s\S]*?\[([\s\S]*?)\]\)/);
  assert.ok(verdictMatch, "verdict select('verdict', …) not found");
  const offeredVerdicts = [...verdictMatch[1].matchAll(/id: '([a-z_]+)'/g)].map(([, value]) => value);
  assert.ok(offeredVerdicts.length >= 3, 'the decide form must offer a real choice');
  for (const verdict of offeredVerdicts) {
    assert.ok(LAB_DIP_STATUSES.includes(verdict), `the decide form offers ${verdict}, which is not a known lab dip status`);
  }
  // a decision is not a submission or a request (the domain's own decideLabDip invariant), and
  // cancellation has its own endpoint/button — decide must not duplicate it.
  for (const excluded of ['submitted', 'requested', 'cancelled']) {
    assert.ok(!offeredVerdicts.includes(excluded), `${excluded} must not be offered as a decide verdict`);
  }
});
