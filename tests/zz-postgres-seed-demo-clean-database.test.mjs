// Сид демонстрации на ЧИСТОЙ базе: bootstrap-owner → bootstrap-mdm-reference →
// bootstrap-production-reference → seed-demo, затем второй запуск сида.
//
// Приёмочный прогон нашёл три дефекта, и тест красный на каждом из них:
//   * на чистой базе сид не заводил поставщика и молча пропускал спрос, RFQ, портал и всё, что
//     стоит на поставщике;
//   * повторный запуск падал TECH_PACK_ACKNOWLEDGEMENT_REQUIRED на размещении, потому что сид не
//     готовил техпак, подтверждённый фабрикой (образец PPS, таблица мер, выпуск, подтверждение);
//   * bootstrap-production-reference читал только DATABASE_URL, а не SYNTHA_V2_DATABASE_URL.
//
// Скрипты идут дочерними процессами, ровно как их запускает человек: только с
// SYNTHA_V2_DATABASE_URL, без DATABASE_URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresTestPool } from './postgres-test-pool.mjs';
import { createPostgresAwaitingActionReader } from '../src/infrastructure/postgres-awaiting-action-reader.mjs';
import { createAwaitingActionQueryService } from '../src/application/awaiting-action-query-service.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a clean database seeds a qualified supplier, portal access and the demand-to-production-order chain, and a second run is idempotent', { skip: !databaseUrl, timeout: 600_000 }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 2 });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const env = {
      ...process.env,
      SYNTHA_V2_DATABASE_URL: databaseUrl,
      DATABASE_URL: '',
      SYNTHA_BOOTSTRAP_EMAIL: 'owner@syntha.local',
      SYNTHA_BOOTSTRAP_PASSWORD: 'local-owner-password-2026',
    };
    const run = (script) => {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      assert.equal(result.status, 0, `${script} failed:\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    run('bootstrap-owner.mjs');
    run('bootstrap-mdm-reference.mjs');
    run('bootstrap-production-reference.mjs');

    const first = run('seed-demo.mjs');
    assert.doesNotMatch(first, /no qualified supplier|нет квалифицированного поставщика/);
    const supplier = (await pool.query("SELECT supplier_code, status, email FROM (SELECT supplier_code, status, payload ->> 'email' AS email FROM suppliers) AS s")).rows;
    assert.deepEqual(supplier, [{ supplier_code: 'ATM-FAC', status: 'qualified', email: 'rep@atmosphere.example' }]);
    const grants = await pool.query("SELECT status FROM supplier_portal_grants WHERE supplier_code = 'ATM-FAC' AND invited_email = 'rep@atmosphere.example'");
    assert.deepEqual(grants.rows.map((row) => row.status), ['active']);
    const rfq = (await pool.query("SELECT status FROM sourcing_rfqs WHERE rfq_code = 'RFQ-DEMAND-001'")).rows;
    assert.deepEqual(rfq.map((row) => row.status), ['allocated']);
    const order = (await pool.query("SELECT status, lineage_version, supplier_code FROM production_orders WHERE production_order_number = 'PO-DEMAND-001'")).rows;
    assert.deepEqual(order, [{ status: 'confirmed', lineage_version: 2, supplier_code: 'ATM-FAC' }]);
    const techPack = (await pool.query("SELECT status FROM tech_packs WHERE supplier_code = 'ATM-FAC'")).rows;
    assert.deepEqual(techPack.map((row) => row.status), ['acknowledged']);
    const schedule = (await pool.query("SELECT jsonb_array_length(payload -> 'milestones') AS milestones FROM payment_schedules WHERE production_order_number = 'PO-DEMAND-001'")).rows;
    assert.deepEqual(schedule.map((row) => row.milestones), [4]);

    // «Ждёт вас» у ролей после сида: приёмка и демонстрация показывают живые дела, а не пустой экран.
    const firstAwaiting = await awaitingByRole(pool);
    assert.ok(firstAwaiting.owner['rfq-award'] >= 1, 'owner: choose a supplier on a quoted RFQ');
    assert.ok(firstAwaiting.owner.total >= 1);
    assert.ok(firstAwaiting.quality['material-lot-release'] >= 1, 'quality: a lot in quarantine');
    assert.ok(firstAwaiting.quality['lab-dip-decision'] >= 1, 'quality: a lab dip on a decision');
    assert.ok(firstAwaiting.finance['compliance-document-issue'] >= 1, 'finance: a draft compliance document');
    assert.ok(firstAwaiting.buyer['order-amendment-response'] >= 1, 'buyer: an order amendment waits for the shop');
    // Правка, которую байеру предлагают принять, лежит на заказе без начатой экономики и исполнения:
    // иначе «Принять» отвечало бы 422 ORDER_AMENDMENT_ECONOMICS_STARTED, а дело оставалось бы в «Ждёт вас».
    const pending = (await pool.query(
      `SELECT ord.id, ord.execution_started_at,
              (SELECT count(*)::int FROM supply_commitment_snapshots WHERE order_id = ord.id) AS supply,
              (SELECT count(*)::int FROM actual_cost_ledger_entries WHERE order_id = ord.id) AS costs
         FROM order_amendments amendment JOIN orders ord ON ord.id = amendment.order_id WHERE amendment.status = 'proposed'`,
    )).rows;
    assert.equal(pending.length, 1);
    assert.deepEqual([pending[0].execution_started_at, pending[0].supply, pending[0].costs], [null, 0, 0], 'the amendment can still be accepted');
    const buyerItem = await awaitingItem(pool, 'buyer@nordhaus.example', 'order-amendment-response');
    assert.equal(buyerItem.detail.acceptBlock, null, 'the buyer is offered an amendment that can be accepted');
    const money = (await pool.query('SELECT count(*)::int AS count FROM margin_actualization_snapshots')).rows[0].count;
    assert.ok(money >= 1, 'the order with the money chain keeps its economics');
    assert.equal(firstAwaiting.viewer.total, 0, 'a role without the capabilities is offered nothing');

    const before = await counts(pool);
    const second = run('seed-demo.mjs');
    assert.match(second, /PO-DEMAND-001 уже вырос из потребности/);
    assert.deepEqual(await counts(pool), before, 'a second run must not add suppliers, RFQs, orders, tech packs, samples, grants or pending work');
    assert.deepEqual(await awaitingByRole(pool), firstAwaiting, 'a second run keeps the same pending work and adds none');
  } finally {
    await pool.end();
  }
});

async function counts(pool) {
  const tables = ['suppliers', 'sourcing_rfqs', 'production_orders', 'tech_packs', 'samples', 'measurement_charts', 'supplier_portal_grants', 'production_requirement_snapshots', 'payment_schedules', 'material_lots', 'lab_dips', 'material_colours', 'compliance_documents', 'legal_entities', 'order_amendments'];
  const result = {};
  for (const table of tables) result[table] = (await pool.query(`SELECT count(*)::integer AS count FROM ${table}`)).rows[0].count;
  return result;
}

async function awaitingByRole(pool) {
  const service = createAwaitingActionQueryService({ reader: createPostgresAwaitingActionReader({ pool }) });
  const result = {};
  for (const [role, email] of [['owner', 'owner@syntha.local'], ['quality', 'quality@syntha.local'], ['finance', 'finance@syntha.local'], ['buyer', 'buyer@nordhaus.example'], ['viewer', 'viewer@syntha.local']]) {
    const actorId = (await pool.query('SELECT id FROM auth_users WHERE email_normalized = $1', [email])).rows[0].id;
    const view = await service.forActor(actorId, { limit: 200 });
    result[role] = { total: view.total, ...Object.fromEntries(Object.entries(view.counts).filter(([, value]) => value.count > 0).map(([type, value]) => [type, value.count])) };
  }
  return result;
}

async function awaitingItem(pool, email, type) {
  const service = createAwaitingActionQueryService({ reader: createPostgresAwaitingActionReader({ pool }) });
  const actorId = (await pool.query('SELECT id FROM auth_users WHERE email_normalized = $1', [email])).rows[0].id;
  return (await service.forActor(actorId, { limit: 200 })).items.find((item) => item.type === type);
}
