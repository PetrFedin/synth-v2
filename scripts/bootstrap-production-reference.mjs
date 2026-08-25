import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { bootstrapProductionAcceptanceReferences } from '../src/acceptance/production-reference-bootstrap.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

try {
  await migratePostgres({ pool, migrationsDir });
  const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
  const references = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform });
  process.stdout.write(`${JSON.stringify({
    status: 'ready',
    brandId: references.brand.id,
    shopId: references.shop.id,
    actors: references.actors,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
