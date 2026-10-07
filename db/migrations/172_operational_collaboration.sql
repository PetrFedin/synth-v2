-- Persistent operational collaboration: entity threads, immutable messages and decision ledger.
-- Operational Exception persistence follows only after collaboration + contextual inspector pass.

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN (
    'wholesale','catalog','notification','product-identity','product-readiness',
    'legal-entity','material-sourcing','compliance-document','product-certification',
    'operational-collaboration'
  ));

CREATE TABLE IF NOT EXISTS operational_collaboration_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT operational_collaboration_commands_command_registry_fk
    FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS operational_collaboration_commands_completed_idx
  ON operational_collaboration_commands (completed_at, id);

CREATE TABLE IF NOT EXISTS operational_threads (
  id text PRIMARY KEY,
  owner_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
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
  kind text NOT NULL CHECK (kind IN ('general','clarification','fit','qc','sourcing','handoff','exception')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  status text NOT NULL CHECK (status IN ('open','resolved','archived')),
  version integer NOT NULL CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  resolved_by text,
  resolved_at timestamptz,
  archived_by text,
  archived_at timestamptz,
  payload jsonb NOT NULL,
  CHECK ((status <> 'resolved') OR resolved_at IS NOT NULL),
  CHECK ((status <> 'archived') OR archived_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS operational_threads_entity_idx
  ON operational_threads (entity_type, entity_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS operational_threads_owner_idx
  ON operational_threads (owner_organisation_id, status, updated_at);

CREATE TABLE IF NOT EXISTS operational_thread_participants (
  thread_id text NOT NULL REFERENCES operational_threads(id) ON DELETE CASCADE,
  organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL,
  PRIMARY KEY (thread_id, organisation_id)
);
CREATE INDEX IF NOT EXISTS operational_thread_participants_organisation_idx
  ON operational_thread_participants (organisation_id, thread_id);

CREATE TABLE IF NOT EXISTS operational_thread_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES operational_threads(id) ON DELETE RESTRICT,
  author_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  author_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS operational_thread_messages_thread_time_idx
  ON operational_thread_messages (thread_id, created_at, id);

CREATE TABLE IF NOT EXISTS operational_decisions (
  id text PRIMARY KEY,
  owner_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  thread_id text REFERENCES operational_threads(id) ON DELETE RESTRICT,
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
  decision_type text NOT NULL CHECK (char_length(decision_type) BETWEEN 2 AND 120),
  outcome text NOT NULL CHECK (outcome IN ('approved','rejected','accepted_with_risk','deferred','waived','recorded')),
  rationale text NOT NULL CHECK (char_length(rationale) BETWEEN 2 AND 4000),
  decided_by text NOT NULL,
  decided_by_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL,
  supersedes_decision_id text REFERENCES operational_decisions(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  CHECK (supersedes_decision_id IS NULL OR supersedes_decision_id <> id)
);
CREATE UNIQUE INDEX IF NOT EXISTS operational_decisions_supersedes_once_idx
  ON operational_decisions (supersedes_decision_id)
  WHERE supersedes_decision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS operational_decisions_entity_time_idx
  ON operational_decisions (entity_type, entity_id, decided_at DESC, id);
CREATE INDEX IF NOT EXISTS operational_decisions_thread_time_idx
  ON operational_decisions (thread_id, decided_at, id)
  WHERE thread_id IS NOT NULL;

COMMENT ON TABLE operational_threads IS
  'Entity-linked operational collaboration. It does not own the referenced business entity.';
COMMENT ON TABLE operational_thread_messages IS
  'Immutable collaboration messages. Corrections are new messages or decisions, not destructive edits.';
COMMENT ON TABLE operational_decisions IS
  'Immutable decision ledger pinned to operational entity identity/version/hash.';
COMMENT ON TABLE operational_collaboration_commands IS
  'Idempotent operational collaboration command results; global uniqueness is enforced by command_registry.';
