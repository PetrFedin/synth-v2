import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = await readFile(path.join(root, 'db', 'migrations', '017_measurement_charts.sql'), 'utf8');
const store = await readFile(path.join(root, 'src', 'infrastructure', 'postgres-measurement-store.mjs'), 'utf8');

test('Measurement migration defines one governed aggregate, immutable revisions and normalized matrix tables', () => {
  for (const table of ['measurement_charts', 'measurement_chart_revisions', 'measurement_chart_sizes', 'measurement_points', 'measurement_values']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i'), table);
  }
  for (const fragment of [
    'sku text NOT NULL UNIQUE REFERENCES catalog_skus(sku)',
    'sku_version integer NOT NULL CHECK (sku_version > 0)',
    "status text NOT NULL CHECK (status IN ('draft', 'published'))",
    "unit text NOT NULL CHECK (unit IN ('cm', 'in'))",
    'measurement_charts_publication_state_check',
    'measurement_charts_time_order_check',
    'PRIMARY KEY (chart_id, revision_version)',
    'UNIQUE (sku, revision_version)',
    'measurement_chart_revisions_published_payload_check',
    'measurement_chart_revisions_time_order_check',
    'PRIMARY KEY (chart_id, size_code)',
    'PRIMARY KEY (chart_id, point_code)',
    'PRIMARY KEY (chart_id, point_code, size_code)',
    'FOREIGN KEY (chart_id, point_code)',
    'FOREIGN KEY (chart_id, size_code)',
    'measurement_charts_brand_status_sku_idx',
    'measurement_chart_revisions_sku_version_idx',
    'measurement_values_size_idx',
  ]) assert.ok(sql.includes(fragment), fragment);
});

test('Measurement matrix precision and cardinality are bounded in the database', () => {
  assert.match(sql, /position integer NOT NULL CHECK \(position > 0 AND position <= 50\)/);
  assert.match(sql, /position integer NOT NULL CHECK \(position > 0 AND position <= 300\)/);
  assert.match(sql, /value numeric\(20, 4\) NOT NULL CHECK \(value > 0\)/);
  assert.match(sql, /tolerance_minus numeric\(20, 4\) NOT NULL CHECK \(tolerance_minus >= 0\)/);
  assert.match(sql, /tolerance_plus numeric\(20, 4\) NOT NULL CHECK \(tolerance_plus >= 0\)/);
  assert.match(sql, /UNIQUE \(chart_id, position\)/);
});

test('published revision archive is written before optimistic current-state replacement', () => {
  const archive = store.indexOf('async archiveMeasurementRevision');
  const save = store.indexOf('async saveMeasurement');
  assert.ok(archive >= 0 && archive < save);
  assert.match(store, /INSERT INTO measurement_chart_revisions[\s\S]*?VALUES \(\$1, \$2, \$3, \$4, \$5, \$6::jsonb, \$7::timestamptz, \$8::timestamptz\)/);
  assert.match(store, /chart\?\.status === 'published'/);
  assert.match(store, /MEASUREMENT_REVISION_ALREADY_ARCHIVED/);
});
