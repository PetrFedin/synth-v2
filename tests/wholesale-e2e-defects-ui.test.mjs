import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

// Приёмочный прогон оптовой цепочки: UI-дефекты C, D, E, K и серверный H. Каждый тест красный на старом коде.

const read = (file) => readFile(new URL(`../public/modules/${file}`, import.meta.url), 'utf8');

function load(file, context) {
  const sandbox = vm.createContext({ window: {}, ...context });
  new vm.Script(context.__source, { filename: file }).runInContext(sandbox);
  return sandbox;
}

test('C: the buyer catalogue form carries optional per-variant price fields and sends priceOverrides in minor units', async () => {
  const source = await read('commercial-publication-actions.js');
  assert.match(source, /priceOverrides/);
  assert.match(source, /kind: 'number',\s*required: false,/, 'price fields are optional');
  assert.match(source, /visibleWhen: publicationId => publicationId === publication\.id/, 'only the fields of the selected snapshot are shown');
  assert.match(source, /if \(overrides\.length\) body\.priceOverrides = overrides;/, 'no overrides, no field in the body');
  const sandbox = load('commercial-publication-actions.js', { __source: source, I18N: { getLocale: () => 'ru' } });
  const { priceOverridesFromValues } = sandbox.window.SynthaCommercialPublication;
  const fields = [
    { name: 'price:pub-1:psku-1', productSkuId: 'psku-1' },
    { name: 'price:pub-1:psku-2', productSkuId: 'psku-2' },
    { name: 'price:pub-1:psku-3', productSkuId: 'psku-3' },
    { name: 'price:pub-2:psku-9', productSkuId: 'psku-9' },
  ];
  const overrides = priceOverridesFromValues({ 'price:pub-1:psku-1': 110, 'price:pub-1:psku-2': null, 'price:pub-1:psku-3': 99.9, 'price:pub-2:psku-9': 5 }, 'pub-1', fields);
  assert.deepEqual(JSON.parse(JSON.stringify(overrides)), [{ productSkuId: 'psku-1', wholesalePriceMinor: 11000 }, { productSkuId: 'psku-3', wholesalePriceMinor: 9990 }]);
  assert.deepEqual(priceOverridesFromValues({}, 'pub-1', fields), [], 'blank fields mean the snapshot price');
  assert.throws(() => priceOverridesFromValues({ 'price:pub-1:psku-1': 10.123 }, 'pub-1', fields), /PRICE_LIST_OVERRIDE_PRICE_INVALID/);
});

test('C: the generic form supports conditionally shown optional number fields', async () => {
  const source = await read('open-form.js');
  assert.match(source, /typeof field\.visibleWhen === 'function'/);
  assert.match(source, /field\.kind === 'number' && field\.required === false && raw === ''/, 'an empty optional number is "not set", not zero');
  assert.match(source, /\.disabled = !visible/, 'a hidden field is disabled so it is neither validated nor sent');
});

test('D: the cancel button is hidden once DealSpace is open, for every order surface', async () => {
  const forms = await read('forms-3.js');
  const sandbox = load('forms-3.js', {
    __source: forms,
    state: { workspace: { cycles: [{ id: 'cycle-order', stage: 'order' }, { id: 'cycle-deal', stage: 'deal-space' }] } },
  });
  const offered = sandbox.window.orderCancellationOffered;
  assert.equal(offered({ status: 'attached', cycleId: 'cycle-order' }), true);
  assert.equal(offered({ status: 'attached', cycleId: 'cycle-deal' }), false, 'ORDER_CANCELLATION_STAGE_INVALID would follow');
  assert.equal(offered({ status: 'ready', cycleId: 'cycle-deal' }), true, 'a draft/ready order does not touch the cycle');
  assert.equal(offered({ status: 'attached', cycleId: 'unknown-cycle' }), true, 'an unknown cycle is not a reason to hide');
  for (const file of ['omnidata-workspace.js', 'views-4.js', 'order-lifecycle-actions.js']) {
    assert.match(await read(file), /\['draft', 'ready', 'attached'\]\.includes\(item\.status\) && canWrite && orderCancellationOffered\(item\)/, file);
  }
});

test('E: the order form defaults the retail door to the one of the selection', async () => {
  const core = vm.createContext({ window: {} });
  new vm.Script(await read('retail-door-ui-core.js'), { filename: 'retail-door-ui-core.js' }).runInContext(core);
  const ui = core.window.SynthaRetailDoorUi;
  const doors = { shop_1: [{ id: 'door_a', shopId: 'shop_1', status: 'active' }, { id: 'door_b', shopId: 'shop_1', status: 'active' }, { id: 'door_off', shopId: 'shop_1', status: 'inactive' }] };
  assert.equal(ui.defaultDoorIdForSelection({ id: 's', shopId: 'shop_1', retailDoorId: 'door_b' }, doors), 'door_b', 'not the first door of the shop');
  assert.equal(ui.defaultDoorIdForSelection({ id: 's', shopId: 'shop_1', retailDoorId: 'door_off' }, doors), '', 'an inactive door is not offered');
  assert.equal(ui.defaultDoorIdForSelection({ id: 's', shopId: 'shop_1' }, doors), '');
  assert.match(await read('forms-3.js'), /doorUi\.defaultDoorIdForSelection\(selections\.find\(selection => selection\.id === selectionId\), doorsByShop\)/);
  const openForm = await read('open-form.js');
  assert.match(openForm, /field\.valueFor\(parent\.value\)/);
  assert.match(openForm, /parentChanged/, 'a failed submit does not reset the person\'s choice');
});

test('K: the awaiting list labels an amendment by its order number and "Open" selects that order', async () => {
  // Заказ и подборка подписываются номером и выделяются по `route.entityId` уже в PR #224; здесь
  // остаётся правка: её идентификатор в реестре заказов не найти, поэтому выделяется её заказ.
  const source = await read('awaiting-action.js');
  assert.match(source, /item\.type === 'order-amendment-response' && item\.detail\?\.orderId/);
  assert.match(source, /\$\{objectReference\(item\.detail\.orderId\)\} · \$\{text\('строка', 'line'\)\} \$\{item\.detail\.lineNo\}/);
  // Выбор записи теперь — дело маршрута: сервер называет заказ правки в `route.parentId`, а экран заказов
  // (`view-refresh.js`) выделяет именно его, а не идентификатор самой правки.
  const refresh = await read('view-refresh.js');
  assert.match(refresh, /id: route\.parentId \|\| route\.entityId/);
  assert.match(refresh, /route\.dialog === 'amendments'/);
  assert.doesNotMatch(source, /targetEntityId|OD_UI\.selected\[target\.scope\]/, 'the screen no longer keeps its own selection table');
});

// --- H ----------------------------------------------------------------------------------------

function looksFixture({ buyerCatalog }) {
  const memory = createMemoryWholesaleStore();
  const showroom = { id: 'showroom-1', brandId: 'brand-1', collectionId: 'collection-1', status: 'open' };
  const catalogLook = {
    id: 'look-1', showroomId: 'showroom-1', position: 1,
    products: [
      { sku: 'SKU-A', wholesalePrice: 128, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 900, status: 'published' },
      { sku: 'SKU-OUT', wholesalePrice: 50, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10, status: 'published' },
    ],
  };
  const store = {
    ...memory,
    transaction: (work) => memory.transaction((tx) => work({
      ...tx,
      getShowroom: async () => showroom,
      getMembership: async (organisationId, actorId) => (organisationId === 'brand-1' && actorId === 'brand-user' ? { status: 'active' } : undefined),
      listMembershipsForActor: async (actorId) => (actorId === 'shop-user' ? [{ status: 'active', organisationId: 'shop-1' }] : []),
      getShowroomInvitationByAccess: async () => ({ status: 'accepted' }),
      getRelationshipByTrade: async () => ({ status: 'active' }),
      listShowroomLooks: async () => [catalogLook],
    })),
  };
  const asked = [];
  const commercialPublicationReader = {
    getBuyerCatalogVersion: async () => undefined,
    getBuyerCatalogForAccess: async (showroomId, shopId) => { asked.push([showroomId, shopId]); return buyerCatalog; },
  };
  return { service: createShowroomSelectionService({ store, commercialPublicationReader }), asked, catalogLook };
}

const buyerCatalog = Object.freeze({
  id: 'buyer-catalog-2', status: 'published',
  lines: [{ sku: 'SKU-A', unitPrice: 110, currency: 'EUR', minimumOrderQuantity: 6, availability: { mode: 'available_to_sell', quantity: 1000 } }],
});

test('H: a buyer sees the price, minimum and stock of their buyer catalogue version, not the collection catalogue', async () => {
  const { service, asked } = looksFixture({ buyerCatalog });
  const { items } = await service.listShowroomLooks('shop-user', 'showroom-1');
  const [first, second] = items[0].products;
  assert.equal(first.wholesalePrice, 110, 'the buyer-specific price, not 128');
  assert.equal(first.availableQuantity, 1000, 'the frozen availability, not 900');
  assert.equal(first.minimumOrderQuantity, 6);
  assert.equal(first.priceSource, 'buyer-catalog');
  assert.equal(first.buyerCatalogVersionId, 'buyer-catalog-2');
  assert.equal(second.wholesalePrice, 50, 'a piece missing from the buyer catalogue keeps the catalogue facts');
  assert.equal(second.priceSource, 'catalog');
  assert.deepEqual(asked, [['showroom-1', 'shop-1']]);
});

test('H: the brand keeps seeing the collection catalogue facts, and a buyer without a catalogue version is unchanged', async () => {
  const brand = looksFixture({ buyerCatalog });
  const { items } = await brand.service.listShowroomLooks('brand-user', 'showroom-1');
  assert.equal(items[0].products[0].wholesalePrice, 128);
  assert.deepEqual(brand.asked, [], 'the brand does not read a buyer catalogue');
  const none = looksFixture({ buyerCatalog: undefined });
  const unchanged = await none.service.listShowroomLooks('shop-user', 'showroom-1');
  assert.equal(unchanged.items[0].products[0].wholesalePrice, 128);
});
