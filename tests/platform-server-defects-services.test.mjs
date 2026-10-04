import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, ROLE_CAPABILITIES } from '../src/modules/access-control/public.mjs';
import { createSeasonEconomicsQueryService } from '../src/application/season-economics-service.mjs';
import { createLibraryQueryService } from '../src/application/library-query-service.mjs';
import { createLegalEntityService } from '../src/application/legal-entity-service.mjs';
import { createPostgresOrganisationMemberReader } from '../src/infrastructure/postgres-organisation-member-reader.mjs';

test('season economics: a foreign or missing campaign is 404, a member without cost.manage is refused, the money roles read', async () => {
  const calls = [];
  const roles = { 'c-own': { owner: 'owner', viewer: 'viewer', sales: 'sales', finance: 'finance' } };
  const service = createSeasonEconomicsQueryService({ reader: {
    roleForCampaign: async (actor, campaign) => roles[campaign]?.[actor] ?? null,
    seasonForActor: async (actor, campaign) => { calls.push([actor, campaign]); return []; },
  } });
  await assert.rejects(() => service.seasonEconomicsForCampaign('stranger', 'c-own'), { code: 'SEASON_CAMPAIGN_NOT_FOUND' });
  await assert.rejects(() => service.seasonEconomicsForCampaign('owner', 'c-missing'), { code: 'SEASON_CAMPAIGN_NOT_FOUND' });
  for (const actor of ['viewer', 'sales']) await assert.rejects(() => service.seasonEconomicsForCampaign(actor, 'c-own'), { code: 'CAPABILITY_DENIED' });
  assert.deepEqual(calls, [], 'nothing is read for a caller who is refused');
  for (const actor of ['owner', 'finance']) assert.equal((await service.seasonEconomicsForCampaign(actor, 'c-own')).campaignId, 'c-own');
  for (const role of ['owner', 'admin', 'finance']) assert.ok(ROLE_CAPABILITIES[role].includes(CAPABILITIES.COST_MANAGE));
});

test('libraries: an unknown code is LIBRARY_NOT_FOUND, not an empty page', async () => {
  const service = createLibraryQueryService({ reader: {
    listForActor: async () => [],
    entriesForActor: async (_actor, code) => (code === 'colour.colour' ? { items: [{ code: 'red' }], nextCursor: null } : null),
  } });
  await assert.rejects(() => service.entriesForActor('u1', 'nope.nope'), { code: 'LIBRARY_NOT_FOUND' });
  assert.deepEqual((await service.entriesForActor('u1', 'colour.colour')).items, [{ code: 'red' }]);
  assert.deepEqual((await service.entriesForActor('u1', 'colour.colour', { limit: 5 })).nextCursor, null);
});

test('legal entity issuers: finance sees code, names and jurisdiction only; viewers and strangers are refused', async () => {
  const memberships = { 'brand-1:finance': 'finance', 'brand-1:owner': 'owner', 'brand-1:viewer': 'viewer', 'brand-1:sales': 'sales' };
  const store = { transaction: async (work) => work({
    getMembership: async (organisationId, userId) => memberships[`${organisationId}:${userId}`]
      ? { organisationId, userId, role: memberships[`${organisationId}:${userId}`], status: 'active' } : undefined,
    listLegalEntitiesWithLatestVersion: async () => [{
      id: 'le-1', organisationId: 'brand-1', entityCode: 'LE-1', status: 'active', createdBy: 'owner',
      latestVersion: { nameRu: 'ООО', nameEn: 'LLC', jurisdiction: 'RU', requisites: { inn: '7707083893' }, contentHash: 'abc' },
    }],
  }) };
  const service = createLegalEntityService({ store });
  const expected = [{ id: 'le-1', organisationId: 'brand-1', entityCode: 'LE-1', status: 'active', nameRu: 'ООО', nameEn: 'LLC', jurisdiction: 'RU' }];
  assert.deepEqual(await service.listIssuersForActor('finance', 'brand-1'), expected);
  assert.deepEqual(await service.listIssuersForActor('owner', 'brand-1'), expected);
  assert.doesNotMatch(JSON.stringify(await service.listIssuersForActor('finance', 'brand-1')), /7707083893|abc|createdBy/);
  for (const actor of ['viewer', 'sales']) await assert.rejects(() => service.listIssuersForActor(actor, 'brand-1'), { code: 'CAPABILITY_DENIED' });
  await assert.rejects(() => service.listIssuersForActor('stranger', 'brand-1'), { code: 'ACTIVE_MEMBERSHIP_REQUIRED' });
  // Полный список по-прежнему только для organisation.manage.
  await assert.rejects(() => service.listForActor('finance', 'brand-1'), { code: 'CAPABILITY_DENIED' });
});

test('the roster reader unmasks e-mail only for roles holding membership.manage', async () => {
  const log = [];
  const pool = { connect: async () => ({ query: async (sql, params) => { log.push({ sql, params }); return { rows: [], rowCount: 0 }; }, release() {} }) };
  await createPostgresOrganisationMemberReader({ pool }).forActor('u1', 'brand-1');
  const query = log.find((entry) => /FROM memberships/.test(entry.sql));
  assert.match(query.sql, /CASE WHEN reader\.role = ANY\(\$3::text\[\]\) THEN person\.email END AS email/);
  const unmasked = query.params[2];
  assert.deepEqual([...unmasked].sort(), Object.keys(ROLE_CAPABILITIES).filter((role) => ROLE_CAPABILITIES[role].includes(CAPABILITIES.MEMBERSHIP_MANAGE)).sort());
  assert.ok(!unmasked.includes('viewer') && !unmasked.includes('finance') && !unmasked.includes('sales'));
});
