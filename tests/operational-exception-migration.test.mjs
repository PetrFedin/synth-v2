import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../db/migrations/176_operational_exception_sla.sql', import.meta.url), 'utf8');

test('operational exception migration persists SLA, lifecycle and immutable transition authority', () => {
  for (const fragment of [
    'operational_sla_policies',
    'operational_exceptions',
    'operational_exception_transitions',
    'operational_exception_commands',
    "'operational-exception'",
    'accepted_risk_decision_id',
    'calendar_milestone_id',
    'operational_exceptions_active_dedupe_idx',
    'prevent_operational_exception_transition_mutation',
    'prevent_operational_sla_policy_mutation',
    'validate_operational_exception_calendar_link',
  ]) assert.ok(sql.includes(fragment), fragment);
});

test('active exception dedupe survives resolution/risk acceptance until explicit close', () => {
  assert.match(sql, /WHERE state <> 'closed'/);
});

test('calendar linkage reconciles the exception deadline instead of creating a second calendar authority', () => {
  assert.match(sql, /milestone_starts <> NEW\.due_at/);
  assert.match(sql, /milestone_owner <> NEW\.owner_organisation_id/);
});


const breachSql = await readFile(new URL('../db/migrations/177_operational_exception_sla_breach.sql', import.meta.url), 'utf8');

test('SLA breach migration adds a one-shot due checkpoint without a second queue', () => {
  assert.match(breachSql, /ADD COLUMN IF NOT EXISTS sla_breached_at timestamptz/);
  assert.match(breachSql, /operational_exceptions_unbreached_due_idx/);
  assert.match(breachSql, /sla_breached_at IS NULL/);
  assert.doesNotMatch(breachSql, /CREATE TABLE[^;]*queue/i);
});
