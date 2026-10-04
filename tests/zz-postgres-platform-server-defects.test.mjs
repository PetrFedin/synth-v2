import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const PASSWORD = 'a long enough passphrase for tests';
const now = '2026-10-02T10:00:00.000Z';

async function boot() {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 8 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
  let sequence = 0;
  const runtime = createPostgresWholesaleRuntime({ pool, clock: () => new Date().toISOString(), nextId: (prefix) => `${prefix}-psd-${++sequence}` });
  for (const id of ['brand-1', 'brand-2']) {
    await pool.query('INSERT INTO organisations (id, type, payload) VALUES ($1, $2, $3::jsonb)', [id, 'brand', JSON.stringify({ id, type: 'brand', name: id })]);
  }
  for (const [userId, email, orgId] of [['owner-1', 'owner@brand.test', 'brand-1'], ['owner-b2', 'owner@brand2.test', 'brand-2']]) {
    await runtime.auth.bootstrapUser({ id: userId, email, password: PASSWORD, displayName: userId });
    const membership = { id: `m-${userId}`, organisationId: orgId, organisationType: 'brand', userId, role: 'owner', status: 'active', createdAt: now };
    await pool.query('INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [membership.id, orgId, userId, 'brand', 'owner', 'active', JSON.stringify(membership)]);
  }
  let counter = 0;
  const call = async (method, urlPath, { token, body, key = `key-${++counter}` } = {}) => {
    const response = await runtime.fetchHandler(new Request(`http://syntha.local${urlPath}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === 'POST' && key ? { 'idempotency-key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  };
  const login = async (email) => (await call('POST', '/v2/auth/login', { body: { email, password: PASSWORD } })).body.data?.accessToken;
  // Приглашённый, принявший приглашение (`accept = true`), или ещё нет.
  const onboard = async (ownerToken, email, role, accept = true) => {
    const invited = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: ownerToken, body: { email, displayName: email.split('@')[0], role } });
    assert.equal(invited.status, 200, JSON.stringify(invited.body));
    if (accept) {
      const accepted = await call('POST', '/v2/auth/accept-invite', { body: { token: invited.body.data.invite.token, password: PASSWORD }, key: null });
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    }
    return invited.body.data.member;
  };
  return { pool, runtime, call, login, onboard };
}

test('PostgreSQL: the roster hides e-mail addresses from everyone who does not manage the team', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    await onboard(owner, 'viewer@brand.test', 'viewer');
    await onboard(owner, 'ghost@brand.test', 'sales', false); // приглашён, пароля нет
    const viewer = await login('viewer@brand.test');

    const asOwner = await call('GET', '/v2/organisations/brand-1/members', { token: owner });
    assert.equal(asOwner.status, 200);
    assert.ok(asOwner.body.data.items.some((member) => member.email === 'ghost@brand.test'), 'a team manager sees every address');
    const asViewer = await call('GET', '/v2/organisations/brand-1/members', { token: viewer });
    assert.equal(asViewer.status, 200);
    assert.equal(asViewer.body.data.items.length, 3);
    for (const member of asViewer.body.data.items) assert.equal(member.email, null, `${member.userId} leaked an address`);
    assert.deepEqual(asViewer.body.data.items.map((member) => member.role).sort(), ['owner', 'sales', 'viewer']);
    assert.ok(asViewer.body.data.items.every((member) => member.displayName || member.userId), 'name and role stay');
    assert.doesNotMatch(JSON.stringify(asViewer.body), /@brand\.test/);
    // Из чужой организации ростер пуст, а не отказ.
    const outsider = await login('owner@brand2.test');
    assert.equal((await call('GET', '/v2/organisations/brand-1/members', { token: outsider })).body.data.items.length, 0);
  } finally { await pool.end(); }
});

test('PostgreSQL: season economics answers only to its own brand and only to the people who handle cost', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    await onboard(owner, 'viewer@brand.test', 'viewer');
    await onboard(owner, 'sales@brand.test', 'sales');
    await onboard(owner, 'finance@brand.test', 'finance');
    await pool.query(`INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ('campaign-1', 'brand-1', 'draft', 1, $1::jsonb)`, [JSON.stringify({ id: 'campaign-1', brandId: 'brand-1' })]);
    const url = '/v2/campaigns/campaign-1/season-economics';

    assert.equal((await call('GET', url, { token: owner })).status, 200);
    assert.equal((await call('GET', url, { token: await login('finance@brand.test') })).status, 200);
    for (const email of ['viewer@brand.test', 'sales@brand.test']) {
      const refused = await call('GET', url, { token: await login(email) });
      assert.equal(refused.status, 403, `${email}: ${JSON.stringify(refused.body)}`);
      assert.equal(refused.body.error.code, 'CAPABILITY_DENIED');
    }
    // Чужой бренд и несуществующая кампания неразличимы: 404, а не каркас из null.
    const foreign = await call('GET', url, { token: await login('owner@brand2.test') });
    assert.equal(foreign.status, 404, JSON.stringify(foreign.body));
    assert.equal((await call('GET', '/v2/campaigns/nope/season-economics', { token: owner })).status, 404);
  } finally { await pool.end(); }
});

test('PostgreSQL: an unknown library is a 404, an unknown history subject stays an empty page', { skip: !databaseUrl }, async () => {
  const { pool, call, login } = await boot();
  try {
    const owner = await login('owner@brand.test');
    const unknown = await call('GET', '/v2/libraries/nope.nope/entries', { token: owner });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.body));
    assert.equal(unknown.body.error.code, 'LIBRARY_NOT_FOUND');
    await pool.query(`INSERT INTO mdm_dictionaries (id, code, names, data_class, scope_model, status, approval_required, effective_dated)
                      VALUES ('dict-1', 'test.library', '{"ru":"Тест","en":"Test"}'::jsonb, 'reference', 'global', 'active', false, false)`)
      .catch(() => undefined);
    const listed = await call('GET', '/v2/libraries', { token: owner });
    assert.equal(listed.status, 200);
    const known = listed.body.data.items[0]?.code;
    if (known) {
      const entries = await call('GET', `/v2/libraries/${known}/entries`, { token: owner });
      assert.equal(entries.status, 200, JSON.stringify(entries.body));
      assert.ok(Array.isArray(entries.body.data.items));
    }
    // История: по сознательному решению неизвестный и чужой объект выглядят одинаково — пустая страница.
    const history = await call('GET', '/v2/history/no-such-object', { token: owner });
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.data.items, []);
  } finally { await pool.end(); }
});

test('PostgreSQL: finance picks a document issuer without seeing requisites; the full list stays closed to it', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    await onboard(owner, 'finance@brand.test', 'finance');
    await onboard(owner, 'viewer@brand.test', 'viewer');
    const created = await call('POST', '/v2/legal-entities', { token: owner, body: { organisationId: 'brand-1', entityCode: 'LE-MAIN' } });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const version = await call('POST', `/v2/legal-entities/${created.body.data.id}/versions`, { token: owner, body: {
      expectedLatestVersionNo: 0, jurisdiction: 'RU', nameRu: 'ООО Ромашка', nameEn: 'Romashka LLC',
      requisites: { inn: '7707083893', ogrn: '1027700132195', kpp: '770701001', legalAddress: 'г. Москва, ул. Тверская, д. 1', bankName: 'Банк', bankAccount: '40702810100000000001', bankBik: '044525974' },
    } });
    assert.equal(version.status, 200, JSON.stringify(version.body));

    const finance = await login('finance@brand.test');
    const issuers = await call('GET', '/v2/organisations/brand-1/legal-entity-issuers', { token: finance });
    assert.equal(issuers.status, 200, JSON.stringify(issuers.body));
    assert.deepEqual(issuers.body.data, [{ id: created.body.data.id, organisationId: 'brand-1', entityCode: 'LE-MAIN', status: 'draft', nameRu: 'ООО Ромашка', nameEn: 'Romashka LLC', jurisdiction: 'RU' }]);
    assert.doesNotMatch(JSON.stringify(issuers.body), /7707083893|40702810100000000001|bank/i);
    assert.equal((await call('GET', '/v2/organisations/brand-1/legal-entities', { token: finance })).status, 403, 'the full list with requisites stays owner/admin');
    assert.equal((await call('GET', '/v2/organisations/brand-1/legal-entity-issuers', { token: await login('viewer@brand.test') })).status, 403);
    assert.equal((await call('GET', '/v2/organisations/brand-1/legal-entity-issuers', { token: await login('owner@brand2.test') })).status, 403);
  } finally { await pool.end(); }
});

test('PostgreSQL: notification read state belongs to the person who read it', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    await onboard(owner, 'viewer@brand.test', 'viewer');
    const viewer = await login('viewer@brand.test');
    for (const index of [1, 2, 3]) {
      const id = `notification-${index}`;
      const createdAt = `2026-10-02T10:0${index}:00.000Z`;
      const payload = { id, dedupeKey: `event-${index}:brand-1`, sourceEventId: `event-${index}`, recipientOrganisationId: 'brand-1', type: 'deal-opened', title: 'DealSpace opened', body: 'DealSpace is open.', params: {}, status: 'unread', version: 1, createdAt, readAt: null, readBy: null, updatedAt: createdAt };
      await pool.query(`INSERT INTO notifications (id, dedupe_key, source_event_id, recipient_organisation_id, type, status, version, created_at, payload)
                        VALUES ($1,$2,$3,'brand-1','deal-opened','unread',1,$4,$5::jsonb)`, [id, payload.dedupeKey, payload.sourceEventId, createdAt, JSON.stringify(payload)]);
    }
    const unread = async (token) => (await call('GET', '/v2/notifications/page?limit=50', { token })).body.data.unreadCount;
    assert.deepEqual([await unread(owner), await unread(viewer)], [3, 3]);

    const read = await call('POST', '/v2/notifications/notification-2/read', { token: viewer });
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.equal(read.body.data.status, 'read');
    assert.ok(read.body.data.readBy && read.body.data.readBy !== 'owner-1');

    assert.deepEqual([await unread(owner), await unread(viewer)], [3, 2], 'the owner never read it: their counter does not move');
    const ownerPage = (await call('GET', '/v2/notifications/page?limit=50', { token: owner })).body.data.items;
    assert.ok(ownerPage.every((item) => item.status === 'unread' && item.readBy === null));
    const viewerPage = (await call('GET', '/v2/notifications/page?limit=50', { token: viewer })).body.data.items;
    assert.deepEqual(viewerPage.filter((item) => item.status === 'read').map((item) => item.id), ['notification-2']);
    const viewerList = (await call('GET', '/v2/notifications', { token: viewer })).body.data;
    assert.equal(viewerList[viewerList.length - 1].id, 'notification-2', 'own read items sort after unread ones');

    // Повторная отметка — не вторая строка и не новое время.
    const again = await call('POST', '/v2/notifications/notification-2/read', { token: viewer });
    assert.equal(again.body.data.readAt, read.body.data.readAt);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM notification_reads WHERE notification_id = 'notification-2'`)).rows[0].count, 1);
    // Строка уведомления организации не менялась.
    assert.equal((await pool.query(`SELECT status, version FROM notifications WHERE id = 'notification-2'`)).rows[0].status, 'unread');

    const ownerRead = await call('POST', '/v2/notifications/notification-2/read', { token: owner });
    assert.equal(ownerRead.status, 200);
    assert.deepEqual([await unread(owner), await unread(viewer)], [2, 2]);
  } finally { await pool.end(); }
});

test('PostgreSQL: roles the capability table names can read the subsystems it names, over HTTP', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    for (const role of ['production', 'quality', 'finance', 'sales', 'viewer']) await onboard(owner, `${role}@brand.test`, role);
    const token = Object.fromEntries(await Promise.all(['production', 'quality', 'finance', 'sales', 'viewer'].map(async (role) => [role, await login(`${role}@brand.test`)])));
    // Читатель без строк отвечает 200 и пустой страницей: дело в том, что запрос выполняется и роль не отсекается раньше времени.
    for (const url of ['/v2/boms', '/v2/tech-packs', '/v2/samples', '/v2/production-orders']) {
      for (const role of ['production', 'owner']) {
        const response = await call('GET', url, { token: role === 'owner' ? owner : token[role] });
        assert.equal(response.status, 200, `${role} ${url}: ${JSON.stringify(response.body)}`);
      }
    }
  } finally { await pool.end(); }
});
