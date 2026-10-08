import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/**
 * @param {{ pool?: any }} [options]
 */
export function createPostgresProductEngineeringStore(options = {}) {
  const { pool } = options;
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
    async getApplicationIntentByProposal(proposalId) {
      const result = await pool.query('SELECT * FROM product_engineering_application_intents WHERE proposal_id = $1', [proposalId]);
      return result.rows[0] ? mapApplicationIntent(result.rows[0]) : undefined;
    },
    async getApplicationReceiptByProposal(proposalId) {
      const result = await pool.query('SELECT * FROM product_engineering_application_receipts WHERE proposal_id = $1', [proposalId]);
      return result.rows[0] ? mapApplicationReceipt(result.rows[0]) : undefined;
    },
    async getConflict(id) {
      const result = await pool.query('SELECT * FROM product_engineering_conflicts WHERE id = $1', [id]);
      return result.rows[0] ? mapConflict(result.rows[0]) : undefined;
    },
    async getDrawing(id) {
      const result = await pool.query('SELECT * FROM technical_drawing_versions WHERE id = $1', [id]);
      return result.rows[0] ? mapDrawing(result.rows[0]) : undefined;
    },
    async getDrawingObjects(drawingId) {
      const result = await pool.query('SELECT * FROM technical_drawing_objects WHERE drawing_id = $1 ORDER BY created_at, id', [drawingId]);
      return result.rows.map(mapDrawingObject);
    },
    async getSource(id) {
      const result = await pool.query('SELECT * FROM product_engineering_sources WHERE id = $1', [id]);
      return result.rows[0] ? mapSource(result.rows[0]) : undefined;
    },
    async getSourceFragments(sourceId) {
      const result = await pool.query(
        'SELECT * FROM product_engineering_source_fragments WHERE source_id = $1 ORDER BY created_at, id',
        [sourceId],
      );
      return result.rows.map(mapFragment);
    },
    async getSourceBlob(sourceId) {
      const result = await pool.query(
        'SELECT source_id, brand_id, style_id, media_type, size_bytes, content_hash, content, created_at FROM product_engineering_source_blobs WHERE source_id = $1',
        [sourceId],
      );
      return result.rows[0] ? mapSourceBlob(result.rows[0]) : undefined;
    },
    async getSourceImpactLineage(sourceId) {
      return querySourceImpactLineage(pool, sourceId);
    },
    async getChangeCase(id) {
      const [caseResult, impactResult, receiptResult] = await Promise.all([
        pool.query('SELECT * FROM product_engineering_change_cases WHERE id = $1', [id]),
        pool.query(`SELECT * FROM product_engineering_change_impacts WHERE change_case_id = $1 ORDER BY CASE severity WHEN 'blocking' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, impact_kind, area, entity_id, required_action`, [id]),
        pool.query('SELECT * FROM product_engineering_change_impact_receipts WHERE change_case_id = $1 ORDER BY created_at DESC, id DESC', [id]),
      ]);
      return caseResult.rows[0] ? deepFreeze({ changeCase: mapChangeCase(caseResult.rows[0]), impacts: impactResult.rows.map(mapChangeImpact), receipts: receiptResult.rows.map(mapChangeImpactReceipt) }) : undefined;
    },
    async getChangeImpact(id) {
      const result = await pool.query(
        `SELECT impact.*, change_case.brand_id, change_case.style_id
           FROM product_engineering_change_impacts impact
           JOIN product_engineering_change_cases change_case ON change_case.id=impact.change_case_id
          WHERE impact.id=$1`, [id]);
      return result.rows[0] ? deepFreeze({ impact: mapChangeImpact(result.rows[0]), brandId: result.rows[0].brand_id, styleId: result.rows[0].style_id }) : undefined;
    },
    async getChangeImpactReceipt(impactId) {
      const result = await pool.query('SELECT * FROM product_engineering_change_impact_receipts WHERE impact_id=$1', [impactId]);
      return result.rows[0] ? mapChangeImpactReceipt(result.rows[0]) : undefined;
    },
    async getStyleWorkspace(styleId, { limit = 100 } = {}) {
      const bounded = normalizeLimit(limit);
      const [analysisResult, proposalResult, conflictResult, drawingResult, sourceResult, graphResult, changeCaseResult] = await Promise.all([
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
        pool.query(
          `SELECT source.*,
                  COALESCE(fragments.fragment_count, 0)::integer AS fragment_count
             FROM product_engineering_sources source
             LEFT JOIN LATERAL (
               SELECT count(*) AS fragment_count
                 FROM product_engineering_source_fragments fragment
                WHERE fragment.source_id = source.id
             ) fragments ON true
            WHERE source.style_id = $1
            ORDER BY source.created_at DESC, source.id DESC
            LIMIT $2`,
          [styleId, bounded],
        ),
        pool.query(
          `SELECT graph.*,
                  COALESCE(nodes.nodes, '[]'::jsonb) AS nodes,
                  COALESCE(edges.edges, '[]'::jsonb) AS edges
             FROM product_engineering_garment_graphs graph
             LEFT JOIN LATERAL (
               SELECT jsonb_agg(jsonb_build_object(
                 'id', node.id,
                 'nodeType', node.node_type,
                 'semanticCode', node.semantic_code,
                 'label', node.label,
                 'attributes', node.attributes,
                 'confidence', node.confidence,
                 'findingId', node.finding_id
               ) ORDER BY node.id) AS nodes
                 FROM product_engineering_garment_nodes node
                WHERE node.graph_id = graph.id
             ) nodes ON true
             LEFT JOIN LATERAL (
               SELECT jsonb_agg(jsonb_build_object(
                 'id', edge.id,
                 'fromNodeId', edge.from_node_id,
                 'toNodeId', edge.to_node_id,
                 'relation', edge.relation,
                 'attributes', edge.attributes,
                 'confidence', edge.confidence
               ) ORDER BY edge.id) AS edges
                 FROM product_engineering_garment_edges edge
                WHERE edge.graph_id = graph.id
             ) edges ON true
            WHERE graph.style_id = $1
            ORDER BY CASE graph.status WHEN 'reviewed' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                     graph.created_at DESC, graph.id DESC
            LIMIT 1`,
          [styleId],
        ),
        pool.query(
          `SELECT change_case.*,
                  revision.superseded_source_id,
                  revision.replacement_source_id,
                  COALESCE(impact_counts.total,0)::integer AS impact_count,
                  COALESCE(impact_counts.pending,0)::integer AS pending_impact_count,
                  COALESCE(impact_counts.blocking,0)::integer AS blocking_impact_count
             FROM product_engineering_change_cases change_case
             JOIN product_engineering_source_revisions revision ON revision.id=change_case.source_revision_id
             LEFT JOIN LATERAL (
               SELECT count(*) AS total,
                      count(*) FILTER (WHERE impact.status='pending') AS pending,
                      count(*) FILTER (WHERE impact.severity='blocking' AND impact.status='pending') AS blocking
                 FROM product_engineering_change_impacts impact
                WHERE impact.change_case_id=change_case.id
             ) impact_counts ON true
            WHERE change_case.style_id=$1
            ORDER BY CASE change_case.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
                     change_case.created_at DESC, change_case.id DESC
            LIMIT $2`,
          [styleId,bounded],
        ),
      ]);
      return deepFreeze({
        analyses: analysisResult.rows.map(mapAnalysis),
        proposals: proposalResult.rows.map(mapProposal),
        conflicts: conflictResult.rows.map(mapConflict),
        drawings: drawingResult.rows.map((row) => Object.freeze({ ...mapDrawing(row), objectCount: row.object_count })),
        sources: sourceResult.rows.map((row) => Object.freeze({ ...mapSource(row), fragmentCount: row.fragment_count })),
        garmentGraph: graphResult.rows[0] ? mapGarmentGraphWorkspace(graphResult.rows[0]) : null,
        changeCases: changeCaseResult.rows.map((row)=>Object.freeze({
          ...mapChangeCase(row),
          supersededSourceId:row.superseded_source_id,
          replacementSourceId:row.replacement_source_id,
          impactCount:Number(row.impact_count),
          pendingImpactCount:Number(row.pending_impact_count),
          blockingImpactCount:Number(row.blocking_impact_count),
        })),
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
    async getApplicationIntentByProposal(proposalId) {
      const result = await client.query('SELECT * FROM product_engineering_application_intents WHERE proposal_id = $1', [proposalId]);
      return result.rows[0] ? mapApplicationIntent(result.rows[0]) : undefined;
    },
    async getApplicationReceiptByProposal(proposalId) {
      const result = await client.query('SELECT * FROM product_engineering_application_receipts WHERE proposal_id = $1', [proposalId]);
      return result.rows[0] ? mapApplicationReceipt(result.rows[0]) : undefined;
    },
    async getConflictForUpdate(id) {
      const result = await client.query('SELECT * FROM product_engineering_conflicts WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapConflict(result.rows[0]) : undefined;
    },
    async getDrawingForUpdate(id) {
      const result = await client.query('SELECT * FROM technical_drawing_versions WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapDrawing(result.rows[0]) : undefined;
    },
    async getDrawingObjects(drawingId) {
      const result = await client.query('SELECT * FROM technical_drawing_objects WHERE drawing_id = $1 ORDER BY created_at, id', [drawingId]);
      return result.rows.map(mapDrawingObject);
    },
    async getSourceForUpdate(id) {
      const result = await client.query('SELECT * FROM product_engineering_sources WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapSource(result.rows[0]) : undefined;
    },
    getSourceImpactLineage: (sourceId) => querySourceImpactLineage(client, sourceId),
    async getSourceRevisionBySuperseded(sourceId) {
      const result = await client.query('SELECT * FROM product_engineering_source_revisions WHERE superseded_source_id = $1', [sourceId]);
      return result.rows[0] ? mapSourceRevision(result.rows[0]) : undefined;
    },
    async getSourceRevisionByReplacement(sourceId) {
      const result = await client.query('SELECT * FROM product_engineering_source_revisions WHERE replacement_source_id = $1', [sourceId]);
      return result.rows[0] ? mapSourceRevision(result.rows[0]) : undefined;
    },
    async getChangeCaseForUpdate(id) {
      const result = await client.query('SELECT * FROM product_engineering_change_cases WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapChangeCase(result.rows[0]) : undefined;
    },
    async getChangeImpactForUpdate(id) {
      const result = await client.query('SELECT * FROM product_engineering_change_impacts WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapChangeImpact(result.rows[0]) : undefined;
    },
    async getChangeImpactReceiptByImpact(impactId) {
      const result = await client.query('SELECT * FROM product_engineering_change_impact_receipts WHERE impact_id = $1', [impactId]);
      return result.rows[0] ? mapChangeImpactReceipt(result.rows[0]) : undefined;
    },
    async countPendingChangeImpacts(changeCaseId) {
      const result = await client.query(`SELECT count(*)::integer AS count FROM product_engineering_change_impacts WHERE change_case_id=$1 AND status='pending'`, [changeCaseId]);
      return Number(result.rows[0]?.count ?? 0);
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

    async insertSourceRevision(value) {
      await client.query(
        `INSERT INTO product_engineering_source_revisions
          (id,brand_id,style_id,superseded_source_id,replacement_source_id,superseded_content_hash,replacement_content_hash,reason,created_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [value.id,value.brandId,value.styleId,value.supersededSourceId,value.replacementSourceId,value.supersededContentHash,value.replacementContentHash,value.reason,value.createdAt,value.createdBy],
      );
    },
    async insertChangeCase(value) {
      await client.query(
        `INSERT INTO product_engineering_change_cases
          (id,source_revision_id,brand_id,style_id,status,impact_snapshot,impact_hash,created_at,created_by,acknowledged_at,acknowledged_by,acknowledgement_note,resolved_at,resolved_by,version)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [value.id,value.sourceRevisionId,value.brandId,value.styleId,value.status,JSON.stringify(value.impactSnapshot),value.impactHash,value.createdAt,value.createdBy,value.acknowledgedAt,value.acknowledgedBy,value.acknowledgementNote,value.resolvedAt,value.resolvedBy,value.version],
      );
    },
    async insertChangeImpacts(changeCaseId, values) {
      for (const value of values) {
        await client.query(
          `INSERT INTO product_engineering_change_impacts
            (id,change_case_id,impact_kind,entity_id,entity_version,area,required_action,severity,evidence_status,basis,status,created_at,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'pending',$11,$12)`,
          [value.id,changeCaseId,value.impactKind,value.entityId,value.entityVersion,value.area,value.requiredAction,value.severity,value.evidenceStatus,JSON.stringify(value.basis),value.createdAt,value.createdBy],
        );
      }
    },
    async updateChangeCase(value, expectedVersion) {
      const result = await client.query(
        `UPDATE product_engineering_change_cases
            SET status=$2,acknowledged_at=$3,acknowledged_by=$4,acknowledgement_note=$5,resolved_at=$6,resolved_by=$7,version=$8
          WHERE id=$1 AND version=$9`,
        [value.id,value.status,value.acknowledgedAt,value.acknowledgedBy,value.acknowledgementNote,value.resolvedAt,value.resolvedBy,value.version,expectedVersion],
      );
      invariant(result.rowCount===1,'PRODUCT_ENGINEERING_CHANGE_CASE_CONCURRENCY_CONFLICT','Engineering change case changed concurrently',{changeCaseId:value.id,expectedVersion});
    },
    async insertChangeImpactReceipt(value) {
      await client.query(
        `INSERT INTO product_engineering_change_impact_receipts
          (id,change_case_id,impact_id,disposition,previous_impact_version,resulting_impact_version,reason,evidence,result_reference,waiver,receipt_hash,created_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13)`,
        [value.id,value.changeCaseId,value.impactId,value.disposition,value.previousImpactVersion,value.resultingImpactVersion,value.reason,
         JSON.stringify(value.evidence),value.resultReference===null?null:JSON.stringify(value.resultReference),value.waiver===null?null:JSON.stringify(value.waiver),
         value.receiptHash,value.createdAt,value.createdBy],
      );
    },
    async updateChangeImpact(value, expectedVersion) {
      const result = await client.query(
        `UPDATE product_engineering_change_impacts SET status=$2,version=$3 WHERE id=$1 AND version=$4`,
        [value.id,value.status,value.version,expectedVersion],
      );
      invariant(result.rowCount===1,'PRODUCT_ENGINEERING_CHANGE_IMPACT_CONCURRENCY_CONFLICT','Engineering change impact changed concurrently',{impactId:value.id,expectedVersion});
    },

    async insertSource(value) {
      await client.query(
        `INSERT INTO product_engineering_sources
          (id, brand_id, style_id, kind, ingest_mode, media_type, original_name, size_bytes, content_hash,
           storage_ref, source_uri, metadata, status, scan_status, parse_status, rejection_code,
           rejection_message, created_at, created_by, admitted_at, admitted_by, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          value.id, value.brandId, value.styleId, value.kind, value.ingestMode, value.mediaType, value.originalName,
          value.sizeBytes, value.contentHash, value.storageRef, value.sourceUri, JSON.stringify(value.metadata),
          value.status, value.scanStatus, value.parseStatus, value.rejectionCode, value.rejectionMessage,
          value.createdAt, value.createdBy, value.admittedAt, value.admittedBy, value.version,
        ],
      );
    },

    async insertSourceBlob(value) {
      await client.query(
        `INSERT INTO product_engineering_source_blobs
          (source_id, brand_id, style_id, media_type, size_bytes, content_hash, content, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [value.sourceId, value.brandId, value.styleId, value.mediaType, value.sizeBytes, value.contentHash, value.content, value.createdAt],
      );
    },

    async insertJob(value) {
      await client.query(
        `INSERT INTO product_engineering_jobs
          (id,dedupe_key,brand_id,style_id,source_id,analysis_run_id,job_type,status,payload,attempt_count,max_attempts,available_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8::jsonb,0,$9,$10,$10)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          value.id, value.dedupeKey, value.brandId, value.styleId, value.sourceId ?? null,
          value.analysisRunId ?? null, value.jobType, JSON.stringify(value.payload ?? {}),
          value.maxAttempts ?? 5, value.availableAt,
        ],
      );
    },

    async updateSource(value, expectedVersion) {
      const result = await client.query(
        `UPDATE product_engineering_sources
            SET metadata=$2::jsonb, status=$3, scan_status=$4, parse_status=$5, rejection_code=$6,
                rejection_message=$7, admitted_at=$8, admitted_by=$9, version=$10
          WHERE id=$1 AND version=$11`,
        [
          value.id, JSON.stringify(value.metadata), value.status, value.scanStatus, value.parseStatus,
          value.rejectionCode, value.rejectionMessage, value.admittedAt, value.admittedBy, value.version, expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'ENGINEERING_SOURCE_CONCURRENCY_CONFLICT', 'Engineering source changed concurrently', { sourceId: value.id, expectedVersion });
    },

    async insertFragment(value) {
      await client.query(
        `INSERT INTO product_engineering_source_fragments
          (id, source_id, brand_id, style_id, kind, locator, content, content_hash, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`,
        [
          value.id, value.sourceId, value.brandId, value.styleId, value.kind, JSON.stringify(value.locator),
          value.content === null ? null : JSON.stringify(value.content), value.contentHash, value.createdAt, value.createdBy,
        ],
      );
    },

    async insertGarmentGraph(value) {
      await client.query(
        `INSERT INTO product_engineering_garment_graphs
          (id,analysis_run_id,brand_id,style_id,schema_version,status,content_hash,node_count,edge_count,created_at,created_by,reviewed_at,reviewed_by,version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [value.id,value.analysisRunId,value.brandId,value.styleId,value.schemaVersion,value.status,value.contentHash,value.nodeCount,value.edgeCount,value.createdAt,value.createdBy,value.reviewedAt,value.reviewedBy,value.version],
      );
    },
    async insertGarmentNode(value) {
      await client.query(
        `INSERT INTO product_engineering_garment_nodes
          (id,graph_id,brand_id,style_id,node_type,semantic_code,label,attributes,confidence,finding_id,created_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
        [value.id,value.graphId,value.brandId,value.styleId,value.nodeType,value.semanticCode,value.label,JSON.stringify(value.attributes),value.confidence,value.findingId,value.createdAt,value.createdBy],
      );
    },
    async insertGarmentEdge(value) {
      await client.query(
        `INSERT INTO product_engineering_garment_edges
          (id,graph_id,brand_id,style_id,from_node_id,to_node_id,relation,attributes,confidence,created_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
        [value.id,value.graphId,value.brandId,value.styleId,value.fromNodeId,value.toNodeId,value.relation,JSON.stringify(value.attributes),value.confidence,value.createdAt,value.createdBy],
      );
    },
    async reviewGarmentGraph(value, expectedVersion) {
      const result=await client.query(
        `UPDATE product_engineering_garment_graphs
            SET status=$2,content_hash=$3,node_count=$4,edge_count=$5,reviewed_at=$6,reviewed_by=$7,version=$8
          WHERE id=$1 AND version=$9 AND status='draft'`,
        [value.id,value.status,value.contentHash,value.nodeCount,value.edgeCount,value.reviewedAt,value.reviewedBy,value.version,expectedVersion],
      );
      invariant(result.rowCount===1,'GARMENT_GRAPH_CONCURRENCY_CONFLICT','Garment graph changed concurrently',{graphId:value.id,expectedVersion});
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

    async insertApplicationIntent(value) {
      await client.query(
        `INSERT INTO product_engineering_application_intents
          (id,proposal_id,analysis_run_id,finding_id,brand_id,style_id,actor_id,application_command_id,canonical_command_id,
           target_authority,target_entity_id,target_action,expected_proposal_version,expected_canonical_version,
           precondition_snapshot,precondition_hash,deterministic_diff,lineage,intent_hash,prepared_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb,$18::jsonb,$19,$20)`,
        [
          value.id,value.proposalId,value.analysisRunId,value.findingId,value.brandId,value.styleId,value.actorId,
          value.applicationCommandId,value.canonicalCommandId,value.targetAuthority,value.targetEntityId,value.targetAction,
          value.expectedProposalVersion,value.expectedCanonicalVersion,JSON.stringify(value.preconditionSnapshot),value.preconditionHash,
          JSON.stringify(value.deterministicDiff),JSON.stringify(value.lineage),value.intentHash,value.preparedAt,
        ],
      );
    },

    async insertApplicationReceipt(value) {
      await client.query(
        `INSERT INTO product_engineering_application_receipts
          (id,intent_id,intent_hash,proposal_id,analysis_run_id,finding_id,brand_id,style_id,actor_id,application_command_id,canonical_command_id,
           target_authority,target_entity_id,target_action,expected_proposal_version,expected_canonical_version,resulting_canonical_version,
           precondition_hash,deterministic_diff,lineage,result_snapshot,result_hash,receipt_hash,applied_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,$21::jsonb,$22,$23,$24)`,
        [
          value.id,value.intentId,value.intentHash,value.proposalId,value.analysisRunId,value.findingId,value.brandId,value.styleId,value.actorId,
          value.applicationCommandId,value.canonicalCommandId,value.targetAuthority,value.targetEntityId,value.targetAction,
          value.expectedProposalVersion,value.expectedCanonicalVersion,value.resultingCanonicalVersion,value.preconditionHash,
          JSON.stringify(value.deterministicDiff),JSON.stringify(value.lineage),JSON.stringify(value.resultSnapshot),value.resultHash,
          value.receiptHash,value.appliedAt,
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
          (id, drawing_id, brand_id, style_id, object_type, semantic_code, garment_node_id, geometry, link_payload,
           confidence, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`,
        [
          value.id, value.drawingId, value.brandId, value.styleId, value.objectType, value.semanticCode,
          value.garmentNodeId, JSON.stringify(value.geometry), JSON.stringify(value.linkPayload),
          value.confidence, value.createdAt, value.createdBy,
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

async function querySourceImpactLineage(queryable, sourceId) {
  const [analysisResult,evidenceResult,findingResult,proposalResult,nodeResult,flatResult,receiptResult] = await Promise.all([
    queryable.query(`SELECT id,version FROM product_engineering_analysis_runs WHERE COALESCE(input_manifest->'sourceIds','[]'::jsonb) ? $1 ORDER BY id`, [sourceId]),
    queryable.query(`SELECT id,finding_id FROM product_engineering_evidence WHERE source_id=$1 ORDER BY id`, [sourceId]),
    queryable.query(`SELECT DISTINCT finding.id,finding.content_hash,finding.superseded_by_id
      FROM product_engineering_findings finding
      JOIN product_engineering_evidence evidence ON evidence.finding_id=finding.id
      WHERE evidence.source_id=$1 ORDER BY finding.id`, [sourceId]),
    queryable.query(`SELECT DISTINCT proposal.id,proposal.version,proposal.status,proposal.target_authority,proposal.target_field,proposal.target_entity_id
      FROM product_engineering_proposals proposal
      LEFT JOIN product_engineering_findings finding ON finding.id=proposal.finding_id
      LEFT JOIN product_engineering_evidence evidence ON evidence.finding_id=finding.id
      LEFT JOIN product_engineering_analysis_runs analysis ON analysis.id=proposal.analysis_run_id
      WHERE evidence.source_id=$1 OR COALESCE(analysis.input_manifest->'sourceIds','[]'::jsonb) ? $1
      ORDER BY proposal.id`, [sourceId]),
    queryable.query(`SELECT DISTINCT node.id,node.graph_id,node.node_type,node.finding_id
      FROM product_engineering_garment_nodes node
      JOIN product_engineering_garment_graphs graph ON graph.id=node.graph_id
      LEFT JOIN product_engineering_findings finding ON finding.id=node.finding_id
      LEFT JOIN product_engineering_evidence evidence ON evidence.finding_id=finding.id
      LEFT JOIN product_engineering_analysis_runs analysis ON analysis.id=graph.analysis_run_id
      WHERE evidence.source_id=$1 OR COALESCE(analysis.input_manifest->'sourceIds','[]'::jsonb) ? $1
      ORDER BY node.id`, [sourceId]),
    queryable.query(`SELECT DISTINCT object.id,object.drawing_id,drawing.version_no,object.object_type,object.garment_node_id
      FROM technical_drawing_objects object
      JOIN technical_drawing_versions drawing ON drawing.id=object.drawing_id
      JOIN product_engineering_garment_nodes node ON node.id=object.garment_node_id
      JOIN product_engineering_garment_graphs graph ON graph.id=node.graph_id
      LEFT JOIN product_engineering_findings finding ON finding.id=node.finding_id
      LEFT JOIN product_engineering_evidence evidence ON evidence.finding_id=finding.id
      LEFT JOIN product_engineering_analysis_runs analysis ON analysis.id=graph.analysis_run_id
      WHERE evidence.source_id=$1 OR COALESCE(analysis.input_manifest->'sourceIds','[]'::jsonb) ? $1
      ORDER BY object.id`, [sourceId]),
    queryable.query(`SELECT id,proposal_id,target_authority,target_entity_id,target_action,resulting_canonical_version,receipt_hash
      FROM product_engineering_application_receipts
      WHERE COALESCE(lineage->'sourceIds','[]'::jsonb) ? $1
      ORDER BY id`, [sourceId]),
  ]);
  return deepFreeze({
    analyses: analysisResult.rows.map(row=>Object.freeze({id:row.id,version:row.version})),
    evidence: evidenceResult.rows.map(row=>Object.freeze({id:row.id,findingId:row.finding_id})),
    findings: findingResult.rows.map(row=>Object.freeze({id:row.id,contentHash:row.content_hash,supersededById:row.superseded_by_id})),
    proposals: proposalResult.rows.map(row=>Object.freeze({id:row.id,version:row.version,status:row.status,targetAuthority:row.target_authority,targetField:row.target_field,targetEntityId:row.target_entity_id})),
    garmentNodes: nodeResult.rows.map(row=>Object.freeze({id:row.id,graphId:row.graph_id,nodeType:row.node_type,findingId:row.finding_id})),
    technicalFlats: flatResult.rows.map(row=>Object.freeze({id:row.id,drawingId:row.drawing_id,drawingVersionNo:row.version_no,objectType:row.object_type,garmentNodeId:row.garment_node_id})),
    receipts: receiptResult.rows.map(row=>Object.freeze({id:row.id,proposalId:row.proposal_id,targetAuthority:row.target_authority,targetEntityId:row.target_entity_id,targetAction:row.target_action,resultingCanonicalVersion:row.resulting_canonical_version,receiptHash:row.receipt_hash})),
  });
}

function mapSourceRevision(row) {
  return Object.freeze({
    id:row.id,brandId:row.brand_id,styleId:row.style_id,supersededSourceId:row.superseded_source_id,replacementSourceId:row.replacement_source_id,
    supersededContentHash:row.superseded_content_hash,replacementContentHash:row.replacement_content_hash,reason:row.reason,createdAt:iso(row.created_at),createdBy:row.created_by,
  });
}
function mapChangeCase(row) {
  return Object.freeze({
    id:row.id,sourceRevisionId:row.source_revision_id,brandId:row.brand_id,styleId:row.style_id,status:row.status,
    impactSnapshot:deepFreeze(row.impact_snapshot),impactHash:row.impact_hash,createdAt:iso(row.created_at),createdBy:row.created_by,
    acknowledgedAt:iso(row.acknowledged_at),acknowledgedBy:row.acknowledged_by,acknowledgementNote:row.acknowledgement_note,
    resolvedAt:iso(row.resolved_at),resolvedBy:row.resolved_by,version:row.version,
  });
}
function mapChangeImpact(row) {
  return Object.freeze({
    id:row.id,changeCaseId:row.change_case_id,impactKind:row.impact_kind,entityId:row.entity_id,entityVersion:row.entity_version,
    area:row.area,requiredAction:row.required_action,severity:row.severity,evidenceStatus:row.evidence_status,basis:deepFreeze(row.basis),
    status:row.status,createdAt:iso(row.created_at),createdBy:row.created_by,version:row.version ?? 1,
  });
}
function mapChangeImpactReceipt(row) {
  return Object.freeze({
    id:row.id,changeCaseId:row.change_case_id,impactId:row.impact_id,disposition:row.disposition,
    previousImpactVersion:row.previous_impact_version,resultingImpactVersion:row.resulting_impact_version,reason:row.reason,
    evidence:deepFreeze(row.evidence ?? []),resultReference:row.result_reference===null?null:deepFreeze(row.result_reference),
    waiver:row.waiver===null?null:deepFreeze(row.waiver),receiptHash:row.receipt_hash,createdAt:iso(row.created_at),createdBy:row.created_by,
  });
}

function mapGarmentGraphWorkspace(row) {
  return Object.freeze({
    id: row.id, analysisRunId: row.analysis_run_id, brandId: row.brand_id, styleId: row.style_id,
    schemaVersion: row.schema_version, status: row.status, contentHash: row.content_hash,
    nodeCount: Number(row.node_count), edgeCount: Number(row.edge_count),
    createdAt: iso(row.created_at), createdBy: row.created_by, reviewedAt: iso(row.reviewed_at), reviewedBy: row.reviewed_by,
    version: row.version,
    nodes: deepFreeze((row.nodes ?? []).map((node) => Object.freeze({
      ...node,
      confidence: numberOrNull(node.confidence),
    }))),
    edges: deepFreeze((row.edges ?? []).map((edge) => Object.freeze({
      ...edge,
      confidence: numberOrNull(edge.confidence),
    }))),
  });
}

function mapSourceBlob(row) {
  return Object.freeze({
    sourceId: row.source_id, brandId: row.brand_id, styleId: row.style_id, mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes), contentHash: row.content_hash,
    content: new Uint8Array(row.content), createdAt: iso(row.created_at),
  });
}

function mapSource(row) {
  return Object.freeze({
    id: row.id, brandId: row.brand_id, styleId: row.style_id, kind: row.kind, ingestMode: row.ingest_mode,
    mediaType: row.media_type, originalName: row.original_name, sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    contentHash: row.content_hash, storageRef: row.storage_ref, sourceUri: row.source_uri,
    metadata: deepFreeze(row.metadata ?? {}), status: row.status, scanStatus: row.scan_status, parseStatus: row.parse_status,
    rejectionCode: row.rejection_code, rejectionMessage: row.rejection_message, createdAt: iso(row.created_at),
    createdBy: row.created_by, admittedAt: iso(row.admitted_at), admittedBy: row.admitted_by, version: row.version,
  });
}

function mapFragment(row) {
  return Object.freeze({
    id: row.id, sourceId: row.source_id, brandId: row.brand_id, styleId: row.style_id, kind: row.kind,
    locator: deepFreeze(row.locator ?? {}), content: row.content === null ? null : deepFreeze(row.content),
    contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by,
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

function mapApplicationIntent(row) {
  return Object.freeze({
    id:row.id, proposalId:row.proposal_id, analysisRunId:row.analysis_run_id, findingId:row.finding_id,
    brandId:row.brand_id, styleId:row.style_id, actorId:row.actor_id, applicationCommandId:row.application_command_id,
    canonicalCommandId:row.canonical_command_id, targetAuthority:row.target_authority, targetEntityId:row.target_entity_id,
    targetAction:row.target_action, expectedProposalVersion:row.expected_proposal_version, expectedCanonicalVersion:row.expected_canonical_version,
    preconditionSnapshot:deepFreeze(row.precondition_snapshot), preconditionHash:row.precondition_hash,
    deterministicDiff:deepFreeze(row.deterministic_diff), lineage:deepFreeze(row.lineage), intentHash:row.intent_hash,
    preparedAt:iso(row.prepared_at),
  });
}

function mapApplicationReceipt(row) {
  return Object.freeze({
    id:row.id, intentId:row.intent_id, intentHash:row.intent_hash, proposalId:row.proposal_id, analysisRunId:row.analysis_run_id, findingId:row.finding_id,
    brandId:row.brand_id, styleId:row.style_id, actorId:row.actor_id, applicationCommandId:row.application_command_id,
    canonicalCommandId:row.canonical_command_id, targetAuthority:row.target_authority, targetEntityId:row.target_entity_id,
    targetAction:row.target_action, expectedProposalVersion:row.expected_proposal_version, expectedCanonicalVersion:row.expected_canonical_version,
    resultingCanonicalVersion:row.resulting_canonical_version, preconditionHash:row.precondition_hash,
    deterministicDiff:deepFreeze(row.deterministic_diff), lineage:deepFreeze(row.lineage), resultSnapshot:deepFreeze(row.result_snapshot),
    resultHash:row.result_hash, receiptHash:row.receipt_hash, appliedAt:iso(row.applied_at),
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

function mapDrawingObject(row) {
  return Object.freeze({
    id: row.id, drawingId: row.drawing_id, brandId: row.brand_id, styleId: row.style_id,
    objectType: row.object_type, semanticCode: row.semantic_code, garmentNodeId: row.garment_node_id ?? null,
    geometry: deepFreeze(row.geometry ?? {}), linkPayload: deepFreeze(row.link_payload ?? {}),
    confidence: numberOrNull(row.confidence), createdAt: iso(row.created_at), createdBy: row.created_by,
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
