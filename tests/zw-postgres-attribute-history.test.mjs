import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-21T09:00:00.000Z';

test('The attribute history reports real edits, names their author, and invents nothing', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const brandId = 'brand-attribute-history';
  const styleId = 'style-attribute-history';
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await pool.query(
      `INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb)`,
      [brandId, JSON.stringify({ id: brandId, type: 'brand', name: 'Attribute History Brand' })],
    );
    for (const [id, name] of [['author-one', 'Вера Первая'], ['author-two', 'Павел Второй']]) {
      await pool.query(
        `INSERT INTO auth_users (id, email, email_normalized, display_name, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, lower($2), $3, 'x', 'active', $4, $4)`,
        [id, `${id}@example.test`, name, now],
      );
    }

    await pool.query(
      `INSERT INTO product_styles (id, brand_id, style_code, lifecycle_status, version, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, 'STYLE-HISTORY', 'draft', 1, $3, 'author-one', $3, 'author-one')`,
      [styleId, brandId, now],
    );

    // Creation is one event, not a hundred attribute changes: there is no "before" to report.
    const afterCreate = await pool.query('SELECT count(*)::int AS n FROM object_attribute_history_workspace WHERE subject_id = $1', [styleId]);
    assert.equal(afterCreate.rows[0].n, 0, 'creating an object must not read as a hundred edits');

    await pool.query(
      // The style code is immutable and the database says so, which is why only the lifecycle
      // moves here: this test reports what a real edit looks like, not what an impossible one would.
      `UPDATE product_styles SET lifecycle_status = 'in_development',
              version = 2, updated_at = $2, updated_by = 'author-two' WHERE id = $1`,
      [styleId, now],
    );

    const changes = await pool.query(
      `SELECT attribute, payload ->> 'before' AS before, payload ->> 'after' AS after, payload ->> 'actorName' AS actor
         FROM object_attribute_history_workspace WHERE subject_id = $1 ORDER BY attribute`,
      [styleId],
    );
    const byAttribute = Object.fromEntries(changes.rows.map((row) => [row.attribute, row]));
    assert.deepEqual(Object.keys(byAttribute), ['lifecycle_status'],
      'exactly the edited column, and none of the bookkeeping ones');
    assert.equal(byAttribute.lifecycle_status.before, 'draft');
    assert.equal(byAttribute.lifecycle_status.after, 'in_development');
    // The row records who wrote it, so the audit trail can say who: an audit without a "who" is
    // half an audit.
    assert.equal(byAttribute.lifecycle_status.actor, 'Павел Второй');

    // A write that changes nothing a reader cares about must not appear at all.
    await pool.query(`UPDATE product_styles SET version = 3, updated_at = $2 WHERE id = $1`, [styleId, now]);
    const afterNoop = await pool.query('SELECT count(*)::int AS n FROM object_attribute_history_workspace WHERE subject_id = $1', [styleId]);
    assert.equal(afterNoop.rows[0].n, 1, 'a bump of the optimistic version is not an attribute change');

    // Only the brand that owns the object may read its history. The view carries the brand and the
    // reader joins memberships against it; here we assert the brand is carried, which is what makes
    // that join possible.
    const scoped = await pool.query('SELECT DISTINCT brand_id FROM object_attribute_history_workspace WHERE subject_id = $1', [styleId]);
    assert.deepEqual(scoped.rows.map((row) => row.brand_id), [brandId]);
  } finally {
    await pool.end();
  }
});
