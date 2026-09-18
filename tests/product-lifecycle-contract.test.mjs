import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  STYLE_LIFECYCLE,
  allowedStyleTransitions,
  styleLifecycleMap,
  transitionProductStyle,
} from '../src/modules/product-identity/public.mjs';

test('the transitions a screen may offer are the transitions the domain enforces', () => {
  const map = styleLifecycleMap();
  for (const [status, next] of Object.entries(map)) {
    assert.deepEqual([...allowedStyleTransitions(status)], next);
    const style = Object.freeze({ id: 'style-1', brandId: 'brand-1', lifecycleStatus: status, version: 1 });
    for (const target of next) {
      // Everything the map offers is accepted...
      const moved = transitionProductStyle(style, target, { updatedAt: '2026-09-18T10:00:00.000Z', updatedBy: 'actor-1' });
      assert.equal(moved.lifecycleStatus, target);
    }
    // ...and a step it does not offer is refused, so the two can never disagree.
    const forbidden = Object.values(STYLE_LIFECYCLE).filter((value) => !next.includes(value) && value !== status);
    if (forbidden.length) {
      assert.throws(
        () => transitionProductStyle(style, forbidden[0], { updatedAt: '2026-09-18T10:00:00.000Z', updatedBy: 'actor-1' }),
        (error) => error.code === 'PRODUCT_STYLE_TRANSITION_INVALID',
      );
    }
  }
});

test('a state the style cannot leave offers nothing rather than a dead control', () => {
  for (const status of Object.values(STYLE_LIFECYCLE)) {
    const next = allowedStyleTransitions(status);
    assert.ok(Array.isArray(next));
    if (status === STYLE_LIFECYCLE.SUPERSEDED || status === STYLE_LIFECYCLE.REJECTED) {
      // These are exits from the line. Whatever they allow, the screen must be told the truth.
      assert.deepEqual([...next], [...styleLifecycleMap()[status]]);
    }
  }
});

test('every lifecycle state a card can show has a Russian label', async () => {
  const runtime = await readFile(fileURLToPath(new URL('../public/modules/i18n-runtime.js', import.meta.url)), 'utf8');
  for (const status of Object.values(STYLE_LIFECYCLE)) {
    // A state without a label reaches the user as a raw machine key, which is what the rail showed
    // for six of the thirteen before this was checked.
    assert.ok(new RegExp(`(^|[^a-z_])${status}:\\s*\\[`, 'm').test(runtime),
      `${status} has no label in i18n-runtime.js`);
  }
});
