import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const viewsSource = await readFile(new URL('../public/modules/views-4.js', import.meta.url), 'utf8');
const dialogSource = await readFile(new URL('../public/modules/open-form.js', import.meta.url), 'utf8');

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('Order economics action is capability-gated and requires immutable order commit basis', () => {
  const source = functionSource(viewsSource, 'function orderEntity(item)', '\nasync function orderEconomicsDialog(order)');
  assert.match(source, /hasForOrganisation\(state\.workspace, item\.brandId, caps\.CAPABILITIES\.MARGIN_READ\)/);
  assert.match(source, /item\.orderCommitSnapshotId && canReadMargin/);
  assert.match(source, /orderEconomicsDialog\(item\)/);
});

test('Order economics UI consumes server economics-position without reconstructing margin client-side', () => {
  const source = functionSource(viewsSource, 'async function orderEconomicsDialog(order)', '\nfunction economicsRow');
  assert.match(source, /\/v2\/orders\/\$\{encodeURIComponent\(order\.id\)\}\/economics-position/);
  assert.match(source, /position\.orderId !== order\.id/);
  assert.match(source, /position\.orderCommitSnapshotId !== order\.orderCommitSnapshotId/);
  assert.match(source, /position\.effectiveTotalLandedCost/);
  assert.match(source, /position\.effectiveContributionMarginAmount/);
  assert.match(source, /position\.effectiveContributionMarginPercent/);
  assert.match(source, /position\.cumulativePostCloseCostDelta/);
  assert.match(source, /position\.cumulativePostCloseMarginDelta/);
  assert.match(source, /openDetails/);
  assert.doesNotMatch(source, /totalAmount\s*-/);
  assert.doesNotMatch(source, /effectiveTotalLandedCost\s*-/);
  assert.doesNotMatch(source, /reload\(/);
  assert.doesNotMatch(source, /renderApp\(/);
});

test('Order economics labels switch explicitly between RU and EN', () => {
  const source = functionSource(viewsSource, 'function economicsText(ru, en)', '\nfunction economicsMoney');
  assert.match(source, /I18N\.getLocale\(\) === 'en' \? en : ru/);
});

test('read-only details dialog has no mutation submit or workspace refresh behavior', () => {
  const source = functionSource(dialogSource, 'function openDetails(title, rows)', '\n}');
  assert.match(source, /readOnly: true/);
  assert.doesNotMatch(source, /mutate\(/);
  assert.doesNotMatch(source, /reload\(/);
  assert.doesNotMatch(source, /renderApp\(/);
  assert.doesNotMatch(source, /type: 'submit'/);
});
