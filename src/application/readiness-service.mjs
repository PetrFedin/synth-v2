import { invariant } from '../core/errors.mjs';
import { inspectPostgresMigrations } from '../infrastructure/postgres-migrator.mjs';

export function createPostgresReadinessService({
  pool,
  migrationsDir,
  clock = () => new Date().toISOString(),
  operationalCheck,
  migrationInspector = inspectPostgresMigrations,
} = {}) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  invariant(migrationsDir, 'MIGRATIONS_DIR_REQUIRED', 'Migrations directory is required');
  invariant(operationalCheck === undefined || typeof operationalCheck === 'function', 'READINESS_OPERATIONAL_CHECK_INVALID', 'Operational readiness check must be a function');
  invariant(typeof migrationInspector === 'function', 'READINESS_MIGRATION_INSPECTOR_INVALID', 'Migration inspector must be a function');
  return Object.freeze({
    async check() {
      const checkedAt = clock();
      try {
        await pool.query('SELECT 1');
      } catch {
        return notReady({ checkedAt, database: 'unavailable', migrationStatus: 'unknown', reason: 'database-unavailable' });
      }
      try {
        const inspection = await migrationInspector({ pool, migrationsDir });
        const migrationsReady = inspection.pending.length === 0
          && inspection.mismatched.length === 0
          && inspection.unknown.length === 0
          && (inspection.missingIndexes?.length ?? 0) === 0
          && (inspection.invalidIndexes?.length ?? 0) === 0;
        if (!migrationsReady) {
          return Object.freeze({
            status: 'not-ready',
            service: 'syntha-wholesale-v2',
            checkedAt,
            reason: 'migration-drift',
            database: Object.freeze({ status: 'available' }),
            migrations: Object.freeze({ status: 'drift', ...inspection }),
          });
        }
        const operational = operationalCheck ? await safeOperationalCheck(operationalCheck) : undefined;
        const ready = !operational || operational.status === 'ready';
        return Object.freeze({
          status: ready ? 'ready' : 'not-ready',
          service: 'syntha-wholesale-v2',
          checkedAt,
          database: Object.freeze({ status: 'available' }),
          migrations: Object.freeze({ status: 'current', ...inspection }),
          ...(operational ? { runtime: operational } : {}),
          ...(ready ? {} : { reason: operational.reason ?? 'operational-dependency-unavailable' }),
        });
      } catch {
        return notReady({ checkedAt, database: 'available', migrationStatus: 'inspection-failed', reason: 'migration-inspection-failed' });
      }
    },
  });
}

async function safeOperationalCheck(check) {
  try {
    const result = await check();
    if (!result || !['ready', 'not-ready'].includes(result.status)) {
      return Object.freeze({ status: 'not-ready', reason: 'invalid-operational-check' });
    }
    return freezeCopy(result);
  } catch {
    return Object.freeze({ status: 'not-ready', reason: 'operational-check-failed' });
  }
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

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, freezeCopy(nested)]));
  }
  return value;
}
