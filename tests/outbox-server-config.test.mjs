import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await readFile(path.join(root, 'src', 'server.mjs'), 'utf8');

test('webhook secret bytes are preserved exactly instead of being trimmed', () => {
  assert.match(server, /const outboxWebhookSecret = secretSetting\('SYNTHA_OUTBOX_WEBHOOK_SECRET'\)/);
  assert.doesNotMatch(server, /SYNTHA_OUTBOX_WEBHOOK_SECRET[^\n]*\.trim\(/);
  assert.match(server, /return raw === undefined \|\| raw\.length === 0 \? undefined : raw/);
});

test('server rejects a lease that cannot cover one serial aggregate batch', () => {
  assert.match(server, /OUTBOX_LEASE_SAFETY_MARGIN_MS = 1_000/);
  assert.match(server, /settings\.outboxWebhookTimeoutMs \* settings\.outboxPublicationBatchSize/);
  assert.match(server, /settings\.outboxPublicationLeaseMs <= requiredOutboxLeaseMs/);
  assert.match(server, /must exceed \$\{requiredOutboxLeaseMs\}ms/);
});

test('webhook URL and secret remain an all-or-nothing configuration pair', () => {
  assert.match(server, /Boolean\(outboxWebhookUrl\) !== Boolean\(outboxWebhookSecret\)/);
  assert.match(server, /SYNTHA_OUTBOX_WEBHOOK_URL and SYNTHA_OUTBOX_WEBHOOK_SECRET must be configured together/);
});
