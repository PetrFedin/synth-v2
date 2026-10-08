import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const moduleSource = await readFile(new URL('../public/modules/operational-collaboration.js', import.meta.url), 'utf8');
const sampleSource = await readFile(new URL('../public/modules/samples.js', import.meta.url), 'utf8');
const productionOrderSource = await readFile(new URL('../public/modules/production-orders.js', import.meta.url), 'utf8');
const orderSource = await readFile(new URL('../public/modules/views-4.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/omnidata-v14-module-adapters.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function loadModule() {
  const CAPABILITIES = Object.freeze({
    COLLABORATION_READ: 'collaboration.read',
    COLLABORATION_WRITE: 'collaboration.write',
    DECISION_RECORD: 'decision.record',
    EXCEPTION_READ: 'exception.read',
    EXCEPTION_MANAGE: 'exception.manage',
  });
  const grants = Object.freeze({
    owner: Object.freeze(Object.values(CAPABILITIES)),
    viewer: Object.freeze([CAPABILITIES.COLLABORATION_READ]),
  });
  const window = {
    SynthaUiCapabilities: {
      CAPABILITIES,
      hasForOrganisation(workspace, organisationId, capability) {
        return (workspace.memberships ?? []).some((item) =>
          item.organisationId === organisationId && item.status === 'active' && (grants[item.role] ?? []).includes(capability));
      },
    },
    addEventListener() {},
    I18N: { getLocale: () => 'en', localeTag: () => 'en-US' },
  };
  const state = {
    workspace: {
      memberships: [
        { organisationId: 'brand-1', userId: 'actor-1', role: 'owner', status: 'active' },
        { organisationId: 'shop-1', userId: 'actor-1', role: 'viewer', status: 'active' },
      ],
      organisations: [
        { id: 'brand-1', name: 'Brand One' },
        { id: 'shop-1', name: 'Shop One' },
      ],
    },
  };
  const context = { window, state, console, URLSearchParams, encodeURIComponent };
  vm.runInNewContext(moduleSource, context, { filename: 'operational-collaboration.js' });
  return { api: window.SynthaOperationalCollaboration, state, CAPABILITIES };
}

test('context resolver chooses a membership that really holds the requested capability', () => {
  const { api, CAPABILITIES } = loadModule();
  const context = { entityType: 'order', entityId: 'order-1', entityVersion: 4, organisationIds: ['shop-1','brand-1'] };
  assert.equal(api.resolveActingOrganisation(context, CAPABILITIES.COLLABORATION_WRITE), 'brand-1');
  assert.equal(api.resolveActingOrganisation({ ...context, organisationIds: ['shop-1'] }, CAPABILITIES.COLLABORATION_WRITE), null);
  assert.equal(api.canRead({ ...context, organisationIds: ['shop-1'] }), true);
  assert.equal(api.canWrite({ ...context, organisationIds: ['shop-1'] }), false);
});

test('thread and decision builders pin exact entity context and never invent an authority organisation', () => {
  const { api } = loadModule();
  const context = {
    entityType: 'order',
    entityId: 'order-1',
    entityVersion: 4,
    contentHash: 'A'.repeat(64),
    organisationIds: ['brand-1','shop-1'],
    label: 'Order 1',
  };
  const thread = api.buildThreadInput(context, { title: 'Delivery', kind: 'clarification' });
  assert.deepEqual(JSON.parse(JSON.stringify(thread)), {
    ownerOrganisationId: 'brand-1',
    participantOrganisationIds: ['shop-1'],
    entity: { type: 'order', id: 'order-1', version: 4, contentHash: 'a'.repeat(64) },
    title: 'Delivery',
    kind: 'clarification',
  });
  const decision = api.buildDecisionInput(context, {
    threadId: 'thread-1',
    decisionType: 'delivery-window',
    outcome: 'approved',
    rationale: 'Dates accepted.',
    supersedesDecisionId: 'decision-0',
  });
  assert.equal(decision.actingOrganisationId, 'brand-1');
  assert.equal(decision.entity.version, 4);
  assert.equal(decision.entity.contentHash, 'a'.repeat(64));
  assert.equal(decision.supersedesDecisionId, 'decision-0');
});

test('contextual read uses the entity route and preserves IDs through URI encoding', async () => {
  const { api } = loadModule();
  const paths = [];
  const data = await api.read({ entityType: 'production-order', entityId: 'PO/27' }, async (path) => {
    paths.push(path);
    return { entity: {}, threads: [], decisions: [] };
  });
  assert.equal(paths[0], '/v2/operational/entities/production-order/PO%2F27/collaboration');
  assert.deepEqual(data.threads, []);
});

test('contextual inspector reads governed exceptions and builds recovery commands against exact entity/version authority', async () => {
  const { api } = loadModule();
  const paths = [];
  const context = { entityType: 'production-order', entityId: 'PO/27', organisationIds: ['brand-1'] };
  const exceptions = await api.readExceptions(context, async (path) => {
    paths.push(path);
    return [{ id: 'ex-1', ownerOrganisationId: 'brand-1', entity: { type: 'production-order', id: 'PO/27' }, version: 4 }];
  });
  assert.equal(paths[0], '/v2/operational/entities/production-order/PO%2F27/exceptions');
  assert.equal(exceptions[0].id, 'ex-1');
  assert.deepEqual(JSON.parse(JSON.stringify(api.buildExceptionActionInput(context, exceptions[0], {
    resolution: 'Recovered.',
    evidenceRefs: ['proof://1'],
  }))), {
    actingOrganisationId: 'brand-1',
    expectedVersion: 4,
    resolution: 'Recovered.',
    evidenceRefs: ['proof://1'],
  });
  assert.throws(
    () => api.buildExceptionActionInput({ ...context, entityId: 'PO/28' }, exceptions[0]),
    /OPERATIONAL_EXCEPTION_CONTEXT_MISMATCH/,
  );
});

test('recovery evidence input is normalized, deduplicated and never silently accepted as an empty proof set', () => {
  const { api } = loadModule();
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseEvidenceRefs(' proof://1\nproof://2, proof://1 '))), ['proof://1','proof://2']);
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseEvidenceRefs('   '))), []);
});


test('the existing contextual inspector renders exception SLA, recovery evidence, accepted-risk and close actions without a second task centre', () => {
  for (const token of [
    'renderExceptions(exceptions, decisions)',
    'Operational exceptions',
    'SLA breached',
    'Resolve with evidence',
    'Accept risk through decision',
    'Close after verification',
    '/v2/operational/exceptions/',
    'buildExceptionActionInput',
  ]) assert.ok(moduleSource.includes(token), token);
  assert.ok(!moduleSource.includes('exception-task-centre'));
});

test('Samples, Production Orders and Wholesale Orders expose the same shared collaboration control', () => {
  assert.match(sampleSource, /SynthaOperationalCollaboration\?\.createButton/);
  assert.match(sampleSource, /entityType:\s*'sample'/);
  assert.match(productionOrderSource, /SynthaOperationalCollaboration\?\.createButton/);
  assert.match(productionOrderSource, /entityType:'production-order'/);
  assert.match(orderSource, /SynthaOperationalCollaboration\?\.createButton/);
  assert.match(orderSource, /entityType:\s*'order'/);
});

test('ODS inspector is a right-side desktop surface, bounded tablet split and full-height mobile surface', () => {
  for (const fragment of [
    'dialog.operational-collaboration-inspector',
    'width:min(var(--ods-inspector-width,420px),calc(100vw - 32px))',
    'inset:0 0 0 auto',
    '@media(max-width:920px)',
    'width:44vw',
    '@media(max-width:720px)',
    'width:100vw',
    'height:100dvh',
  ]) assert.ok(css.includes(fragment), fragment);
  assert.ok(html.includes('/ui/operational-collaboration.js?v=operational-collaboration-20261007-1'));
  assert.ok(html.includes('omnidata-v14-module-adapters.css?v=visual-20260805-14-module-adapters-5'));
});
