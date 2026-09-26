import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createLegalEntityService } from '../src/application/legal-entity-service.mjs';
import { createComplianceDocumentService } from '../src/application/compliance-document-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresLegalEntityStore } from '../src/infrastructure/postgres-legal-entity-store.mjs';
import { createPostgresComplianceDocumentStore } from '../src/infrastructure/postgres-compliance-document-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL Compliance Document registry issues a УПД, tracks its ЭДО status and supersedes it', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-09-01T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const legalEntityStore = createPostgresLegalEntityStore({ pool });
    const complianceDocumentStore = createPostgresComplianceDocumentStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const legalEntities = createLegalEntityService({ store: legalEntityStore, clock, nextId });
    const complianceDocuments = createComplianceDocumentService({ store: complianceDocumentStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-cd', type: 'brand', name: 'Compliance Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-cd', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-finance', 'owner-user', createMembership({ id: 'membership-finance', organisationId: 'brand-cd', organisationType: 'brand', userId: 'finance-user', role: 'finance', createdAt: clock() }));
    await platform.grantMembership('member-sales', 'owner-user', createMembership({ id: 'membership-sales', organisationId: 'brand-cd', organisationType: 'brand', userId: 'sales-user', role: 'sales', createdAt: clock() }));

    const entity = await legalEntities.createLegalEntity('entity-create', 'owner-user', { organisationId: 'brand-cd', entityCode: 'RU-MAIN' });
    await legalEntities.createLegalEntityVersion('v1', 'owner-user', entity.id, {
      expectedLatestVersionNo: 0, jurisdiction: 'RU', nameRu: 'ООО «Синта Рус»', nameEn: 'Syntha Rus LLC',
      requisites: { inn: '7707083893', ogrn: '1027700132195', kpp: '770701001', legalAddress: 'г. Москва, ул. Тверская, д. 1' },
    });
    const activatedEntity = await legalEntities.transitionLegalEntity('entity-activate', 'owner-user', entity.id, { expectedVersion: 1, nextStatus: 'active' });
    assert.equal(activatedEntity.status, 'active');
    const counterparty = await legalEntities.createLegalEntity('counterparty-create', 'owner-user', { organisationId: 'brand-cd', entityCode: 'RU-BUYER' });

    await assert.rejects(() => complianceDocuments.createComplianceDocument('bad-counterparty', 'finance-user', {
      organisationId: 'brand-cd', documentNumber: 'UPD-0000', documentType: 'upd', issuerLegalEntityId: entity.id, counterpartyLegalEntityId: 'legal-entity_missing',
    }), { code: 'COMPLIANCE_DOCUMENT_COUNTERPARTY_NOT_FOUND' });

    // finance manages compliance documents; sales does not.
    await assert.rejects(() => complianceDocuments.createComplianceDocument('deny', 'sales-user', {
      organisationId: 'brand-cd', documentNumber: 'UPD-0001', documentType: 'upd', issuerLegalEntityId: entity.id,
    }), { code: 'CAPABILITY_DENIED' });

    const draft = await complianceDocuments.createComplianceDocument('doc-create', 'finance-user', {
      organisationId: 'brand-cd', documentNumber: 'UPD-0001', documentType: 'upd', issuerLegalEntityId: entity.id, counterpartyLegalEntityId: counterparty.id,
    });
    assert.equal(draft.status, 'draft');
    assert.equal(draft.edoStatus, null);
    assert.equal(draft.validFrom, null);
    assert.equal(draft.counterpartyLegalEntityId, counterparty.id);
    // replay is idempotent
    assert.equal((await complianceDocuments.createComplianceDocument('doc-create', 'finance-user', {
      organisationId: 'brand-cd', documentNumber: 'UPD-0001', documentType: 'upd', issuerLegalEntityId: entity.id, counterpartyLegalEntityId: counterparty.id,
    })).id, draft.id);

    // a УПД cannot carry a validity period
    await assert.rejects(() => complianceDocuments.createComplianceDocument('bad-validity', 'finance-user', {
      organisationId: 'brand-cd', documentNumber: 'UPD-0002', documentType: 'upd', issuerLegalEntityId: entity.id, validFrom: '2026-01-01',
    }), { code: 'COMPLIANCE_DOCUMENT_VALIDITY_NOT_APPLICABLE' });

    // an ЭДО status cannot be recorded before issue
    await assert.rejects(() => complianceDocuments.recordEdoStatus('edo-too-early', 'finance-user', draft.id, { expectedVersion: 1, edoStatus: 'sent' }), { code: 'COMPLIANCE_DOCUMENT_NOT_ISSUED' });

    const issued = await complianceDocuments.issueComplianceDocument('doc-issue', 'finance-user', draft.id, { expectedVersion: 1 });
    assert.equal(issued.status, 'issued');
    assert.equal(issued.version, 2);

    // identity is frozen once issued
    await assert.rejects(() => pool.query('UPDATE compliance_documents SET document_number = $1 WHERE id = $2', ['UPD-9999', draft.id]), /immutable/);
    await assert.rejects(() => pool.query('DELETE FROM compliance_documents WHERE id = $1', [draft.id]), /never deleted/);

    const sent = await complianceDocuments.recordEdoStatus('edo-sent', 'finance-user', draft.id, { expectedVersion: 2, edoStatus: 'sent' });
    assert.equal(sent.edoStatus, 'sent');
    await assert.rejects(() => complianceDocuments.recordEdoStatus('edo-skip', 'finance-user', draft.id, { expectedVersion: 3, edoStatus: 'signed' }), { code: 'COMPLIANCE_DOCUMENT_EDO_TRANSITION_INVALID' });
    const delivered = await complianceDocuments.recordEdoStatus('edo-delivered', 'finance-user', draft.id, { expectedVersion: 3, edoStatus: 'delivered' });
    const signed = await complianceDocuments.recordEdoStatus('edo-signed', 'finance-user', draft.id, { expectedVersion: 4, edoStatus: 'signed' });
    assert.equal(signed.edoStatus, 'signed');
    assert.equal(delivered.version, 4);

    // an EAEU declaration carries a validity period and no ЭДО status
    const declaration = await complianceDocuments.createComplianceDocument('decl-create', 'finance-user', {
      organisationId: 'brand-cd', documentNumber: 'EAEU-0001', documentType: 'eaeu_declaration_of_conformity', issuerLegalEntityId: entity.id,
      validFrom: '2026-01-01', validTo: '2027-01-01',
    });
    const declarationIssued = await complianceDocuments.issueComplianceDocument('decl-issue', 'finance-user', declaration.id, { expectedVersion: 1 });
    assert.equal(declarationIssued.validFrom, '2026-01-01');
    await assert.rejects(() => complianceDocuments.recordEdoStatus('decl-edo-deny', 'finance-user', declaration.id, { expectedVersion: 2, edoStatus: 'sent' }), { code: 'COMPLIANCE_DOCUMENT_EDO_NOT_APPLICABLE' });

    // supersede the signed УПД with a corrected number
    const { supersededDocument, replacement } = await complianceDocuments.supersedeComplianceDocument('doc-supersede', 'finance-user', draft.id, { expectedVersion: 5, replacementDocumentNumber: 'UPD-0001-KORR' });
    assert.equal(supersededDocument.status, 'superseded');
    assert.equal(replacement.status, 'draft');
    assert.equal(replacement.supersedesDocumentId, draft.id);

    const listed = await complianceDocuments.listForActor('finance-user', 'brand-cd');
    assert.equal(listed.length, 3);
    assert.ok(listed.some((doc) => doc.documentNumber === 'UPD-0001-KORR'));

    const events = (await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'compliance-document%'")).rows.map((row) => row.event_type).sort();
    assert.deepEqual(events, [
      'compliance-document.created',
      'compliance-document.created',
      'compliance-document.edo-status-recorded',
      'compliance-document.edo-status-recorded',
      'compliance-document.edo-status-recorded',
      'compliance-document.issued',
      'compliance-document.issued',
      'compliance-document.superseded',
    ].sort());
  } finally { await pool.end(); }
});
