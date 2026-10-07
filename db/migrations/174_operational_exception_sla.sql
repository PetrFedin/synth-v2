-- Operational Exception + SLA authority.
-- One persisted exception lifecycle, immutable transition history, versioned SLA policy snapshots,
-- Decision Ledger binding for accepted risk, Awaiting Action projection, and optional Calendar deadline linkage.

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN (
    'wholesale','catalog','notification','product-identity','product-readiness',
    'legal-entity','material-sourcing','compliance-document','product-certification',
    'product-engineering','operational-collaboration','operational-exception'
  ));

CREATE TABLE IF NOT EXISTS operational_exception_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT operational_exception_commands_command_registry_fk
    FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS operational_exception_commands_completed_idx
  ON operational_exception_commands (completed_at, id);

CREATE TABLE IF NOT EXISTS operational_sla_policies (
  id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  owner_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  status text NOT NULL CHECK (status IN ('active','retired')),
  response_minutes integer NOT NULL CHECK (response_minutes > 0),
  resolution_minutes integer NOT NULL CHECK (resolution_minutes >= response_minutes),
  escalation_minutes integer NOT NULL CHECK (escalation_minutes > 0 AND escalation_minutes <= resolution_minutes),
  applicability jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS operational_sla_policies_status_idx
  ON operational_sla_policies (owner_organisation_id, id, status, version DESC);
CREATE INDEX IF NOT EXISTS operational_sla_policies_owner_idx
  ON operational_sla_policies (owner_organisation_id, status, id, version DESC);

CREATE TABLE IF NOT EXISTS operational_exceptions (
  id text PRIMARY KEY,
  owner_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 3 AND 500),
  entity_type text NOT NULL CHECK (entity_type IN (
    'collection','product-style','style-version','colorway','product-sku','bom','bom-line',
    'measurement-chart','sample','tech-pack','sourcing-rfq','material-rfq','material-purchase-order',
    'production-requirement','production-order','production-execution','quality-inspection','material-lot',
    'commercial-publication','buyer-catalog-version','selection','order','order-line','fulfillment-plan',
    'shipment-notice','receipt','receipt-claim','supplier','supplier-facility','deal','calendar-milestone','exception'
  )),
  entity_id text NOT NULL,
  entity_version integer CHECK (entity_version IS NULL OR entity_version > 0),
  entity_content_hash char(64) CHECK (entity_content_hash IS NULL OR entity_content_hash ~ '^[0-9a-f]{64}$'),
  category text NOT NULL CHECK (category IN (
    'missing_data','missing_document','price_conflict','terms_conflict','reserve_conflict',
    'capacity_conflict','material_shortage','supplier_late','qc_fail','marking_issue',
    'shipment_delay','delivery_discrepancy','payment_overdue','integration_failed',
    'permission_denied','policy_block','other'
  )),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  blocking boolean NOT NULL,
  owner_role text NOT NULL CHECK (char_length(owner_role) BETWEEN 1 AND 120),
  owner_user_id text,
  thread_id text NOT NULL REFERENCES operational_threads(id) ON DELETE RESTRICT,
  due_at timestamptz NOT NULL,
  calendar_milestone_id text REFERENCES calendar_milestones(id) ON DELETE RESTRICT,
  sla_policy_id text NOT NULL,
  sla_policy_version integer NOT NULL,
  sla_snapshot jsonb NOT NULL,
  recovery_action text NOT NULL CHECK (char_length(recovery_action) BETWEEN 2 AND 2000),
  business_impact text,
  source_event_id text,
  state text NOT NULL CHECK (state IN (
    'open','assigned','waiting_for_role','waiting_for_document','escalated',
    'resolved','accepted_with_risk','closed'
  )),
  version integer NOT NULL CHECK (version > 0),
  escalation_count integer NOT NULL CHECK (escalation_count >= 0),
  opened_by text NOT NULL,
  opened_at timestamptz NOT NULL,
  assigned_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  accepted_risk_decision_id text REFERENCES operational_decisions(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  CONSTRAINT operational_exceptions_sla_policy_fk
    FOREIGN KEY (sla_policy_id, sla_policy_version)
    REFERENCES operational_sla_policies(id, version) ON DELETE RESTRICT,
  CHECK (due_at > opened_at),
  CHECK ((state <> 'accepted_with_risk') OR accepted_risk_decision_id IS NOT NULL),
  CHECK ((state <> 'closed') OR closed_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS operational_exceptions_active_dedupe_idx
  ON operational_exceptions (owner_organisation_id, dedupe_key)
  WHERE state <> 'closed';
CREATE INDEX IF NOT EXISTS operational_exceptions_owner_state_due_idx
  ON operational_exceptions (owner_organisation_id, state, due_at, id);
CREATE INDEX IF NOT EXISTS operational_exceptions_entity_idx
  ON operational_exceptions (entity_type, entity_id, state, opened_at, id);
CREATE INDEX IF NOT EXISTS operational_exceptions_assignee_idx
  ON operational_exceptions (owner_user_id, state, due_at)
  WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS operational_exception_transitions (
  exception_id text NOT NULL REFERENCES operational_exceptions(id) ON DELETE RESTRICT,
  sequence integer NOT NULL CHECK (sequence > 0),
  from_state text,
  to_state text NOT NULL,
  from_version integer CHECK (from_version IS NULL OR from_version > 0),
  to_version integer NOT NULL CHECK (to_version > 0),
  actor_id text NOT NULL,
  actor_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (exception_id, sequence)
);
CREATE INDEX IF NOT EXISTS operational_exception_transitions_time_idx
  ON operational_exception_transitions (exception_id, occurred_at, sequence);

CREATE OR REPLACE FUNCTION prevent_operational_exception_transition_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Operational exception transition history is immutable';
END;
$$;
DROP TRIGGER IF EXISTS operational_exception_transitions_immutable ON operational_exception_transitions;
CREATE TRIGGER operational_exception_transitions_immutable
BEFORE UPDATE OR DELETE ON operational_exception_transitions
FOR EACH ROW EXECUTE FUNCTION prevent_operational_exception_transition_mutation();

CREATE OR REPLACE FUNCTION prevent_operational_sla_policy_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Operational SLA policy versions are immutable; create a new version instead';
END;
$$;
DROP TRIGGER IF EXISTS operational_sla_policies_immutable ON operational_sla_policies;
CREATE TRIGGER operational_sla_policies_immutable
BEFORE UPDATE OR DELETE ON operational_sla_policies
FOR EACH ROW EXECUTE FUNCTION prevent_operational_sla_policy_mutation();

CREATE OR REPLACE FUNCTION validate_operational_exception_calendar_link()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  milestone_owner text;
  milestone_starts timestamptz;
BEGIN
  IF NEW.calendar_milestone_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT owner_organisation_id, starts_at
    INTO milestone_owner, milestone_starts
    FROM calendar_milestones
   WHERE id = NEW.calendar_milestone_id;
  IF milestone_owner IS NULL THEN
    RAISE EXCEPTION 'Operational exception calendar milestone does not exist';
  END IF;
  IF milestone_owner <> NEW.owner_organisation_id THEN
    RAISE EXCEPTION 'Operational exception calendar milestone belongs to another organisation';
  END IF;
  IF milestone_starts <> NEW.due_at THEN
    RAISE EXCEPTION 'Operational exception due date must equal linked calendar milestone date';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS operational_exceptions_calendar_link ON operational_exceptions;
CREATE TRIGGER operational_exceptions_calendar_link
BEFORE INSERT OR UPDATE OF calendar_milestone_id,due_at,owner_organisation_id ON operational_exceptions
FOR EACH ROW EXECUTE FUNCTION validate_operational_exception_calendar_link();

COMMENT ON TABLE operational_sla_policies IS
  'Versioned immutable SLA authority. Exceptions snapshot the exact policy version used at opening.';
COMMENT ON TABLE operational_exceptions IS
  'Canonical persisted Operational Exception lifecycle. Awaiting Action is a projection of active rows, never a duplicate task.';
COMMENT ON TABLE operational_exception_transitions IS
  'Append-only Operational Exception transition ledger. Mutations and deletes are forbidden.';
