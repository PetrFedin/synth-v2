import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { CAPABILITIES } from '../src/modules/access-control/public.mjs';

// A-01: экран «Команда» — каждая видимая кнопка имеет обработчик, проверку права, маршрут и
// версию записи, по которой её выполняет сервер.

const source = await readFile(path.join(process.cwd(), 'public/modules/team.js'), 'utf8');
const indexHtml = await readFile(path.join(process.cwd(), 'public/index.html'), 'utf8');
const workspaceSource = await readFile(path.join(process.cwd(), 'public/modules/omnidata-workspace.js'), 'utf8');
const loginSource = await readFile(path.join(process.cwd(), 'public/modules/app-core.js'), 'utf8');

function roster(actorRole = 'owner') {
  return {
    actor: { userId: 'u-me', role: actorRole },
    assignableRoles: actorRole === 'owner' ? ['owner', 'admin', 'sales', 'viewer'] : ['admin', 'sales', 'viewer'],
    items: [
      { membershipId: 'm1', userId: 'u-me', role: actorRole, status: 'active', version: 1, displayName: 'Me', email: 'me@x.test', accountStatus: 'active', invitePending: false, inviteExpiresAt: null, updatedAt: null },
      { membershipId: 'm2', userId: 'u-sales', role: 'sales', status: 'active', version: 4, displayName: 'Sales', email: 'sales@x.test', accountStatus: 'active', invitePending: false, inviteExpiresAt: null, updatedAt: null },
      { membershipId: 'm3', userId: 'u-off', role: 'viewer', status: 'inactive', version: 2, displayName: null, email: 'off@x.test', accountStatus: 'disabled', invitePending: false, inviteExpiresAt: null, updatedAt: null },
      { membershipId: 'm4', userId: 'u-new', role: 'viewer', status: 'active', version: 1, displayName: 'New', email: 'new@x.test', accountStatus: 'invited', invitePending: true, inviteExpiresAt: '2026-10-05T10:00:00.000Z', updatedAt: null },
      { membershipId: 'm5', userId: 'u-owner', role: 'owner', status: 'active', version: 1, displayName: 'Boss', email: 'boss@x.test', accountStatus: 'active', invitePending: false, inviteExpiresAt: null, updatedAt: null },
    ],
  };
}

function harness({ held, actorRole = 'owner', failLoad = false }) {
  const calls = { api: [], mutations: [], forms: [], confirms: [], dialogs: [] };
  const w = { Object, Map, Set, String, Array, Number, Math, Promise, RegExp, Error, queueMicrotask, setTimeout, encodeURIComponent, JSON, Date, Boolean };
  w.window = w;
  w.state = { token: 't', view: 'partners', workspace: { organisations: [{ id: 'org-1', name: 'Brand', type: 'brand' }] } };
  w.ownOrganisations = () => w.state.workspace.organisations;
  w.localText = (ru) => ru;
  w.formatDate = (value) => value;
  w.renderApp = () => { calls.rendered = (calls.rendered || 0) + 1; };
  w.toast = () => {};
  w.I18N = { t: (key) => key };
  w.api = async (p) => { calls.api.push(p); if (failLoad) throw new Error('nope'); return roster(actorRole); };
  w.mutate = async (p, body) => { calls.mutations.push({ path: p, body }); return { invite: { token: 'swv2i_TOKEN', expiresAt: '2026-10-05T10:00:00.000Z' }, member: { displayName: 'New', email: 'new@x.test' } }; };
  w.textDef = (name, label, value) => ({ name, label, value, kind: 'text' });
  w.optionalTextDef = (name, label, value) => ({ name, label, value, kind: 'text', optional: true });
  w.selectDef = (name, label, options, format, value) => ({ name, label, options, format, value, kind: 'select' });
  w.dependentSelectDef = (name, label, dependsOn, optionsFor) => ({ name, label, dependsOn, optionsFor, kind: 'select' });
  w.actionButton = (label, fn, variant = '', confirmText = '') => ({ kind: 'button', label, fn, variant, confirmText });
  w.openForm = (title, fields, submit) => { calls.forms.push({ title, fields, submit }); };
  w.el = (tag, props = {}) => {
    const node = { tag, props, children: [], append(...c) { this.children.push(...c); }, addEventListener() {}, showModal() { calls.dialogs.push(this); }, select() {}, focus() {}, remove() {} };
    return node;
  };
  w.document = { body: { append() {} } };
  w.navigator = {};
  w.SynthaUiValidation = { requiredText: (value) => String(value).trim() };
  w.SynthaUiCapabilities = {
    CAPABILITIES: { MEMBERSHIP_MANAGE: CAPABILITIES.MEMBERSHIP_MANAGE },
    organisationIds: (_workspace, capability) => (held.includes(capability) ? ['org-1'] : []),
    hasForOrganisation: (_workspace, _org, capability) => held.includes(capability),
  };
  const context = vm.createContext(w);
  vm.runInContext(source, context);
  const api = vm.runInContext('({ teamRows, teamActions, teamInviteForm, teamState, renderAcceptInvite })', context);
  return { ...api, calls, w };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => setImmediate(resolve));
const MANAGE = [CAPABILITIES.MEMBERSHIP_MANAGE];
const byLabel = (actions) => Object.fromEntries(actions.map((action) => [action.label, action]));

test('without membership.manage the screen asks for nothing and offers nothing', async () => {
  const h = harness({ held: [] });
  assert.deepEqual(plain(h.teamRows()), []);
  await flush();
  assert.deepEqual(plain(h.calls.api), []);
  assert.deepEqual(plain(h.teamActions({ organisationId: 'org-1', userId: 'u-sales', status: 'active', role: 'sales', version: 1, actor: { userId: 'u-me', role: 'owner' } })), []);
});

test('with the right it loads every status of the organisation team once', async () => {
  const h = harness({ held: MANAGE });
  assert.deepEqual(plain(h.teamRows()), []);
  await flush();
  const rows = h.teamRows();
  h.teamRows();
  assert.deepEqual(plain(h.calls.api), ['/v2/organisations/org-1/team']);
  assert.deepEqual(rows.map((row) => row.userId), ['u-me', 'u-sales', 'u-off', 'u-new', 'u-owner']);
  assert.ok(h.calls.rendered >= 1, 'the screen is redrawn when the roster arrives');
});

async function rowsFor(h) { h.teamRows(); await flush(); return Object.fromEntries(h.teamRows().map((row) => [row.userId, row])); }

test('every button runs the route the server owns, with the version it was read at', async () => {
  const h = harness({ held: MANAGE });
  const rows = await rowsFor(h);

  const sales = byLabel(h.teamActions(rows['u-sales']));
  assert.deepEqual(plain(Object.keys(sales)).sort(), ['Отключить', 'Сменить роль']);
  await sales['Отключить'].fn();
  assert.deepEqual(plain(h.calls.mutations.pop()), { path: '/v2/organisations/org-1/team/u-sales/deactivate', body: { expectedVersion: 4 } });
  assert.match(sales['Отключить'].confirmText, /потеряет доступ/);
  assert.equal(sales['Отключить'].variant, 'danger');

  sales['Сменить роль'].fn();
  const form = h.calls.forms.pop();
  assert.deepEqual(plain(form.fields[0].options), ['owner', 'admin', 'viewer'], 'the current role is not offered');
  await form.submit({ role: 'admin' });
  assert.deepEqual(plain(h.calls.mutations.pop()), { path: '/v2/organisations/org-1/team/u-sales/role', body: { role: 'admin', expectedVersion: 4 } });

  const off = byLabel(h.teamActions(rows['u-off']));
  assert.deepEqual(plain(Object.keys(off)), ['Включить']);
  await off['Включить'].fn();
  assert.deepEqual(plain(h.calls.mutations.pop()), { path: '/v2/organisations/org-1/team/u-off/reactivate', body: { expectedVersion: 2 } });
});

test('a person who never set a password gets a new-token button that shows the token once', async () => {
  const h = harness({ held: MANAGE });
  const rows = await rowsFor(h);
  const pending = byLabel(h.teamActions(rows['u-new']));
  assert.ok(pending['Новый токен приглашения']);
  await pending['Новый токен приглашения'].fn();
  assert.deepEqual(plain(h.calls.mutations.pop()), { path: '/v2/organisations/org-1/team/u-new/reissue-invite', body: { expectedVersion: 1 } });
  assert.equal(h.calls.dialogs.length, 1);
  assert.ok(JSON.stringify(h.calls.dialogs[0], (key, value) => (key === 'append' || typeof value === 'function' ? undefined : value)).includes('swv2i_TOKEN'));
});

test('nobody is offered the button that disables themself', async () => {
  const h = harness({ held: MANAGE });
  const rows = await rowsFor(h);
  assert.deepEqual(plain(Object.keys(byLabel(h.teamActions(rows['u-me'])))), ['Сменить роль']);
});

test('an administrator is not offered any action on an owner', async () => {
  const h = harness({ held: MANAGE, actorRole: 'admin' });
  const rows = await rowsFor(h);
  assert.deepEqual(plain(h.teamActions(rows['u-owner'])), []);
  assert.ok(h.teamActions(rows['u-sales']).length > 0);
});

test('the invitation form offers only roles the caller may grant and sends a trimmed, validated address', async () => {
  const h = harness({ held: MANAGE, actorRole: 'admin' });
  await rowsFor(h);
  h.teamInviteForm();
  const form = h.calls.forms.pop();
  const roleField = form.fields.find((field) => field.name === 'role');
  assert.deepEqual(plain(roleField.optionsFor('org-1')), ['admin', 'sales', 'viewer']);

  await assert.rejects(() => form.submit({ organisationId: 'org-1', email: 'not-an-address', displayName: '', role: 'sales' }));
  assert.equal(h.calls.mutations.length, 0, 'a bad address never reaches the server');

  await form.submit({ organisationId: 'org-1', email: '  anna@x.test ', displayName: ' Anna ', role: 'sales' });
  assert.deepEqual(plain(h.calls.mutations.pop()), { path: '/v2/organisations/org-1/team/invitations', body: { email: 'anna@x.test', displayName: 'Anna', role: 'sales' } });
  assert.equal(h.calls.dialogs.length, 1, 'the one-time token is shown');
});

test('the tab, its action and the sign-in link to accept an invitation are wired into the screens', () => {
  assert.match(indexHtml, /\/ui\/team\.js/);
  assert.match(workspaceSource, /id: 'team'/);
  assert.match(workspaceSource, /teamInviteForm/);
  assert.match(workspaceSource, /header\.active === 'team'/);
  assert.match(loginSource, /renderAcceptInvite/);
});

test('accepting an invitation is anonymous and sends the token and password only', async () => {
  const h = harness({ held: [] });
  const sent = [];
  const submitters = [];
  h.w.api = async (p, options) => { sent.push({ p, options }); return {}; };
  h.w.clear = () => {};
  h.w.root = { append() {} };
  h.w.languageSwitcher = () => ({});
  h.w.brandBlock = () => ({});
  h.w.notice = () => ({});
  h.w.inputField = (label, type, attrs) => ({ label: { label }, control: { value: attrs.name === 'token' ? ' swv2i_abc ' : 'a long enough passphrase' } });
  h.w.setButtonBusy = () => {};
  h.w.showInlineError = () => {};
  h.w.renderLogin = () => {};
  h.w.el = (tag, props = {}) => {
    const node = { tag, props, append() {}, addEventListener(type, fn) { if (type === 'submit') submitters.push(fn); }, isConnected: true };
    return node;
  };
  h.renderAcceptInvite();
  await submitters[0]({ preventDefault() {} });
  assert.deepEqual(plain(sent), [{ p: '/v2/auth/accept-invite', options: { method: 'POST', body: { token: 'swv2i_abc', password: 'a long enough passphrase' }, anonymous: true } }]);
});
