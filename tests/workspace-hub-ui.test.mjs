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

test('connected workspace hub navigates only to installed authorised destinations', async () => {
  const { hub, context, events } = await harness();
  context.window.SynthaUiCapabilities = { canOpenView: (_workspace, view) => view === 'styles' };
  assert.equal(hub.navigate('orders'), false);
  assert.equal(context.state.view, 'overview');
  assert.equal(hub.navigate('draft-feature'), false);
  assert.equal(hub.navigate('styles'), true);
  assert.equal(context.state.view, 'styles');
  assert.deepEqual(events, ['render']);
});

test('workspace hub mounts after Awaiting Action but before final ODS layers, preserving the legacy overview', async () => {
  const [index, code, css, architecture] = await Promise.all([
    source('public/index.html'),
    source('public/modules/workspace-hub.js'),
    source('public/workspace-hub.css'),
    source('ARCHITECTURE.md'),
  ]);
  assert.ok(index.indexOf('/ui/awaiting-action.js') < index.indexOf('/ui/workspace-hub.js'));
  assert.ok(index.indexOf('/ui/workspace-hub.js') < index.indexOf('/ui/omnidata-v14.js'));
  assert.ok(index.indexOf('/workspace-hub.css') > index.indexOf('/omnidata-v14-role-system.css'));
  assert.match(code, /recent\.append\(previousRenderOverview\(\)\)/);
  assert.match(code, /SynthaUiCapabilities\?\.canOpenView/);
  assert.match(code, /\bOD_V7_GROUPS\b/);
  assert.match(css, /body\.omnidata-v14 \.syntha-hub-card/);
  assert.match(css, /@media\(max-width:570px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(architecture, /Connected workspace hub/);
  assert.doesNotThrow(() => new vm.Script(code));
});
