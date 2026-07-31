import { invariant } from '../core/errors.mjs';
import { inspectPostgresMigrations } from '../infrastructure/postgres-migrator.mjs';

export function createPostgresReadinessService({ pool, migrationsDir, clock = () => new Date().toISOString() } = {}) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  invariant(migrationsDir, 'MIGRATIONS_DIR_REQUIRED', 'Migrations directory is required');
  return Object.freeze({
    async check() {
      const checkedAt = clock();
      try {
        await pool.query('SELECT 1');
      } catch {
        return notReady({ checkedAt, database: 'unavailable', migrationStatus: 'unknown', reason: 'database-unavailable' });
      }
      try {
        const inspection = await inspectPostgresMigrations({ pool, migrationsDir });
        const ready = inspection.pending.length === 0 && inspection.mismatched.length === 0 && inspection.unknown.length === 0;
        return Object.freeze({
          status: ready ? 'ready' : 'not-ready',
          service: 'syntha-wholesale-v2',
          checkedAt,
          database: Object.freeze({ status: 'available' }),
          migrations: Object.freeze({ status: ready ? 'current' : 'drift', ...inspection }),
          ...(ready ? {} : { reason: 'migration-drift' }),
        });
      } catch {
        return notReady({ checkedAt, database: 'available', migrationStatus: 'inspection-failed', reason: 'migration-inspection-failed' });
      }
    },
  });
}

function notReady({ checkedAt, database, migrationStatus, reason }) {
  return Object.freeze({
    status: 'not-ready',
    service: 'syntha-wholesale-v2',
    checkedAt,
    reason,
    database: Object.freeze({ status: database }),
    migrations: Object.freeze({
      status: migrationStatus,
      totalCount: 0,
      appliedCount: 0,
      pending: Object.freeze([]),
      mismatched: Object.freeze([]),
      unknown: Object.freeze([]),
    }),
  });
}
