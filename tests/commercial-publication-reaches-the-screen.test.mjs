import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'commercial-publication-actions.js'), 'utf8');

// Две коммерческие публикации существовали только как шаги скрипта: на сервере маршруты были, а в
// интерфейсе от них оставалось одно чтение. Здесь проверяется не наличие кнопки в исходнике, а её
// поведение — по праву, по состоянию сущности и с тем телом запроса, которое маршрут примет.

// Тело запроса рождается внутри песочницы, у него другой прототип, и строгое сравнение на нём
// спотыкается. Сравнивается то, что уйдёт на сервер, — то есть JSON.
function sent(mutations) { return JSON.parse(JSON.stringify(mutations)); }

function harness({ role = 'owner', invitations = [], reads = {} } = {}) {
  const calls = { forms: [], mutations: [], reads: [] };
  // В браузере `window` и есть глобальная область, и классические скрипты зовут `api`, `state`,
  // `openForm` по имени, а не через `window.`. Здесь то же: песочница сама себе `window`.
  const window = { Object, Map, Set, String, Array, Number, Promise, queueMicrotask, setTimeout, encodeURIComponent };
  window.window = window;
  window.I18N = { getLocale: () => 'ru' };
  window.odText = (ru) => ru;
  window.state = { view: 'showrooms', workspace: { invitations } };
  window.el = (tag, options) => ({ tag, ...options, append() {} });
  window.toast = (message, kind) => { calls.toast = { message, kind }; };
  window.formatDate = (value) => String(value ?? '');
  window.orgName = (id) => `Магазин ${id}`;
  window.selectDef = (name, label, options, format) => ({ name, label, options, format });
  window.actionButton = (label, fn) => ({ kind: 'button', label, fn });
  window.renderApp = () => { calls.rendered = true; };
  window.openForm = (title, fields, submit) => { calls.forms.push({ title, fields, submit }); };
  window.api = async (path) => { calls.reads.push(path); return reads[path.split('?')[0]] ?? { items: [] }; };
  window.mutate = async (path, body) => { calls.mutations.push({ path, body }); return {}; };
  window.SynthaUiCapabilities = {
    CAPABILITIES: { CATALOG_MANAGE: 'catalog.manage', SHOWROOM_MANAGE: 'showroom.manage' },
    hasForOrganisation: (workspace, organisationId, capability) => (role === 'owner'
      ? true
      : (role === 'sales' && capability === 'showroom.manage')),
  };
  vm.runInContext(source, vm.createContext(window));
  return { actions: window.SynthaCommercialPublication, calls };
}

const collection = { id: 'collection-1', brandId: 'brand-1', status: 'published' };
const showroom = { id: 'showroom-1', brandId: 'brand-1', collectionId: 'collection-1', status: 'open' };
const accepted = { showroomId: 'showroom-1', shopId: 'shop-1', status: 'accepted' };

test('a published collection offers publishing a commercial snapshot, a draft one does not', () => {
  const { actions } = harness();
  assert.equal(actions.collectionAction(collection)?.kind, 'button');
  assert.equal(actions.collectionAction({ ...collection, status: 'draft' }), null);
});

test('only the role that may publish sees the snapshot button', () => {
  const { actions } = harness({ role: 'viewer' });
  assert.equal(actions.collectionAction(collection), null);
});

test('the snapshot form posts the collection and the chosen projection', async () => {
  const { actions, calls } = harness({
    reads: {
      '/v2/collections/collection-1/publishable-projections': {
        items: [{ id: 'projection-1', styleCode: 'SYN.JKT', titleRu: 'Куртка', titleEn: 'Jacket', versionNo: 2 }],
      },
    },
  });
  await actions.publicationForm(collection);
  assert.equal(calls.forms.length, 1);
  const [field] = calls.forms[0].fields;
  assert.equal(field.name, 'commercialProjectionId');
  // Человек выбирает по коду модели, названию и версии — идентификатор ему ничего не говорит.
  assert.equal(field.format(field.options[0]), 'SYN.JKT · Куртка · v2');
  await calls.forms[0].submit({ commercialProjectionId: 'projection-1' });
  assert.deepEqual(sent(calls.mutations), [{
    path: '/v2/commercial-publications',
    body: { collectionId: 'collection-1', commercialProjectionId: 'projection-1' },
  }]);
});

test('with no published projection the form refuses instead of opening empty', async () => {
  const { actions, calls } = harness();
  await actions.publicationForm(collection);
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toast.kind, 'error');
  assert.match(calls.toast.message, /коммерческих проекций/);
});

test('the buyer catalogue action explains itself when it cannot be offered', () => {
  const closed = harness({ invitations: [accepted] });
  // Шоурум ещё не открыт — отсутствующая кнопка обязана сказать, чего не хватает.
  assert.match(closed.actions.accessAction({ ...showroom, status: 'draft' }).rawText, /откройте показ/);

  const uninvited = harness({ invitations: [{ ...accepted, status: 'pending' }] });
  assert.match(uninvited.actions.accessAction(showroom).rawText, /принявшему приглашение/);

  const ready = harness({ invitations: [accepted] });
  assert.equal(ready.actions.accessAction(showroom)?.kind, 'button');

  const stranger = harness({ role: 'viewer', invitations: [accepted] });
  assert.equal(stranger.actions.accessAction(showroom), null);
});

test('the buyer catalogue form posts the showroom and the invited shop', async () => {
  const { actions, calls } = harness({
    invitations: [accepted],
    reads: {
      '/v2/collections/collection-1/commercial-publications': {
        items: [
          { id: 'publication-1', status: 'published', publishedAt: '2026-09-23', lines: [{}, {}], styles: [{ titleRu: 'Куртка' }] },
          { id: 'publication-draft', status: 'draft', lines: [], styles: [] },
        ],
      },
    },
  });
  await actions.buyerCatalogForm(showroom);
  const [publicationField, shopField] = calls.forms[0].fields;
  // Неопубликованный снимок каталогом не станет, поэтому и в списке его нет.
  assert.deepEqual(publicationField.options.map(item => item.id), ['publication-1']);
  assert.equal(publicationField.format(publicationField.options[0]), 'Куртка · 2 SKU · 2026-09-23');
  assert.deepEqual(sent(shopField.options), [{ id: 'shop-1', name: 'Магазин shop-1' }]);
  await calls.forms[0].submit({ publicationId: 'publication-1', shopId: 'shop-1' });
  assert.deepEqual(sent(calls.mutations), [{
    path: '/v2/commercial-publications/publication-1/buyer-catalogs',
    body: { showroomId: 'showroom-1', shopId: 'shop-1' },
  }]);
});

test('an access row shows the catalogue the brand opened, once it is read', async () => {
  const { actions, calls } = harness({
    invitations: [accepted],
    reads: { '/v2/showrooms/showroom-1/buyer-catalog': { lines: [{}, {}, {}], publishedAt: '2026-09-23' } },
  });
  // Первый проход рисуется сразу: ждать одну колонку значило бы держать пустыми остальные.
  assert.equal(actions.catalogCell(showroom, accepted, { onLoaded: () => {} }), '—');
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(actions.catalogCell(showroom, accepted), '3 SKU · 2026-09-23');
  assert.deepEqual(calls.reads, ['/v2/showrooms/showroom-1/buyer-catalog?shopId=shop-1']);
  // Приглашение, которое ещё не принято, каталога иметь не может — и не спрашивается.
  actions.reset();
  assert.equal(actions.catalogCell(showroom, { ...accepted, status: 'pending' }), '—');
  assert.equal(calls.reads.length, 1);
});

// Найдено живьём: каталог создавался, форма отвечала «Изменения сохранены», а строка доступа
// показывала прежнюю дату. Перезагрузка рабочего пространства кэш каталогов не трогает — их там
// нет, — поэтому запись обязана сбросить свой ключ сама. Подтверждение без доказательства на
// экране хуже отсутствия подтверждения: человек верит, что дело сделано, и не проверяет.
test('publishing a catalogue forgets the row it just replaced', async () => {
  let publishedAt = '2026-09-19';
  const { actions, calls } = harness({
    invitations: [accepted],
    reads: {
      '/v2/showrooms/showroom-1/buyer-catalog': { lines: [{}], get publishedAt() { return publishedAt; } },
      '/v2/collections/collection-1/commercial-publications': {
        items: [{ id: 'publication-1', status: 'published', publishedAt: '2026-09-23', lines: [{}], styles: [{ titleRu: 'Куртка' }] }],
      },
    },
  });

  actions.catalogCell(showroom, accepted, { onLoaded: () => {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(actions.catalogCell(showroom, accepted), '1 SKU · 2026-09-19');

  await actions.buyerCatalogForm(showroom);
  publishedAt = '2026-09-23';
  await calls.forms[0].submit({ publicationId: 'publication-1', shopId: 'shop-1' });

  // Сразу после записи строка снова неизвестна — и читается заново, а не берётся из кэша.
  assert.equal(actions.catalogCell(showroom, accepted, { onLoaded: () => {} }), '—');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(actions.catalogCell(showroom, accepted), '1 SKU · 2026-09-23');
});
