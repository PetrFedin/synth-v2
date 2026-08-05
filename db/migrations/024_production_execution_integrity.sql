BEGIN;

CREATE OR REPLACE FUNCTION enforce_production_execution_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  milestone_codes text[] := ARRAY[
    'materials-ready',
    'cutting-complete',
    'assembly-complete',
    'finishing-complete',
    'packing-complete',
    'ready-for-qc'
  ];
  milestone_ratios numeric[] := ARRAY[0.10, 0.25, 0.60, 0.78, 0.90, 0.95];
  milestone jsonb;
  milestone_status text;
  completed_at timestamptz;
  blocked_at timestamptz;
  resolved_at timestamptz;
  due_at timestamptz;
  expected_due_at timestamptz;
  previous_completed_at timestamptz := NULL;
  latest_activity_at timestamptz := NULL;
  first_open_index integer := NULL;
  window_ms bigint;
  expected_offset_ms bigint;
  i integer;
BEGIN
  IF NOT (NEW.payload ?& ARRAY[
      'startedAt','startedBy','readyForQcAt','cancelledAt','cancellationReason',
      'createdAt','updatedAt','milestones'
    ]) THEN
    RAISE EXCEPTION 'Production execution lifecycle projection is incomplete'
      USING ERRCODE = '23514', CONSTRAINT = 'production_executions_lifecycle_projection_match';
  END IF;

  IF (NEW.payload ->> 'startedAt')::timestamptz IS DISTINCT FROM NEW.started_at
     OR (NEW.payload ->> 'readyForQcAt')::timestamptz IS DISTINCT FROM NEW.ready_for_qc_at
     OR (NEW.payload ->> 'cancelledAt')::timestamptz IS DISTINCT FROM NEW.cancelled_at
     OR (NEW.payload ->> 'createdAt')::timestamptz IS DISTINCT FROM NEW.created_at
     OR (NEW.payload ->> 'updatedAt')::timestamptz IS DISTINCT FROM NEW.updated_at THEN
    RAISE EXCEPTION 'Production execution lifecycle columns do not match payload'
      USING ERRCODE = '23514', CONSTRAINT = 'production_executions_lifecycle_projection_match';
  END IF;

  IF (NEW.started_at IS NULL AND NEW.payload ->> 'startedBy' IS NOT NULL)
     OR (NEW.started_at IS NOT NULL AND coalesce(length(trim(NEW.payload ->> 'startedBy')), 0) = 0)
     OR (NEW.status <> 'cancelled' AND NEW.payload ->> 'cancellationReason' IS NOT NULL)
     OR (NEW.status = 'cancelled' AND coalesce(length(trim(NEW.payload ->> 'cancellationReason')), 0) < 5) THEN
    RAISE EXCEPTION 'Production execution lifecycle audit fields are invalid'
      USING ERRCODE = '23514', CONSTRAINT = 'production_executions_lifecycle_audit_valid';
  END IF;

  latest_activity_at := NEW.started_at;
  window_ms := floor(extract(epoch FROM (NEW.delivery_due_at - NEW.production_start_at)) * 1000)::bigint;

  FOR i IN 0..5 LOOP
    milestone := NEW.payload -> 'milestones' -> i;

    IF jsonb_typeof(milestone) <> 'object'
       OR NOT (milestone ?& ARRAY[
         'code','sequence','dueAt','status','completedAt','completedBy','completionNotes','varianceMinutes',
         'blockedAt','blockedBy','blockReason','resolvedAt','resolvedBy','resolutionNotes'
       ]) THEN
      RAISE EXCEPTION 'Production milestone payload is incomplete'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_payload_valid';
    END IF;

    expected_offset_ms := floor(window_ms::numeric * milestone_ratios[i + 1])::bigint;
    expected_due_at := NEW.production_start_at + make_interval(secs => expected_offset_ms::double precision / 1000.0);
    due_at := (milestone ->> 'dueAt')::timestamptz;

    IF milestone ->> 'code' <> milestone_codes[i + 1]
       OR (milestone ->> 'sequence')::integer <> i + 1
       OR due_at IS DISTINCT FROM expected_due_at THEN
      RAISE EXCEPTION 'Production milestone template does not match the deterministic plan'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_template_match';
    END IF;

    milestone_status := milestone ->> 'status';
    IF milestone_status NOT IN ('pending','blocked','completed') THEN
      RAISE EXCEPTION 'Production milestone status is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_state_valid';
    END IF;

    completed_at := (milestone ->> 'completedAt')::timestamptz;
    blocked_at := (milestone ->> 'blockedAt')::timestamptz;
    resolved_at := (milestone ->> 'resolvedAt')::timestamptz;

    IF (completed_at IS NOT NULL OR blocked_at IS NOT NULL OR resolved_at IS NOT NULL)
       AND NEW.started_at IS NULL THEN
      RAISE EXCEPTION 'Production milestone history requires a started execution'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_time_order';
    END IF;
    IF completed_at IS NOT NULL
       AND (completed_at < NEW.started_at
            OR completed_at > NEW.updated_at
            OR (previous_completed_at IS NOT NULL AND completed_at < previous_completed_at)) THEN
      RAISE EXCEPTION 'Production milestone completion time is outside the execution lifecycle'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_time_order';
    END IF;
    IF blocked_at IS NOT NULL
       AND (blocked_at < NEW.started_at
            OR blocked_at > NEW.updated_at
            OR (previous_completed_at IS NOT NULL AND blocked_at < previous_completed_at)) THEN
      RAISE EXCEPTION 'Production milestone block time is outside the execution lifecycle'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_time_order';
    END IF;
    IF resolved_at IS NOT NULL
       AND (blocked_at IS NULL
            OR resolved_at < blocked_at
            OR resolved_at > NEW.updated_at
            OR (previous_completed_at IS NOT NULL AND resolved_at < previous_completed_at)) THEN
      RAISE EXCEPTION 'Production milestone resolution time is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_time_order';
    END IF;

    IF completed_at IS NOT NULL AND (latest_activity_at IS NULL OR completed_at > latest_activity_at) THEN
      latest_activity_at := completed_at;
    END IF;
    IF blocked_at IS NOT NULL AND (latest_activity_at IS NULL OR blocked_at > latest_activity_at) THEN
      latest_activity_at := blocked_at;
    END IF;
    IF resolved_at IS NOT NULL AND (latest_activity_at IS NULL OR resolved_at > latest_activity_at) THEN
      latest_activity_at := resolved_at;
    END IF;

    IF milestone_status = 'completed' THEN
      IF first_open_index IS NOT NULL
         OR completed_at IS NULL
         OR coalesce(length(trim(milestone ->> 'completedBy')), 0) = 0
         OR milestone ->> 'varianceMinutes' IS NULL
         OR (milestone ->> 'varianceMinutes')::integer <> trunc(extract(epoch FROM (completed_at - due_at)) / 60)::integer
         OR (blocked_at IS NULL AND (
              milestone ->> 'blockedBy' IS NOT NULL
              OR milestone ->> 'blockReason' IS NOT NULL
              OR resolved_at IS NOT NULL
              OR milestone ->> 'resolvedBy' IS NOT NULL
              OR milestone ->> 'resolutionNotes' IS NOT NULL
            ))
         OR (blocked_at IS NOT NULL AND (
              coalesce(length(trim(milestone ->> 'blockedBy')), 0) = 0
              OR coalesce(length(trim(milestone ->> 'blockReason')), 0) < 5
              OR resolved_at IS NULL
              OR coalesce(length(trim(milestone ->> 'resolvedBy')), 0) = 0
              OR coalesce(length(trim(milestone ->> 'resolutionNotes')), 0) < 5
              OR completed_at < resolved_at
            )) THEN
        RAISE EXCEPTION 'Completed production milestone audit trail is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_state_valid';
      END IF;
      previous_completed_at := completed_at;
    ELSE
      IF first_open_index IS NULL THEN
        first_open_index := i;
      ELSIF milestone_status <> 'pending' THEN
        RAISE EXCEPTION 'Only the current production milestone may be blocked'
          USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_sequence_valid';
      END IF;

      IF completed_at IS NOT NULL
         OR milestone ->> 'completedBy' IS NOT NULL
         OR milestone ->> 'completionNotes' IS NOT NULL
         OR milestone ->> 'varianceMinutes' IS NOT NULL THEN
        RAISE EXCEPTION 'Open production milestone contains completion data'
          USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_state_valid';
      END IF;

      IF milestone_status = 'blocked' THEN
        IF blocked_at IS NULL
           OR coalesce(length(trim(milestone ->> 'blockedBy')), 0) = 0
           OR coalesce(length(trim(milestone ->> 'blockReason')), 0) < 5
           OR resolved_at IS NOT NULL
           OR milestone ->> 'resolvedBy' IS NOT NULL
           OR milestone ->> 'resolutionNotes' IS NOT NULL THEN
          RAISE EXCEPTION 'Blocked production milestone audit trail is invalid'
            USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_state_valid';
        END IF;
      ELSIF blocked_at IS NULL THEN
        IF milestone ->> 'blockedBy' IS NOT NULL
           OR milestone ->> 'blockReason' IS NOT NULL
           OR resolved_at IS NOT NULL
           OR milestone ->> 'resolvedBy' IS NOT NULL
           OR milestone ->> 'resolutionNotes' IS NOT NULL THEN
          RAISE EXCEPTION 'Pending production milestone contains invalid block data'
            USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_state_valid';
        END IF;
      ELSE
        IF coalesce(length(trim(milestone ->> 'blockedBy')), 0) = 0
           OR coalesce(length(trim(milestone ->> 'blockReason')), 0) < 5
           OR resolved_at IS NULL
           OR coalesce(length(trim(milestone ->> 'resolvedBy')), 0) = 0
           OR coalesce(length(trim(milestone ->> 'resolutionNotes')), 0) < 5 THEN
          RAISE EXCEPTION 'Resolved production milestone audit trail is invalid'
            USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_state_valid';
        END IF;
      END IF;

      IF i > first_open_index
         AND (blocked_at IS NOT NULL
              OR milestone ->> 'blockedBy' IS NOT NULL
              OR milestone ->> 'blockReason' IS NOT NULL
              OR resolved_at IS NOT NULL
              OR milestone ->> 'resolvedBy' IS NOT NULL
              OR milestone ->> 'resolutionNotes' IS NOT NULL) THEN
        RAISE EXCEPTION 'Future production milestones cannot contain execution history'
          USING ERRCODE = '23514', CONSTRAINT = 'production_executions_milestone_sequence_valid';
      END IF;
    END IF;
  END LOOP;

  IF NEW.status = 'planned' THEN
    IF first_open_index IS DISTINCT FROM 0
       OR NEW.started_at IS NOT NULL
       OR NEW.updated_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Planned production execution must have an untouched milestone plan'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_lifecycle_state_valid';
    END IF;
  ELSIF NEW.status = 'active' THEN
    IF NEW.started_at IS NULL
       OR first_open_index IS NULL
       OR NEW.updated_at IS DISTINCT FROM latest_activity_at THEN
      RAISE EXCEPTION 'Active production execution must have a current open milestone'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_lifecycle_state_valid';
    END IF;
  ELSIF NEW.status = 'ready-for-qc' THEN
    IF first_open_index IS NOT NULL
       OR NEW.ready_for_qc_at IS NULL
       OR NEW.ready_for_qc_at IS DISTINCT FROM previous_completed_at
       OR NEW.updated_at IS DISTINCT FROM NEW.ready_for_qc_at THEN
      RAISE EXCEPTION 'Ready-for-QC production execution must have all milestones completed'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_lifecycle_state_valid';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF NEW.cancelled_at IS NULL
       OR NEW.ready_for_qc_at IS NOT NULL
       OR first_open_index IS NULL
       OR NEW.updated_at IS DISTINCT FROM NEW.cancelled_at THEN
      RAISE EXCEPTION 'Cancelled production execution lifecycle is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'production_executions_lifecycle_state_valid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_executions_integrity_gate ON production_executions;
CREATE TRIGGER production_executions_integrity_gate
BEFORE INSERT OR UPDATE ON production_executions
FOR EACH ROW EXECUTE FUNCTION enforce_production_execution_integrity();

-- Validate every pre-existing row through the new trigger without changing business data.
UPDATE production_executions SET payload = payload;

COMMIT;
