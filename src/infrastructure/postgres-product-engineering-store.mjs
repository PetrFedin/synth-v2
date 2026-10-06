import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductEngineeringStore({ pool } = {}) {
  invariant(pool && typeof pool.query === 'function' && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: transactionView }),
    async getStyleVersion(id) {
      const result = await pool.query('SELECT id, style_id, brand_id, version_no FROM product_style_versions WHERE id = $1', [id]);
      return result.rows[0] ? mapStyleVersionIdentity(result.rows[0]) : undefined;
    },
    async getAnalysisRun(id) {
      const result = await pool.query('SELECT * FROM product_engineering_analysis_runs WHERE id = $1', [id]);
      return result.rows[0] ? mapAnalysis(result.rows[0]) : undefined;
    },
    async getModelRun(id) {
      const result = await pool.query('SELECT * FROM ai_model_runs WHERE id = $1', [id]);
      return result.rows[0] ? mapModelRun(result.rows[0]) : undefined;
    },
    async getFinding(id) {
      const result = await pool.query('SELECT * FROM product_engineering_findings WHERE id = $1', [id]);
      return result.rows[0] ? mapFinding(result.rows[0]) : undefined;
    },
    async getProposal(id) {
      const result = await pool.query('SELECT * FROM product_engineering_proposals WHERE id = $1', [id]);
      return result.rows[0] ? mapProposal(result.rows[0]) : undefined;
    },
    async getConflict(id) {
      const result = await pool.query('SELECT * FROM product_engineering_conflicts WHERE id = $1', [id]);
      return result.rows[0] ? mapConflict(result.rows[0]) : undefined;
    },
    async getDrawing(id) {
      const result = await pool.query('SELECT * FROM technical_drawing_versions WHERE id = $1', [id]);
      return result.rows[0] ? mapDrawing(result.rows[0]) : undefined;
    },
    async getStyleWorkspace(styleId, { limit = 100 } = {}) {
      const bounded = normalizeLimit(limit);
      const [analysisResult, proposalResult, conflictResult, drawingResult] = await Promise.all([
        pool.query(
          `SELECT * FROM product_engineering_analysis_runs
            WHERE style_id = $1
            ORDER BY requested_at DESC, id DESC
            LIMIT $2`,
          [styleId, bounded],
        ),
        pool.query(
          `SELECT * FROM product_engineering_proposals
            WHERE style_id = $1
            ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, id DESC
            LIMIT $2`,
          [styleId, bounded],
        ),
        pool.query(
          `SELECT * FROM product_engineering_conflicts
            WHERE style_id = $1
            ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,
                     CASE severity WHEN 'blocking' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                     created_at DESC, id DESC
            LIMIT $2`,
          [styleId, bounded],
        ),
        pool.query(
          `SELECT drawing.*,
                  COALESCE(objects.object_count, 0)::integer AS object_count
             FROM technical_drawing_versions drawing
             LEFT JOIN LATERAL (
               SELECT count(*) AS object_count
                 FROM technical_drawing_objects object
                WHERE object.drawing_id = drawing.id
             ) objects ON true
            WHERE drawing.style_id = $1
            ORDER BY drawing.view_type, drawing.version_no DESC, drawing.id
            LIMIT $2`,
          [styleId, bounded],
        ),
      ]);
      return deepFreeze({
        analyses: analysisResult.rows.map(mapAnalysis),
        proposals: proposalResult.rows.map(mapProposal),
        conflicts: conflictResult.rows.map(mapConflict),
        drawings: drawingResult.rows.map((row) => Object.freeze({ ...mapDrawing(row), objectCount: row.object_count })),
      });
    },
    async getAnalysisWorkspace(analysisRunId) {
      const [analysisResult, modelResult, findingResult, evidenceResult, proposalResult, conflictResult, drawingResult] = await Promise.all([
        pool.query('SELECT * FROM product_engineering_analysis_runs WHERE id = $1', [analysisRunId]),
        pool.query('SELECT * FROM ai_model_runs WHERE analysis_run_id = $1 ORDER BY started_at, id', [analysisRunId]),
        pool.query('SELECT * FROM product_engineering_findings WHERE analysis_run_id = $1 ORDER BY created_at, id', [analysisRunId]),
        pool.query('SELECT * FROM product_engineering_evidence WHERE analysis_run_id = $1 ORDER BY created_at, id', [analysisRunId]),
        pool.query('SELECT * FROM product_engineering_proposals WHERE analysis_run_id = $1 ORDER BY created_at, id', [analysisRunId]),
        pool.query('SELECT * FROM product_engineering_conflicts WHERE analysis_run_id = $1 ORDER BY created_at, id', [analysisRunId]),
        pool.query('SELECT * FROM technical_drawing_versions WHERE analysis_run_id = $1 ORDER BY view_type, version_no, id', [analysisRunId]),
      ]);
      if (!analysisResult.rows[0]) return undefined;
      return deepFreeze({
        analysis: mapAnalysis(analysisResult.rows[0]),
        modelRuns: modelResult.rows.map(mapModelRun),
        findings: findingResult.rows.map(mapFinding),
        evidence: evidenceResult.rows.map(mapEvidence),
        proposals: proposalResult.rows.map(mapProposal),
        conflicts: conflictResult.rows.map(mapConflict),
        drawings: drawingResult.rows.map(mapDrawing),
      });
    },
  });
}

function transactionView(client) {
  return Object.freeze({
    getCommand: (id) => getRegisteredCommand(client, 'product-engineering', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'product-engineering', value),

    async getAnalysisRunForUpdate(id) {
      const result = await client.query('SELECT * FROM product_engineering_analysis_runs WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapAnalysis(result.rows[0]) : undefined;
    },
    async getModelRunForUpdate(id) {
      const result = await client.query('SELECT * FROM ai_model_runs WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapModelRun(result.rows[0]) : undefined;
    },
    async getFinding(id) {
      const result = await client.query('SELECT * FROM product_engineering_findings WHERE id = $1', [id]);
      return result.rows[0] ? mapFinding(result.rows[0]) : undefined;
    },
    async getProposalForUpdate(id) {
      const result = await client.query('SELECT * FROM product_engineering_proposals WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapProposal(result.rows[0]) : undefined;
    },
    async getConflictForUpdate(id) {
      const result = await client.query('SELECT * FROM product_engineering_conflicts WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapConflict(result.rows[0]) : undefined;
    },
    async getDrawingForUpdate(id) {
      const result = await client.query('SELECT * FROM technical_drawing_versions WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapDrawing(result.rows[0]) : undefined;
    },
    async lockStyle(styleId) {
      const result = await client.query('SELECT id FROM product_styles WHERE id = $1 FOR UPDATE', [styleId]);
      invariant(result.rowCount === 1, 'PRODUCT_STYLE_NOT_FOUND', 'Product Style not found', { styleId });
    },
    async latestDrawing(styleId, viewType) {
      const result = await client.query(
        `SELECT * FROM technical_drawing_versions
          WHERE style_id = $1 AND view_type = $2
          ORDER BY version_no DESC
          LIMIT 1`,
        [styleId, viewType],
      );
      return result.rows[0] ? mapDrawing(result.rows[0]) : undefined;
    },

    async insertAnalysisRun(value) {
      await client.query(
        `INSERT INTO product_engineering_analysis_runs
          (id, brand_id, style_id, style_version_id, purpose, status, input_manifest, input_hash,
           requested_at, requested_by, started_at, completed_at, failure_code, failure_message, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          value.id, value.brandId, value.styleId, value.styleVersionId, value.purpose, value.status,
          JSON.stringify(value.inputManifest), value.inputHash, value.requestedAt, value.requestedBy,
          value.startedAt, value.completedAt, value.failureCode, value.failureMessage, value.version,
        ],
      );
    },

    async updateAnalysisRun(value, expectedVersion) {
      const result = await client.query(
        `UPDATE product_engineering_analysis_runs
            SET status=$2, started_at=$3, completed_at=$4, failure_code=$5, failure_message=$6, version=$7
          WHERE id=$1 AND version=$8`,
        [value.id, value.status, value.startedAt, value.completedAt, value.failureCode, value.failureMessage, value.version, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCT_ENGINEERING_ANALYSIS_CONCURRENCY_CONFLICT', 'Engineering analysis changed concurrently', { analysisRunId: value.id, expectedVersion });
    },

    async insertModelRun(value) {
      await client.query(
        `INSERT INTO ai_model_runs
          (id, brand_id, style_id, analysis_run_id, provider, model, purpose, prompt_version, schema_version,
           input_hash, output_hash, status, usage, cost_minor, currency, failure_code, started_at, completed_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19)`,
        [
          value.id, value.brandId, value.styleId, value.analysisRunId, value.provider, value.model, value.purpose,
          value.promptVersion, value.schemaVersion, value.inputHash, value.outputHash, value.status,
          JSON.stringify(value.usage), value.costMinor, value.currency, value.failureCode, value.startedAt,
          value.completedAt, value.createdBy,
        ],
      );
    },

    async updateModelRun(value) {
      const result = await client.query(
        `UPDATE ai_model_runs
            SET output_hash=$2, status=$3, usage=$4::jsonb, cost_minor=$5, currency=$6,
                failure_code=$7, completed_at=$8
          WHERE id=$1 AND status='started'`,
        [value.id, value.outputHash, value.status, JSON.stringify(value.usage), value.costMinor, value.currency, value.failureCode, value.completedAt],
      );
      invariant(result.rowCount === 1, 'PRODUCT_ENGINEERING_MODEL_RUN_CONCURRENCY_CONFLICT', 'AI model run changed concurrently', { modelRunId: value.id });
    },

    async insertFinding(value) {
      await client.query(
        `INSERT INTO product_engineering_findings
          (id, analysis_run_id, brand_id, style_id, finding_type, origin, value, confidence,
           content_hash, created_at, created_by, superseded_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
        [
          value.id, value.analysisRunId, value.brandId, value.styleId, value.findingType, value.origin,
          JSON.stringify(value.value), value.confidence, value.contentHash, value.createdAt, value.createdBy, value.supersededById,
        ],
      );
    },

    async insertEvidence(value) {
      await client.query(
        `INSERT INTO product_engineering_evidence
          (id, finding_id, analysis_run_id, brand_id, style_id, source_kind, source_id,
           source_locator, source_hash, excerpt, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
        [
          value.id, value.findingId, value.analysisRunId, value.brandId, value.styleId, value.sourceKind,
          value.sourceId, JSON.stringify(value.sourceLocator), value.sourceHash, value.excerpt, value.createdAt, value.createdBy,
        ],
      );
    },

    async insertProposal(value) {
      await client.query(
        `INSERT INTO product_engineering_proposals
          (id, analysis_run_id, finding_id, brand_id, style_id, target_authority, target_entity_id,
           target_field, proposed_value, confidence, rationale, status, resolution_note, resolved_at,
           resolved_by, applied_reference, created_at, created_by, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19)`,
        [
          value.id, value.analysisRunId, value.findingId, value.brandId, value.styleId, value.targetAuthority,
          value.targetEntityId, value.targetField, JSON.stringify(value.proposedValue), value.confidence, value.rationale,
          value.status, value.resolutionNote, value.resolvedAt, value.resolvedBy,
          value.appliedReference === null ? null : JSON.stringify(value.appliedReference), value.createdAt, value.createdBy, value.version,
        ],
      );
    },

    async updateProposal(value, expectedVersion) {
      const result = await client.query(
        `UPDATE product_engineering_proposals
            SET status=$2, resolution_note=$3, resolved_at=$4, resolved_by=$5,
                applied_reference=$6::jsonb, version=$7
          WHERE id=$1 AND version=$8`,
        [
          value.id, value.status, value.resolutionNote, value.resolvedAt, value.resolvedBy,
          value.appliedReference === null ? null : JSON.stringify(value.appliedReference), value.version, expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'PRODUCT_ENGINEERING_PROPOSAL_CONCURRENCY_CONFLICT', 'Engineering proposal changed concurrently', { proposalId: value.id, expectedVersion });
    },

    async insertConflict(value) {
      await client.query(
        `INSERT INTO product_engineering_conflicts
          (id, analysis_run_id, brand_id, style_id, conflict_type, subject, candidates, severity, status,
           resolution, created_at, created_by, resolved_at, resolved_by, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)`,
        [
          value.id, value.analysisRunId, value.brandId, value.styleId, value.conflictType, value.subject,
          JSON.stringify(value.candidates), value.severity, value.status,
          value.resolution === null ? null : JSON.stringify(value.resolution), value.createdAt, value.createdBy,
          value.resolvedAt, value.resolvedBy, value.version,
        ],
      );
    },

    async updateConflict(value, expectedVersion) {
      const result = await client.query(
        `UPDATE product_engineering_conflicts
            SET status=$2, resolution=$3::jsonb, resolved_at=$4, resolved_by=$5, version=$6
          WHERE id=$1 AND version=$7`,
        [value.id, value.status, value.resolution === null ? null : JSON.stringify(value.resolution), value.resolvedAt, value.resolvedBy, value.version, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCT_ENGINEERING_CONFLICT_CONCURRENCY_CONFLICT', 'Engineering conflict changed concurrently', { conflictId: value.id, expectedVersion });
    },

    async insertDrawing(value) {
      await client.query(
        `INSERT INTO technical_drawing_versions
          (id, brand_id, style_id, style_version_id, analysis_run_id, view_type, version_no, source_drawing_id,
           status, svg, content_hash, created_at, created_by, approved_at, approved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          value.id, value.brandId, value.styleId, value.styleVersionId, value.analysisRunId, value.viewType,
          value.versionNo, value.sourceDrawingId, value.status, value.svg, value.contentHash,
          value.createdAt, value.createdBy, value.approvedAt, value.approvedBy,
        ],
      );
    },

    async insertDrawingObject(value) {
      await client.query(
        `INSERT INTO technical_drawing_objects
          (id, drawing_id, brand_id, style_id, object_type, semantic_code, geometry, link_payload,
           confidence, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
        [
          value.id, value.drawingId, value.brandId, value.styleId, value.objectType, value.semanticCode,
          JSON.stringify(value.geometry), JSON.stringify(value.linkPayload), value.confidence, value.createdAt, value.createdBy,
        ],
      );
    },

    async supersedeApprovedDrawing(styleId, viewType, exceptId) {
      await client.query(
        `UPDATE technical_drawing_versions
            SET status='superseded'
          WHERE style_id=$1 AND view_type=$2 AND status='approved' AND id<>$3`,
        [styleId, viewType, exceptId],
      );
    },

    async approveDrawing(value) {
      const result = await client.query(
        `UPDATE technical_drawing_versions
            SET status='approved', approved_at=$2, approved_by=$3
          WHERE id=$1 AND status='draft'`,
        [value.id, value.approvedAt, value.approvedBy],
      );
      invariant(result.rowCount === 1, 'TECHNICAL_DRAWING_CONCURRENCY_CONFLICT', 'Technical drawing changed concurrently', { drawingId: value.id });
    },
  });
}

function mapStyleVersionIdentity(row) {
  return Object.freeze({ id: row.id, styleId: row.style_id, brandId: row.brand_id, versionNo: row.version_no });
}

function mapAnalysis(row) {
  return Object.freeze({
    id: row.id, brandId: row.brand_id, styleId: row.style_id, styleVersionId: row.style_version_id,
    purpose: row.purpose, status: row.status, inputManifest: deepFreeze(row.input_manifest), inputHash: row.input_hash,
    requestedAt: iso(row.requested_at), requestedBy: row.requested_by, startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at), failureCode: row.failure_code, failureMessage: row.failure_message, version: row.version,
  });
}

function mapModelRun(row) {
  return Object.freeze({
    id: row.id, brandId: row.brand_id, styleId: row.style_id, analysisRunId: row.analysis_run_id,
    provider: row.provider, model: row.model, purpose: row.purpose, promptVersion: row.prompt_version,
    schemaVersion: row.schema_version, inputHash: row.input_hash, outputHash: row.output_hash,
    status: row.status, usage: deepFreeze(row.usage ?? {}), costMinor: row.cost_minor === null ? null : Number(row.cost_minor),
    currency: row.currency, failureCode: row.failure_code, startedAt: iso(row.started_at), completedAt: iso(row.completed_at), createdBy: row.created_by,
  });
}

function mapFinding(row) {
  return Object.freeze({
    id: row.id, analysisRunId: row.analysis_run_id, brandId: row.brand_id, styleId: row.style_id,
    findingType: row.finding_type, origin: row.origin, value: deepFreeze(row.value), confidence: numberOrNull(row.confidence),
    contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by, supersededById: row.superseded_by_id,
  });
}

function mapEvidence(row) {
  return Object.freeze({
    id: row.id, findingId: row.finding_id, analysisRunId: row.analysis_run_id, brandId: row.brand_id, styleId: row.style_id,
    sourceKind: row.source_kind, sourceId: row.source_id, sourceLocator: deepFreeze(row.source_locator ?? {}),
    sourceHash: row.source_hash, excerpt: row.excerpt, createdAt: iso(row.created_at), createdBy: row.created_by,
  });
}

function mapProposal(row) {
  return Object.freeze({
    id: row.id, analysisRunId: row.analysis_run_id, findingId: row.finding_id, brandId: row.brand_id, styleId: row.style_id,
    targetAuthority: row.target_authority, targetEntityId: row.target_entity_id, targetField: row.target_field,
    proposedValue: deepFreeze(row.proposed_value), confidence: numberOrNull(row.confidence), rationale: row.rationale,
    status: row.status, resolutionNote: row.resolution_note, resolvedAt: iso(row.resolved_at), resolvedBy: row.resolved_by,
    appliedReference: row.applied_reference === null ? null : deepFreeze(row.applied_reference),
    createdAt: iso(row.created_at), createdBy: row.created_by, version: row.version,
  });
}

function mapConflict(row) {
  return Object.freeze({
    id: row.id, analysisRunId: row.analysis_run_id, brandId: row.brand_id, styleId: row.style_id,
    conflictType: row.conflict_type, subject: row.subject, candidates: deepFreeze(row.candidates),
    severity: row.severity, status: row.status, resolution: row.resolution === null ? null : deepFreeze(row.resolution),
    createdAt: iso(row.created_at), createdBy: row.created_by, resolvedAt: iso(row.resolved_at), resolvedBy: row.resolved_by, version: row.version,
  });
}

function mapDrawing(row) {
  return Object.freeze({
    id: row.id, brandId: row.brand_id, styleId: row.style_id, styleVersionId: row.style_version_id,
    analysisRunId: row.analysis_run_id, viewType: row.view_type, versionNo: row.version_no,
    sourceDrawingId: row.source_drawing_id, status: row.status, svg: row.svg, contentHash: row.content_hash,
    createdAt: iso(row.created_at), createdBy: row.created_by, approvedAt: iso(row.approved_at), approvedBy: row.approved_by,
  });
}

function normalizeLimit(value) {
  const number = Number(value);
  invariant(Number.isInteger(number) && number >= 1 && number <= 200, 'PRODUCT_ENGINEERING_LIMIT_INVALID', 'Engineering workspace limit must be 1-200');
  return number;
}
function numberOrNull(value) { return value === null || value === undefined ? null : Number(value); }
function iso(value) { return value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
