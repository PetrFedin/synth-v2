import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => readFile(path.join(root, relative), 'utf8');

async function harness() {
  const code = await source('public/modules/workspace-hub.js');
  const events = [];
  const context = vm.createContext({
    window: {},
    state: { workspace: { memberships: [], organisations: [] }, view: 'overview' },
    renderOverview: () => 'original-overview',
    renderApp: () => { events.push('render'); },
    OD_V7_GROUPS: [
      { label: null, items: [{ view: 'overview', ru: 'Обзор', en: 'Overview' }] },
      { label: { ru: 'Разработка', en: 'Development' }, items: [
        { view: 'styles', ru: 'Модели', en: 'Styles', icon: 'styles' },
        { view: 'boms', ru: 'Спецификации', en: 'BOM', icon: 'catalog' },
        { view: 'draft-feature', ru: 'Будущее', en: 'Planned', planned: true },
      ] },
      { label: { ru: 'Коммерция', en: 'Commerce' }, items: [
        { view: 'styles', ru: 'Модели', en: 'Styles duplicate' },
        { view: 'orders', ru: 'Заказы', en: 'Orders' },
      ] },
    ],
    localText: (ru) => ru,
  });
  new vm.Script(code, { filename: 'workspace-hub.js' }).runInContext(context);
  return { context, events, hub: context.window.SynthaWorkspaceHub };
}

test('connected workspace hub displays only installed, permitted and unique views', async () => {
  const { hub, context } = await harness();
  const groups = hub.availableSections(context.OD_V7_GROUPS, {}, (_workspace, view) => view !== 'orders');
  assert.deepEqual(groups.map(g => [...g.entries].map(x => x.view)), [['overview'], ['styles', 'boms']]);
  assert.equal(groups.flatMap(g => g.entries).some(x => x.view === 'draft-feature'), false);
});

test('workspace directory obeys canonical sidebar brand-only visibility', async () => {
  const { hub, context } = await harness();
  context.odV7ItemApplies = (item) => item.view !== 'boms';
  const groups = hub.availableSections(context.OD_V7_GROUPS, {}, () => true);
  assert.deepEqual(groups.map((group) => [...group.entries].map((entry) => entry.view)), [['overview'], ['styles'], ['orders']]);
});

test('Tech Packs registers its actual view rather than advertising a planned mock screen', async () => {
  const sourceText = await source('public/modules/tech-packs.js');
  assert.match(sourceText, /SynthaOmnidataV7Nav\?\.activate\('Tech packs', 'tech-packs'/);
});

test('connected workspace hub navigates only to installed authorised destinations', async () => {
  const { hub, context, events } = await harness();
  context.window.SynthaUiCapabilities = { canOpenView: (_workspace, view) => view === 'styles' };
  assert.equal(hub.navigate('awaiting-action'), false);
  assert.equal(hub.navigate('orders'), false);
  assert.equal(context.state.view, 'overview');
  assert.equal(hub.navigate('draft-feature'), false);
  assert.equal(hub.navigate('styles'), true);
  assert.equal(context.state.view, 'styles');
  assert.deepEqual(events, ['render']);
});


function browserNode(tag, text = '') {
  let ownText = String(text);
  const node = {
    tagName: String(tag).toUpperCase(), children: [], className: '', dataset: {}, hidden: false,
    attributes: {}, listeners: {}, value: '',
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    querySelectorAll(selector) {
      const className = selector.replace(/^\./, '');
      const output = [];
      function visit(root) {
        for (const item of root.children) {
          if (item.className?.split(' ').includes(className)) output.push(item);
          if (item.children) visit(item);
        }
      }
      visit(this);
      return output;
    },
    get textContent() { return ownText + this.children.map(x => x.textContent ?? String(x)).join(''); },
    set textContent(next) { ownText = String(next); },
  };
  return node;
}
function browserHarness(context) {
  context.document = { createElement: (tag) => browserNode(tag) };
  context.icon = (name) => browserNode('i', name);
  context.state.workspace = {
    memberships: [{ status: 'active', organisationId: 'b1', role: 'owner', organisationType: 'brand' }],
    organisations: [{ id: 'b1', type: 'brand' }],
    orders: [{ id: 'one' }, { id: 'two' }],
    pageInfo: { truncatedSections: ['orders'] },
  };
  context.state.notificationUnreadCount = 4;
  context.window.SynthaUiCapabilities = { canOpenView: (_workspace, view) => view !== 'orders' };
  return context.renderOverview();
}
function nodeByClass(root, name) {
  return root.querySelectorAll('.' + name)[0];
}

test('rendered hub shows live loaded counts, working cards and the existing overview', async () => {
  const { context, events } = await harness();
  const root = browserHarness(context);
  const accessible = root.querySelectorAll('.syntha-hub-card');
  assert.deepEqual(accessible.map(card => card.dataset.view), ['overview', 'styles', 'boms']);
  assert.equal(root.querySelectorAll('.syntha-hub-metric-value')[0].textContent, '3');
  assert.equal(root.querySelectorAll('.syntha-hub-metric-value')[1].textContent, '2+');
  assert.equal(root.querySelectorAll('.syntha-hub-metric-value')[2].textContent, '4');
  assert.ok(root.textContent.includes('original-overview'));
  accessible[1].listeners.click();
  assert.equal(context.state.view, 'styles');
  assert.deepEqual(events, ['render']);
});

test('workspace search filters real cards and displays empty result without routing', async () => {
  const { context } = await harness();
  const root = browserHarness(context);
  const field = nodeByClass(root, 'syntha-hub-search');
  field.value = 'несуществующий';
  field.listeners.input();
  assert.ok(root.querySelectorAll('.syntha-hub-card').every(card => card.hidden));
  assert.equal(nodeByClass(root, 'syntha-hub-no-matches').hidden, false);
  field.value = 'Спецификации';
  field.listeners.input();
  assert.deepEqual(root.querySelectorAll('.syntha-hub-card').filter(card => !card.hidden).map(card => card.dataset.view), ['boms']);
  assert.equal(nodeByClass(root, 'syntha-hub-no-matches').hidden, true);
});

test('workspace hub mounts after Awaiting Action but before final ODS layers, preserving the legacy overview', async () => {
  const [index, code, css, architecture] = await Promise.all([
    source('public/index.html'),
    source('public/modules/workspace-hub.js'),
    source('public/omnidata-v14-role-system.css'),
    source('ARCHITECTURE.md'),
  ]);
  assert.ok(index.indexOf('/ui/awaiting-action.js') < index.indexOf('/ui/workspace-hub.js'));
  assert.ok(index.indexOf('/ui/workspace-hub.js') < index.indexOf('/ui/omnidata-v14.js'));
  assert.doesNotMatch(index, /\/workspace-hub\.css/);
  assert.ok(index.indexOf('/omnidata-v14-role-system.css') > index.indexOf('/omnidata-v14-extensions.css'));
  assert.match(code, /recent\.append\(previousRenderOverview\(\)\)/);
  assert.match(code, /SynthaUiCapabilities\?\.canOpenView/);
  assert.match(code, /\bOD_V7_GROUPS\b/);
  assert.match(css, /body\.omnidata-v14 \.syntha-hub-card/);
  assert.match(css, /@media\(max-width:570px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(architecture, /Connected workspace hub/);
  assert.doesNotThrow(() => new vm.Script(code));
});
