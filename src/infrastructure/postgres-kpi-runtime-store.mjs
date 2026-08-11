import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const COMMAND_NAMESPACE = 'kpi-runtime';

export function createPostgresKpiRuntimeStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getRunById(id) {
      const result = await pool.query('SELECT payload FROM kpi_calculation_runs WHERE id = $1', [id]);
      return result.rows[0]?.payload ?? null;
    },
    async getCurrentRunStatus(runId) {
      const result = await pool.query(
        `SELECT event.payload
           FROM kpi_run_status_events event
          WHERE event.run_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM kpi_run_status_events child
               WHERE child.previous_status_event_id = event.id
            )
          LIMIT 1`,
        [runId],
      );
      return result.rows[0]?.payload ?? null;
    },
    async listRunObservations(runId) {
      const result = await pool.query(
        `SELECT payload
           FROM kpi_observations
          WHERE run_id = $1
          ORDER BY run_definition_binding_id, grain_hash, period_start NULLS FIRST, as_of_timestamp NULLS FIRST, id`,
        [runId],
      );
      return result.rows.map((row) => row.payload);
    },
  });
}

function view(client) {
  return Object.freeze({
    async getRunById(id, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT payload FROM kpi_calculation_runs WHERE id = $1${forUpdate ? ' FOR UPDATE' : ' FOR SHARE'}`,
        [id],
      );
      return result.rows[0]?.payload ?? null;
    },
    async insertRun(run) {
      try {
        await client.query(
          `INSERT INTO kpi_calculation_runs (
             id, organisation_id, run_mode, command_id, requested_by,
             period_start, period_end, as_of_timestamp, reporting_timezone,
             engine_version, source_manifest, input_manifest_hash, requested_at, content_hash, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb)`,
          [
            run.id, run.organisationId, run.runMode, run.commandId, run.requestedBy,
            run.periodStart, run.periodEnd, run.asOfTimestamp, run.reportingTimezone,
            run.engineVersion, JSON.stringify(run.sourceManifest), run.inputManifestHash,
            run.requestedAt, run.contentHash, JSON.stringify(run),
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_RUN_ALREADY_EXISTS', 'KPI calculation run already exists', { runId: run.id, commandId: run.commandId });
        throw error;
      }
    },
    async getCurrentRunStatus(runId, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT event.payload
           FROM kpi_run_status_events event
          WHERE event.run_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM kpi_run_status_events child
               WHERE child.previous_status_event_id = event.id
            )
          LIMIT 1${forUpdate ? ' FOR UPDATE' : ' FOR SHARE'}`,
        [runId],
      );
      return result.rows[0]?.payload ?? null;
    },
    async insertRunStatusEvent(event) {
      try {
        await client.query(
          `INSERT INTO kpi_run_status_events (
             id, run_id, previous_status_event_id, run_status, evidence,
             created_at, created_by, content_hash, payload
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb)`,
          [event.id, event.runId, event.previousStatusEventId, event.runStatus, JSON.stringify(event.evidence), event.createdAt, event.createdBy, event.contentHash, JSON.stringify(event)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_RUN_STATUS_EVENT_CONFLICT', 'KPI run status lifecycle already advanced from this predecessor', { runId: event.runId, previousStatusEventId: event.previousStatusEventId });
        throw error;
      }
    },
    async insertDefinitionBinding(binding) {
      try {
        await client.query(
          `INSERT INTO kpi_run_definition_bindings (
             id, run_id, kpi_definition_id, release_event_id, activation_event_id,
             mapping_set_version, selection_reason, created_at, created_by, content_hash, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
          [binding.id, binding.runId, binding.kpiDefinitionId, binding.releaseEventId, binding.activationEventId, binding.mappingSetVersion, binding.selectionReason, binding.createdAt, binding.createdBy, binding.contentHash, JSON.stringify(binding)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_RUN_DEFINITION_BINDING_EXISTS', 'KPI definition is already bound to this run', { runId: binding.runId, kpiDefinitionId: binding.kpiDefinitionId });
        throw error;
      }
    },
    async listDefinitionBindings(runId) {
      const result = await client.query('SELECT payload FROM kpi_run_definition_bindings WHERE run_id = $1 ORDER BY kpi_definition_id, id', [runId]);
      return result.rows.map((row) => row.payload);
    },
    async insertMappingBinding(binding) {
      try {
        await client.query(
          `INSERT INTO kpi_run_mapping_bindings (
             id, run_definition_binding_id, variable_name, kpi_source_mapping_id,
             verification_event_id, created_at, created_by, content_hash, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [binding.id, binding.runDefinitionBindingId, binding.variableName, binding.kpiSourceMappingId, binding.verificationEventId, binding.createdAt, binding.createdBy, binding.contentHash, JSON.stringify(binding)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_RUN_MAPPING_BINDING_EXISTS', 'KPI run mapping binding already exists', { runDefinitionBindingId: binding.runDefinitionBindingId, variableName: binding.variableName });
        throw error;
      }
    },
    async listMappingBindings(runDefinitionBindingId) {
      const result = await client.query('SELECT payload FROM kpi_run_mapping_bindings WHERE run_definition_binding_id = $1 ORDER BY variable_name, id', [runDefinitionBindingId]);
      return result.rows.map((row) => row.payload);
    },
    async insertObservation(observation) {
      try {
        await client.query(
          `INSERT INTO kpi_observations (
             id, run_id, run_definition_binding_id, organisation_id,
             period_start, period_end, as_of_timestamp, grain, grain_hash, data_state,
             value_numeric, canonical_uom, numerator_numeric, denominator_numeric, normalizer_k,
             component_payload, source_lineage, calculated_at, content_hash, payload
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,
             $11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20::jsonb
           )`,
          [
            observation.id, observation.runId, observation.runDefinitionBindingId, observation.organisationId,
            observation.periodStart, observation.periodEnd, observation.asOfTimestamp,
            JSON.stringify(observation.grain), observation.grainHash, observation.dataState,
            observation.valueNumeric, observation.canonicalUom, observation.numeratorNumeric,
            observation.denominatorNumeric, observation.normalizerK,
            JSON.stringify(observation.componentPayload), JSON.stringify(observation.sourceLineage),
            observation.calculatedAt, observation.contentHash, JSON.stringify(observation),
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_OBSERVATION_ALREADY_EXISTS', 'KPI observation already exists for run/definition/grain/time', { observationId: observation.id });
        throw error;
      }
    },
    async listObservations(runId) {
      const result = await client.query(
        'SELECT payload FROM kpi_observations WHERE run_id = $1 ORDER BY run_definition_binding_id, grain_hash, period_start NULLS FIRST, as_of_timestamp NULLS FIRST, id',
        [runId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertQualityResult(result) {
      try {
        await client.query(
          `INSERT INTO kpi_quality_results (
             id, run_id, run_definition_binding_id, observation_id,
             rule_id, rule_version, rule_family, severity, result_status,
             observed_payload, expected_contract, evidence, evaluated_at, content_hash, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15::jsonb)`,
          [result.id, result.runId, result.runDefinitionBindingId, result.observationId, result.ruleId, result.ruleVersion, result.ruleFamily, result.severity, result.resultStatus, JSON.stringify(result.observedPayload), JSON.stringify(result.expectedContract), JSON.stringify(result.evidence), result.evaluatedAt, result.contentHash, JSON.stringify(result)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_QUALITY_RESULT_ALREADY_EXISTS', 'KPI quality result already exists for rule/version scope', { ruleId: result.ruleId, ruleVersion: result.ruleVersion });
        throw error;
      }
    },
    async insertReconciliationResult(result) {
      try {
        await client.query(
          `INSERT INTO kpi_reconciliation_results (
             id, run_id, run_definition_binding_id, observation_id,
             reconciliation_rule_id, reconciliation_rule_version,
             observed_numeric, expected_numeric, absolute_difference, relative_difference,
             tolerance_contract, result_status, evidence, evaluated_at, content_hash, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16::jsonb)`,
          [result.id, result.runId, result.runDefinitionBindingId, result.observationId, result.reconciliationRuleId, result.reconciliationRuleVersion, result.observedNumeric, result.expectedNumeric, result.absoluteDifference, result.relativeDifference, JSON.stringify(result.toleranceContract), result.resultStatus, JSON.stringify(result.evidence), result.evaluatedAt, result.contentHash, JSON.stringify(result)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_RECONCILIATION_RESULT_ALREADY_EXISTS', 'KPI reconciliation result already exists for rule/version scope', { reconciliationRuleId: result.reconciliationRuleId, reconciliationRuleVersion: result.reconciliationRuleVersion });
        throw error;
      }
    },
    async insertRestatement(restatement) {
      try {
        await client.query(
          `INSERT INTO kpi_run_restatements (
             id, new_run_id, superseded_run_id, reason_code, reason,
             approved_by, created_at, content_hash, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [restatement.id, restatement.newRunId, restatement.supersededRunId, restatement.reasonCode, restatement.reason, restatement.approvedBy, restatement.createdAt, restatement.contentHash, JSON.stringify(restatement)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_RESTATEMENT_ALREADY_EXISTS', 'Restatement already exists for new KPI run', { newRunId: restatement.newRunId });
        throw error;
      }
    },
    getCommand: (id) => getRegisteredCommand(client, COMMAND_NAMESPACE, id),
    insertCommand: (value) => insertRegisteredCommand(client, COMMAND_NAMESPACE, value),
    async appendOutbox(event) {
      try {
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
           VALUES ($1, $2, $3, 'pending', $4::jsonb, NULL)`,
          [event.id, event.type, event.aggregateId, JSON.stringify(event)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}
