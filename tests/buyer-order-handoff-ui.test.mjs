import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handoff = await readFile(new URL('../public/modules/buyer-order-handoff.js', import.meta.url), 'utf8');
const forms = await readFile(new URL('../public/modules/forms-3.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const staticHandler = await readFile(new URL('../src/web/static-handler.mjs', import.meta.url), 'utf8');

test('buyer Linesheets keeps Selection -> Order -> Confirmation -> DealSpace in one workspace', () => {
  assert.doesNotThrow(() => new Function(handoff));
  for (const token of [
    "linesheets.mode !== 'buyer'",
    "context.selection.status === 'submitted'",
    "context.cycle.stage === 'order-builder'",
    "item.selectionId === selection.id",
    "global.orderForm(context.selection.id)",
    'global.odOrderActions(context.order)',
    'global.SynthaCommercialCycleActions.actionsFor({ ...context.cycle, order: context.order })',
    "text('Подборка', 'Selection')",
    "text('Заказ', 'Order')",
    "text('Подтверждение', 'Confirmation')",
    // The last step of the handoff is still named in the strip; it is now named in the reader's
    // language rather than as the English product word.
    "label: text('Пространство сделки', 'Deal space')",
  ]) assert.ok(handoff.includes(token), `Missing buyer order handoff contract: ${token}`);

  assert.doesNotMatch(handoff, /\.style\./);
  assert.doesNotMatch(handoff, /fetch\(|XMLHttpRequest|\/v2\/orders[^'"`]*['"`]/);
});

test('order creation can be opened from the exact submitted Selection', () => {
  assert.match(forms, /async function orderForm\(preferredSelectionId = ''\)/);
  assert.match(forms, /selections\.some\(selection => selection\.id === preferredSelectionId\)/);
  // The field is still the selection picker, preselected on the submitted selection; its label is now
  // localised and its options name the selection by a reference a person can read rather than by a
  // generated identifier.
  assert.match(forms, /selectDef\('selectionId', localText\([^)]*'Selection'\),[\s\S]*selectedSelectionId\)/);
  assert.match(forms, /objectReference\(selection\.id\)/);
});

test('buyer order and retail door browser assets are loaded and served by standalone runtime', () => {
  const matrixAsset = '/ui/linesheets.js?v=buyer-order-matrix-20260813-1';
  const handoffAsset = '/ui/buyer-order-handoff.js?v=buyer-order-handoff-20260819-1';
  assert.ok(html.includes(matrixAsset));
  assert.ok(html.includes(handoffAsset));
  assert.ok(html.indexOf(matrixAsset) < html.indexOf(handoffAsset), 'Buyer order handoff must load after Linesheets');

  for (const asset of [
    "'/ui/retail-doors.js': ['modules/retail-doors.js', JS, CACHE]",
    "'/ui/retail-door-ui-core.js': ['modules/retail-door-ui-core.js', JS, CACHE]",
    "'/ui/buyer-order-handoff.js': ['modules/buyer-order-handoff.js', JS, VISUAL_CACHE]",
  ]) assert.ok(staticHandler.includes(asset), `Standalone runtime does not serve ${asset}`);
});
