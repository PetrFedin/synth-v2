import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';
import { createCommercialPublicationRoutes } from '../src/http/commercial-publication-routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, 'public', 'modules', file), 'utf8');

// Каждая новая кнопка (O-02, O-04, O-05, O-10) обязана иметь обработчик, проверку способности,
// маршрут и тело с `expectedVersion`/ожидаемой последней версией. Idempotency-Key ставит общий
// транспорт `api()` на любую мутацию, поэтому формы идут через `mutate`, а не через голый fetch.

const noop = new Proxy({}, { get: () => () => ({}) });
const wholesaleRoutes = createWholesaleRoutes({ platform: noop, catalog: noop, partners: noop, collaboration: noop, orders: noop, notifications: noop, workspace: noop });
const publicationRoutes = createCommercialPublicationRoutes({ commercialPublication: noop });

test('the transport still stamps an Idempotency-Key on every mutation, so forms reuse mutate()', async () => {
  const api = await read('api.js');
  assert.match(api, /if \(!anonymous && mutation\) headers\['idempotency-key'\] = crypto\.randomUUID\(\);/);
});

test('showroom close: button in both showroom surfaces, gated by SHOWROOM_MANAGE, confirmed, versioned, backed by a route', async () => {
  for (const file of ['omnidata-workspace.js', 'views-3.js']) {
    const source = await read(file);
    assert.match(source, /item\.status === 'open' && caps\.hasForOrganisation\(state\.workspace, item\.brandId, caps\.CAPABILITIES\.SHOWROOM_MANAGE\)\) actions\.push\(actionButton\([^\n]*\/v2\/showrooms\/\$\{encodeURIComponent\(item\.id\)\}\/close`, \{ expectedVersion: item\.version \}\), 'danger'/, `${file}: close showroom`);
  }
  assert.ok(matchWholesaleRoute(wholesaleRoutes, 'POST', '/v2/showrooms/s1/close'));
});

test('order cancel is offered for draft, ready and attached orders in every order surface', async () => {
  for (const file of ['omnidata-workspace.js', 'views-4.js', 'order-lifecycle-actions.js']) {
    const source = await read(file);
    assert.match(source, /\['draft', 'ready', 'attached'\]\.includes\(item\.status\) && canWrite && orderCancellationOffered\(item\)/, `${file}: cancel for draft/ready/attached, hidden once DealSpace is open`);
    assert.doesNotMatch(source, /item\.status === 'attached' && canWrite\) (?:\{\s*)?actions\.push\([^\n]*(?:Cancel order|Отменить заказ)/, `${file}: the attached-only cancel is gone`);
  }
  const forms = await read('forms-3.js');
  assert.match(forms, /function orderCancellationForm\(order\) \{[\s\S]*?expectedVersion: order\.version,[\s\S]*?\}\)\);/);
});

test('cycle close: a reason form with expectedVersion, offered only before confirmation and without an attached order', async () => {
  const forms = await read('forms-3.js');
  assert.match(forms, /function cycleCloseForm\(cycle\) \{[\s\S]*?\/v2\/cycles\/\$\{encodeURIComponent\(cycle\.id\)\}\/close`, \{\s*expectedVersion: cycle\.version,\s*reason: validation\.requiredText/);
  assert.match(forms, /window\.cycleCloseForm = cycleCloseForm;/);
  const actions = await read('order-lifecycle-actions.js');
  assert.match(actions, /const closable = index >= 0 && index < STAGES\.indexOf\('confirmation'\) && item\.order\?\.status !== 'attached';/);
  assert.match(actions, /if \(canAdvance && closable && typeof window\.cycleCloseForm === 'function'\) \{[\s\S]*?window\.cycleCloseForm\(item\), 'danger'/);
  assert.ok(matchWholesaleRoute(wholesaleRoutes, 'POST', '/v2/cycles/c1/close'));
});

test('closed cycles are not counted as open ones', async () => {
  assert.match(await read('overview.js'), /workspaceMetric\('cycles', x => x\.stage !== 'deal-space' && x\.stage !== 'closed'\)/);
  const workspace = await read('omnidata-workspace.js');
  assert.equal((workspace.match(/item\.stage !== 'deal-space' && item\.stage !== 'closed'/g) || []).length, 2);
  assert.doesNotMatch(workspace, /item\.stage !== 'deal-space'(?! &&)/);
});

test('buyer catalogue rollback: history is read first, the displayed latest version is the optimistic guard, the route exists', async () => {
  const source = await read('commercial-publication-actions.js');
  assert.match(source, /\/v2\/showrooms\/\$\{encodeURIComponent\(showroom\.id\)\}\/buyer-catalog-versions\?shopId=/);
  assert.match(source, /\/v2\/buyer-catalog-versions\/\$\{encodeURIComponent\(values\.buyerCatalogVersionId\)\}\/rollback`, \{\s*expectedLatestBuyerCatalogVersionId: latest\.id,/);
  assert.match(source, /caps\.hasForOrganisation\(state\.workspace, showroom\.brandId, caps\.CAPABILITIES\.SHOWROOM_MANAGE\)/);
  assert.match(source, /publicationForm, buyerCatalogForm, rollbackForm, rollbackAction,/);
  assert.match(await read('omnidata-workspace.js'), /commercial\?\.rollbackAction \? commercial\.rollbackAction\(item\) : null/);
  assert.ok(publicationRoutes.some((route) => route.method === 'POST' && route.pattern.test('/v2/buyer-catalog-versions/v1/rollback')));
  assert.ok(publicationRoutes.some((route) => route.method === 'GET' && route.pattern.test('/v2/showrooms/s1/buyer-catalog-versions')));
});

test('every new domain error code the screens can meet has a Russian message', async () => {
  const messages = await read('error-messages.js');
  for (const code of [
    'ORDER_NOT_CANCELLABLE', 'ORDER_AMENDMENT_STALE', 'ORDER_AMENDMENT_MOQ_NOT_MET', 'ORDER_AMENDMENT_EXECUTION_STARTED', 'ORDER_AMENDMENT_DOOR_ALLOCATION_CONFLICT',
    'CYCLE_CLOSED', 'CYCLE_ALREADY_CLOSED', 'CYCLE_CLOSE_STAGE_INVALID', 'CYCLE_CLOSE_ORDER_ATTACHED', 'CYCLE_CLOSE_REASON_REQUIRED',
    'SHOWROOM_WINDOW_NOT_STARTED', 'SHOWROOM_WINDOW_ELAPSED', 'BUYER_CATALOG_ROLLBACK_STALE', 'BUYER_CATALOG_ROLLBACK_TARGET_CURRENT', 'BUYER_CATALOG_ROLLBACK_NO_CHANGE',
  ]) assert.match(messages, new RegExp(`\\b${code}:`), code);
});

test('the amendments dialog tells the person that accepting now changes the order', async () => {
  const source = await read('order-fulfillment-view.js');
  assert.match(source, /Принятая правка сразу меняет количество строки и итог заказа/);
  assert.match(source, /An accepted amendment changes the line quantity and the order total at once/);
});
