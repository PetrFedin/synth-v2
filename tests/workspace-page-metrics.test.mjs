import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalMetrics } from '../src/runtime/operational-metrics.mjs';

test('workspace bootstrap and section pages share one bounded metrics route group', async () => {
  const metrics = createOperationalMetrics({ clock: () => 1_700_000_000_000 });
  metrics.recordHttp({ method: 'GET', pathname: '/v2/workspace', status: 200, durationMs: 10 });
  metrics.recordHttp({ method: 'GET', pathname: '/v2/workspace/orders/page', status: 200, durationMs: 20 });
  metrics.recordHttp({ method: 'GET', pathname: '/v2/workspace/customer-controlled-value/page', status: 400, durationMs: 5 });

  const output = await metrics.render();
  assert.match(output, /syntha_http_requests_total\{method="GET",route_group="workspace",status="200"\} 2/);
  assert.match(output, /syntha_http_requests_total\{method="GET",route_group="workspace",status="400"\} 1/);
  assert.doesNotMatch(output, /customer-controlled-value|route_group="other-v2"/);
});
