import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('server wires protected metrics into HTTP, workers and maintenance', async () => {
  const server = await source('src/server.mjs');
  for (const fragment of [
    "createOperationalMetrics({",
    "createOperationalMetricsHandler({ next: applicationHandler, metrics: operationalMetrics })",
    "booleanSetting('SYNTHA_METRICS_ENABLED', false)",
    "secretSetting('SYNTHA_METRICS_TOKEN')",
    "integerSetting('SYNTHA_METRICS_CACHE_TTL_MS', 5_000, 100, 60_000)",
    "operationalMetrics.recordWorkerBatch('notification-projection', results)",
    "operationalMetrics.recordWorkerBatch('outbox-publication', results)",
    'operationalMetrics.recordMaintenance(maintenance)',
    "operationalMetrics.registerWorker('notification-projection'",
    "operationalMetrics.registerWorker('outbox-publication'",
  ]) assert.match(server, new RegExp(escapeRegExp(fragment)));

  assert.match(server, /SYNTHA_METRICS_TOKEN is required when SYNTHA_METRICS_ENABLED is true/);
});

test('metrics configuration and operations documentation stay deployable', async () => {
  const [environment, documentation, alerts] = await Promise.all([
    source('.env.example'),
    source('docs/observability.md'),
    source('ops/prometheus/syntha-v2-alerts.yml'),
  ]);

  assert.match(environment, /SYNTHA_METRICS_ENABLED=false/);
  assert.match(environment, /SYNTHA_METRICS_TOKEN=/);
  assert.match(environment, /SYNTHA_METRICS_CACHE_TTL_MS=5000/);
  assert.match(documentation, /No actor id, organisation id, order id, SKU, request id, raw URL/);
  assert.match(documentation, /credentials_file: \/run\/secrets\/syntha_metrics_token/);
  assert.match(alerts, /alert: SynthaMetricsPostgresCollectorDown/);
  assert.match(alerts, /alert: SynthaOutboxDeadLettersPresent/);
  assert.match(alerts, /alert: SynthaHttpServerErrorRateHigh/);
  assert.match(alerts, /alert: SynthaHttpP95LatencyHigh/);
  assert.doesNotMatch(alerts, /credentials:|SYNTHA_METRICS_TOKEN|Bearer [A-Za-z0-9_-]{16,}/);
});

test('metrics source has a bounded label contract and no raw request labels', async () => {
  const metrics = await source('src/runtime/operational-metrics.mjs');
  assert.match(metrics, /const WORKER_OUTCOMES = new Set\(\[/);
  assert.match(metrics, /function classifyRoute\(pathname\)/);
  assert.match(metrics, /route_group/);
  assert.doesNotMatch(metrics, /organisation_id|actor_id|request_id|email/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
