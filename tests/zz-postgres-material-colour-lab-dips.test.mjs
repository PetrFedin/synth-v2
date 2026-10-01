import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createMaterialService } from '../src/application/material-service.mjs';
import { createMaterialColourService, createMaterialColourQueryService } from '../src/application/material-colour-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';
import { createPostgresMaterialColourStore } from '../src/infrastructure/postgres-material-colour-store.mjs';
import { createPostgresMaterialColourReader } from '../src/infrastructure/postgres-material-colour-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { bootstrapMdmReference } from '../src/infrastructure/mdm-reference-bootstrap.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// Цвет материала и лабораторный образец (docs/omnidata-screens-gap-analysis.md, п.26) были полностью
// проведены через домен/сервис/стор с самого начала (`src/modules/material-colours/public.mjs`,
// `src/application/material-colour-service.mjs`, `src/http/material-colour-routes.mjs`), но ни разу
// не доходили до реального PostgreSQL ни одним тестом, и ни одна форма в `public/modules/materials.js`
// их не отправляла — палитра была только для чтения. Этот тест проходит полный цикл
// сервис → стор → реальный PostgreSQL: цвет заводится из настоящего справочника `colour.colour`,
// образец проходит весь путь запрос → присылка → решение, и отдельно — путь запрос → отмена.
test('PostgreSQL material colour palette and lab dip lifecycle: request, submit, decide, cancel, and capability separation', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  // the real colour.colour reference dataset becomes effective 2026-09-18; the clock must be at or
  // after that for the governed-colour lookup to resolve.
  const baseTime = Date.parse('2026-09-19T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const colourDataset = JSON.parse(await readFile(path.join(root, 'mdm', 'reference', 'russia-fashion-colour-core.json'), 'utf8'));
    await bootstrapMdmReference({ pool, datasets: [colourDataset] });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const materialStore = createPostgresMaterialStore({ pool });
    const materialColourStore = createPostgresMaterialColourStore({ pool });
    const materialColourReader = createPostgresMaterialColourReader({ pool });

    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const materials = createMaterialService({ materialStore, clock, nextId });
    const materialColours = createMaterialColourService({ store: materialColourStore, clock, nextId });
    const materialColourQuery = createMaterialColourQueryService({ reader: materialColourReader, clock });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-mcd', type: 'brand', name: 'Material Colour Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-mcd', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-sales', 'owner-user', createMembership({ id: 'membership-sales', organisationId: 'brand-mcd', organisationType: 'brand', userId: 'sales-user', role: 'sales', createdAt: clock() }));
    await platform.grantMembership('member-quality', 'owner-user', createMembership({ id: 'membership-quality', organisationId: 'brand-mcd', organisationType: 'brand', userId: 'quality-user', role: 'quality', createdAt: clock() }));

    const materialDraft = await materials.createMaterial('material-create', 'owner-user', {
      code: 'FAB-MCD-1', brandId: 'brand-mcd', name: 'Shell fabric', type: 'fabric', unit: 'm',
      supplierName: 'Mill Colour', supplierReference: 'SHELL-1', composition: '100% polyester', color: 'placeholder',
      currency: 'EUR', unitCost: 8, minimumOrderQuantity: 100, availableQuantity: 1000,
    });
    const material = await materials.publishMaterial('material-publish', 'owner-user', materialDraft.code, { expectedVersion: materialDraft.version });

    // the catalog-managing sales role adds the colour, from the real colour.colour dictionary
    const colour = await materialColours.addMaterialColour('colour-add', 'sales-user', {
      materialCode: material.code, colourCode: 'burgundy', supplierColourReference: 'MILL-REF-09',
    });
    assert.equal(colour.colourCode, 'BURGUNDY');
    assert.equal(colour.colourEntryId, 'mdm-entry:colour-colour:burgundy');

    // a role without CATALOG_MANAGE on this brand (quality) cannot add a colour
    await assert.rejects(
      materialColours.addMaterialColour('colour-add-denied', 'quality-user', { materialCode: material.code, colourCode: 'charcoal' }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    // a code outside the governed dictionary is refused, not accepted as free text
    await assert.rejects(
      materialColours.addMaterialColour('colour-add-fake', 'sales-user', { materialCode: material.code, colourCode: 'INVENTED_SHADE' }),
      (error) => error.code === 'MATERIAL_COLOUR_NOT_IN_DICTIONARY',
    );

    const persistedColour = await pool.query('SELECT colour_code, colour_entry_id, supplier_colour_reference FROM material_colours WHERE id = $1', [colour.id]);
    assert.deepEqual(persistedColour.rows[0], {
      colour_code: 'BURGUNDY', colour_entry_id: 'mdm-entry:colour-colour:burgundy', supplier_colour_reference: 'MILL-REF-09',
    });

    // the request -> submit -> decide (approved) path
    const dip = await materialColours.requestLabDip('dip-request', 'sales-user', {
      materialColourId: colour.id, dipReference: 'DIP-001', supplierCode: 'MILL-COLOUR',
      validFrom: '2026-09-01T00:00:00.000Z', validTo: '2027-03-01T00:00:00.000Z', notes: 'First round',
    });
    assert.equal(dip.status, 'requested');

    // quality cannot submit on the catalog's behalf... but submission is itself a quality-gated step
    await assert.rejects(
      materialColours.submitLabDip('dip-submit-denied', 'sales-user', dip.id, { expectedVersion: dip.version }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const submitted = await materialColours.submitLabDip('dip-submit', 'quality-user', dip.id, { expectedVersion: dip.version });
    assert.equal(submitted.status, 'submitted');
    assert.equal(submitted.submissionRound, 1);

    // an approval without a note is accepted (only conditional/rejection verdicts require one)
    const approved = await materialColours.decideLabDip('dip-decide', 'quality-user', dip.id, { expectedVersion: submitted.version, verdict: 'approved' });
    assert.equal(approved.status, 'approved');

    // a conditional approval without a note is refused by the domain
    const secondColour = await materialColours.addMaterialColour('colour-add-2', 'sales-user', { materialCode: material.code, colourCode: 'charcoal' });
    const secondDip = await materialColours.requestLabDip('dip-request-2', 'sales-user', { materialColourId: secondColour.id, dipReference: 'DIP-002', supplierCode: 'MILL-COLOUR' });
    const secondSubmitted = await materialColours.submitLabDip('dip-submit-2', 'quality-user', secondDip.id, { expectedVersion: secondDip.version });
    await assert.rejects(
      materialColours.decideLabDip('dip-decide-no-note', 'quality-user', secondDip.id, { expectedVersion: secondSubmitted.version, verdict: 'conditionally_approved' }),
      (error) => error.code === 'LAB_DIP_DECISION_NOTE_REQUIRED',
    );
    const conditionallyApproved = await materialColours.decideLabDip('dip-decide-2', 'quality-user', secondDip.id, {
      expectedVersion: secondSubmitted.version, verdict: 'conditionally_approved', note: 'Acceptable with a tighter shade tolerance',
    });
    assert.equal(conditionallyApproved.status, 'conditionally_approved');

    // the request -> cancel path, on a third colour
    const thirdColour = await materialColours.addMaterialColour('colour-add-3', 'sales-user', { materialCode: material.code, colourCode: 'off_white' });
    const thirdDip = await materialColours.requestLabDip('dip-request-3', 'sales-user', { materialColourId: thirdColour.id, dipReference: 'DIP-003', supplierCode: 'MILL-COLOUR' });
    const cancelled = await materialColours.cancelLabDip('dip-cancel', 'quality-user', thirdDip.id, { expectedVersion: thirdDip.version, reason: 'Colour dropped from the range' });
    assert.equal(cancelled.status, 'cancelled');

    // the palette read model carries both approved colours as effective standards, and the cancelled one as blocked
    const palette = await materialColourQuery.materialPaletteForActor('owner-user', material.code);
    const byCode = Object.fromEntries(palette.map((row) => [row.colourCode, row]));
    assert.equal(byCode.BURGUNDY.effectiveStandard.status, 'approved');
    assert.equal(byCode.BURGUNDY.approvedForBulk, true);
    assert.equal(byCode.CHARCOAL.effectiveStandard.status, 'conditionally_approved');
    assert.equal(byCode.CHARCOAL.approvedForBulk, true);
    assert.equal(byCode.OFF_WHITE.effectiveStandard, null);
    assert.equal(byCode.OFF_WHITE.approvedForBulk, false);
    assert.equal(byCode.OFF_WHITE.labDips[0].status, 'cancelled');
  } finally {
    await pool.end();
  }
});
