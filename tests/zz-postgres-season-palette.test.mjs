import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createSeasonPaletteService } from '../src/application/season-palette-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresSeasonPaletteStore } from '../src/infrastructure/postgres-season-palette-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { bootstrapMdmReference } from '../src/infrastructure/mdm-reference-bootstrap.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// Таблица была заведена (миграция 128) и наполнялась (`scripts/seed-demo.mjs`), но за ней не стояло
// ни одного Postgres-теста — только доменный юнит-тест на чистую функцию. Этот тест — первый, кто
// проходит настоящий цикл сервис → стор → реальная база, включая закрепление версии справочника и
// обе уникальности (цвет и позиция).
test('PostgreSQL season colour palette pins a governed colour version, orders by position and rejects duplicates', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-09-01T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const colourDataset = JSON.parse(await readFile(path.join(root, 'mdm', 'reference', 'russia-fashion-colour-core.json'), 'utf8'));
    await bootstrapMdmReference({ pool, datasets: [colourDataset] });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const paletteStore = createPostgresSeasonPaletteStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const palette = createSeasonPaletteService({ store: paletteStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-palette', type: 'brand', name: 'Palette Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-palette', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-viewer', 'owner-user', createMembership({ id: 'membership-viewer', organisationId: 'brand-palette', organisationType: 'brand', userId: 'viewer-user', role: 'viewer', createdAt: clock() }));
    const campaign = await platform.createCampaign('campaign-create', 'owner-user', { brandId: 'brand-palette', name: 'SS27', season: 'SS27', startsAt: clock(), endsAt: clock() });

    await assert.rejects(() => palette.addColourToSeason('bad-colour', 'owner-user', campaign.id, { colourCode: 'NOT_A_COLOUR', position: 1 }), { code: 'SEASON_PALETTE_COLOUR_UNKNOWN' });

    const first = await palette.addColourToSeason('add-midnight', 'owner-user', campaign.id, { colourCode: 'MIDNIGHT_NAVY', position: 1 });
    assert.equal(first.colourCode, 'MIDNIGHT_NAVY');
    assert.equal(first.colourEntryVersion, 1);
    assert.equal(first.position, 1);
    const second = await palette.addColourToSeason('add-jet', 'owner-user', campaign.id, { colourCode: 'JET_BLACK', position: 2 });
    assert.equal(second.position, 2);

    // Тот же цвет второй раз — отказ; та же позиция другим цветом — тоже отказ.
    await assert.rejects(() => palette.addColourToSeason('dupe-colour', 'owner-user', campaign.id, { colourCode: 'MIDNIGHT_NAVY', position: 3 }), { code: 'SEASON_PALETTE_ENTRY_EXISTS' });
    await assert.rejects(() => palette.addColourToSeason('dupe-position', 'owner-user', campaign.id, { colourCode: 'OFF_WHITE', position: 1 }), { code: 'SEASON_PALETTE_ENTRY_EXISTS' });

    // A viewer can read the palette (checked below) but has no commercial-cycle capability to add to it.
    await assert.rejects(() => palette.addColourToSeason('deny-viewer', 'viewer-user', campaign.id, { colourCode: 'OFF_WHITE', position: 3 }), { code: 'CAPABILITY_DENIED' });

    // Чтение доступно любому члену бренда, включая наблюдателя.
    const read = await palette.getSeasonPaletteForActor('viewer-user', campaign.id);
    assert.equal(read.colours.length, 2);
    assert.deepEqual(read.colours.map((item) => item.colourCode), ['MIDNIGHT_NAVY', 'JET_BLACK']);
  } finally { await pool.end(); }
});
