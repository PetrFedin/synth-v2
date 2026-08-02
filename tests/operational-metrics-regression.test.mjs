import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalMetrics } from '../src/runtime/operational-metrics.mjs';

test('maintenance statuses serialize as bounded Prometheus labels', async () => {
  const metrics = createOperationalMetrics({ clock: () => 1_700_000_000_000 });
  metrics.recordMaintenance({ status: 'completed', counts: { commands: 2, sessions: 3 } });
  metrics.recordMaintenance({ status: 'unexpected-customer-value', counts: {} });

  const output = await metrics.render();
  assert.match(output, /syntha_maintenance_runs_total\{status="completed"\} 1/);
  assert.match(output, /syntha_maintenance_runs_total\{status="unknown"\} 1/);
  assert.match(output, /syntha_maintenance_deleted_records_total 5/);
  assert.doesNotMatch(output, /unexpected-customer-value/);
});

test('known projection no-op remains an explicit bounded worker outcome', async () => {
  const metrics = createOperationalMetrics({ clock: () => 1_700_000_000_000 });
  metrics.recordWorkerBatch('notification-projection', [{ status: 'already-projected' }]);

  const output = await metrics.render();
  assert.match(output, /syntha_worker_results_total\{worker="notification-projection",outcome="already-projected"\} 1/);
});
