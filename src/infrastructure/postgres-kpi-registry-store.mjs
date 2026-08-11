import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const COMMAND_NAMESPACE = 'kpi-registry';

export function createPostgresKpiRegistryStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getDefinitionById(id) {
      const result = await pool.query('SELECT payload FROM kpi_definition_versions WHERE id = $1', [id]);
      return result.rows[0]?.payload ?? null;
    },
    async listDefinitionVersions({ scopeType = 'system', organisationId = null, kpiCode } = {}) {
      invariant(scopeType === 'system' || scopeType === 'organisation', 'KPI_SCOPE_TYPE_INVALID', 'KPI scopeType must be system or organisation');
      invariant(typeof kpiCode === 'string' && kpiCode.length > 0, 'KPI_CODE_REQUIRED', 'KPI code is required');
      const result = await pool.query(
        `SELECT payload
           FROM kpi_definition_versions
          WHERE scope_type = $1
            AND kpi_code = $2
            AND (organisation_id = $3 OR ($3::text IS NULL AND organisation_id IS NULL))
          ORDER BY effective_from DESC, formula_version DESC, id DESC`,
        [scopeType, kpiCode, organisationId],
      );
      return result.rows.map((row) => row.payload);
    },
    async getLatestReleaseEvent(kpiDefinitionId) {
      const result = await pool.query(
        `SELECT event.payload
           FROM kpi_definition_release_events event
          WHERE event.kpi_definition_id = $1
            AND NOT EXISTS (
              SELECT 1
                FROM kpi_definition_release_events child
               WHERE child.previous_release_event_id = event.id
            )
          LIMIT 1`,
        [kpiDefinitionId],
      );
      return result.rows[0]?.payload ?? null;
    },
  });
}

function view(client) {
  return Object.freeze({
    async getDefinitionById(id, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT payload FROM kpi_definition_versions WHERE id = $1${forUpdate ? ' FOR UPDATE' : ' FOR SHARE'}`,
        [id],
      );
      return result.rows[0]?.payload ?? null;
    },
    async getDefinitionByBusinessKey({ scopeType = 'system', organisationId = null, kpiCode, formulaVersion }) {
      const result = await client.query(
        `SELECT payload
           FROM kpi_definition_versions
          WHERE scope_type = $1
            AND kpi_code = $2
            AND formula_version = $3
            AND (organisation_id = $4 OR ($4::text IS NULL AND organisation_id IS NULL))
          FOR SHARE`,
        [scopeType, kpiCode, formulaVersion, organisationId],
      );
      return result.rows[0]?.payload ?? null;
    },
    async insertDefinition(definition) {
      try {
        await client.query(
          `INSERT INTO kpi_definition_versions (
             id, scope_type, organisation_id, kpi_code, formula_version, role,
             canonical_name_ru, canonical_name_en, domain_code,
             business_definition, business_formula, calculation_primitive, canonical_uom,
             directionality, goal_function, grain_contract, population_contract, temporal_contract,
             aggregation_contract, dimensional_contract, zero_null_error_policy, control_contract,
             publication_contract, effective_from, effective_to, created_at, created_by, content_hash, payload
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13, $14, $15,
             $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23::jsonb,
             $24, $25, $26, $27, $28, $29::jsonb
           )`,
          definitionParameters(definition),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_DEFINITION_ALREADY_EXISTS', 'KPI definition version already exists', { scopeType: definition.scopeType, organisationId: definition.organisationId, kpiCode: definition.kpiCode, formulaVersion: definition.formulaVersion });
        throw error;
      }
    },
    async getLatestReleaseEvent(kpiDefinitionId, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT event.payload
           FROM kpi_definition_release_events event
          WHERE event.kpi_definition_id = $1
            AND NOT EXISTS (
              SELECT 1
                FROM kpi_definition_release_events child
               WHERE child.previous_release_event_id = event.id
            )
          LIMIT 1${forUpdate ? ' FOR UPDATE' : ' FOR SHARE'}`,
        [kpiDefinitionId],
      );
      return result.rows[0]?.payload ?? null;
    },
    async listReleaseEvents(kpiDefinitionId) {
      const result = await client.query(
        `SELECT payload
           FROM kpi_definition_release_events
          WHERE kpi_definition_id = $1
          ORDER BY created_at, id`,
        [kpiDefinitionId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertReleaseEvent(event) {
      try {
        await client.query(
          `INSERT INTO kpi_definition_release_events (
             id, kpi_definition_id, previous_release_event_id, release_status, evidence,
             created_at, created_by, content_hash, payload
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb)`,
          releaseEventParameters(event),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_RELEASE_EVENT_CONFLICT', 'KPI release lifecycle already advanced from this predecessor', { kpiDefinitionId: event.kpiDefinitionId, previousReleaseEventId: event.previousReleaseEventId });
        throw error;
      }
    },
    async getMappingById(id, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT payload FROM kpi_source_mapping_versions WHERE id = $1${forUpdate ? ' FOR UPDATE' : ' FOR SHARE'}`,
        [id],
      );
      return result.rows[0]?.payload ?? null;
    },
    async listMappings(kpiDefinitionId, { mappingSetVersion = null } = {}) {
      const result = await client.query(
        `SELECT payload
           FROM kpi_source_mapping_versions
          WHERE kpi_definition_id = $1
            AND ($2::integer IS NULL OR mapping_set_version = $2)
          ORDER BY mapping_set_version DESC, variable_name, id`,
        [kpiDefinitionId, mappingSetVersion],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertMapping(mapping) {
      try {
        await client.query(
          `INSERT INTO kpi_source_mapping_versions (
             id, kpi_definition_id, mapping_set_version, variable_name, source_contract_id,
             source_system, source_entity, source_path, datatype, primary_or_event_key,
             event_timestamp_path, uom_path, currency_path, join_contract, filter_contract,
             created_at, created_by, content_hash, payload
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14::jsonb, $15::jsonb, $16, $17, $18, $19::jsonb
           )`,
          mappingParameters(mapping),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_MAPPING_ALREADY_EXISTS', 'KPI source mapping version already exists', { kpiDefinitionId: mapping.kpiDefinitionId, mappingSetVersion: mapping.mappingSetVersion, variableName: mapping.variableName });
        throw error;
      }
    },
    async getLatestMappingVerificationEvent(kpiSourceMappingId, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT event.payload
           FROM kpi_source_mapping_verification_events event
          WHERE event.kpi_source_mapping_id = $1
            AND NOT EXISTS (
              SELECT 1
                FROM kpi_source_mapping_verification_events child
               WHERE child.previous_verification_event_id = event.id
            )
          LIMIT 1${forUpdate ? ' FOR UPDATE' : ' FOR SHARE'}`,
        [kpiSourceMappingId],
      );
      return result.rows[0]?.payload ?? null;
    },
    async listMappingVerificationEvents(kpiSourceMappingId) {
      const result = await client.query(
        `SELECT payload
           FROM kpi_source_mapping_verification_events
          WHERE kpi_source_mapping_id = $1
          ORDER BY created_at, id`,
        [kpiSourceMappingId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertMappingVerificationEvent(event) {
      try {
        await client.query(
          `INSERT INTO kpi_source_mapping_verification_events (
             id, kpi_source_mapping_id, previous_verification_event_id, verification_status, evidence,
             created_at, created_by, content_hash, payload
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb)`,
          mappingVerificationEventParameters(event),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_MAPPING_VERIFICATION_EVENT_CONFLICT', 'KPI mapping verification lifecycle already advanced from this predecessor', { kpiSourceMappingId: event.kpiSourceMappingId, previousVerificationEventId: event.previousVerificationEventId });
        throw error;
      }
    },
    async listDependencies(definitionId) {
      const result = await client.query(
        `SELECT payload
           FROM kpi_definition_dependencies
          WHERE source_definition_id = $1 OR target_definition_id = $1
          ORDER BY relation_type, id`,
        [definitionId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertDependency(dependency) {
      try {
        await client.query(
          `INSERT INTO kpi_definition_dependencies (
             id, source_definition_id, target_definition_id, relation_type, relation_contract,
             created_at, created_by, content_hash, payload
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb)`,
          dependencyParameters(dependency),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'KPI_DEPENDENCY_ALREADY_EXISTS', 'KPI dependency already exists', { sourceDefinitionId: dependency.sourceDefinitionId, targetDefinitionId: dependency.targetDefinitionId, relationType: dependency.relationType });
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

function definitionParameters(value) {
  return [
    value.id, value.scopeType, value.organisationId, value.kpiCode, value.formulaVersion, value.role,
    value.canonicalNameRu, value.canonicalNameEn, value.domainCode, value.businessDefinition, value.businessFormula,
    value.calculationPrimitive, value.canonicalUom, value.directionality, value.goalFunction,
    JSON.stringify(value.grainContract), JSON.stringify(value.populationContract), JSON.stringify(value.temporalContract),
    JSON.stringify(value.aggregationContract), JSON.stringify(value.dimensionalContract), JSON.stringify(value.zeroNullErrorPolicy),
    JSON.stringify(value.controlContract), JSON.stringify(value.publicationContract), value.effectiveFrom, value.effectiveTo,
    value.createdAt, value.createdBy, value.contentHash, JSON.stringify(value),
  ];
}

function releaseEventParameters(value) {
  return [value.id, value.kpiDefinitionId, value.previousReleaseEventId, value.releaseStatus, JSON.stringify(value.evidence), value.createdAt, value.createdBy, value.contentHash, JSON.stringify(value)];
}

function mappingParameters(value) {
  return [
    value.id, value.kpiDefinitionId, value.mappingSetVersion, value.variableName, value.sourceContractId, value.sourceSystem,
    value.sourceEntity, value.sourcePath, value.datatype, value.primaryOrEventKey, value.eventTimestampPath, value.uomPath,
    value.currencyPath, JSON.stringify(value.joinContract), JSON.stringify(value.filterContract), value.createdAt, value.createdBy,
    value.contentHash, JSON.stringify(value),
  ];
}

function mappingVerificationEventParameters(value) {
  return [value.id, value.kpiSourceMappingId, value.previousVerificationEventId, value.verificationStatus, JSON.stringify(value.evidence), value.createdAt, value.createdBy, value.contentHash, JSON.stringify(value)];
}

function dependencyParameters(value) {
  return [value.id, value.sourceDefinitionId, value.targetDefinitionId, value.relationType, JSON.stringify(value.relationContract), value.createdAt, value.createdBy, value.contentHash, JSON.stringify(value)];
}
