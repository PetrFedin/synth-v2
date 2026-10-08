-- One-shot SLA breach checkpoint for the Operational Exception authority.
-- A due exception may be escalated automatically exactly once for its current SLA deadline.
-- Idempotency is state-based under row lock: once sla_breached_at is set, future worker polls skip it.

ALTER TABLE operational_exceptions
  ADD COLUMN IF NOT EXISTS sla_breached_at timestamptz;

UPDATE operational_exceptions
   SET payload = jsonb_set(payload, '{slaBreachedAt}', 'null'::jsonb, true)
 WHERE NOT (payload ? 'slaBreachedAt');

CREATE INDEX IF NOT EXISTS operational_exceptions_unbreached_due_idx
  ON operational_exceptions (due_at, id)
  WHERE state IN ('open','assigned','waiting_for_role','waiting_for_document','escalated')
    AND sla_breached_at IS NULL;

COMMENT ON COLUMN operational_exceptions.sla_breached_at IS
  'First confirmed SLA deadline breach. Set transactionally with automatic escalation; never reset by later lifecycle transitions.';
