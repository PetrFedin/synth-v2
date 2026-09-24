import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresSupplierEconomicPerformanceReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView }) });
}

function createView(client) {
  return Object.freeze({
    async getSupplierByCode(supplierCode) {
      const result = await client.query(
        'SELECT payload FROM suppliers WHERE supplier_code = $1 FOR SHARE',
        [supplierCode],
      );
      return result.rows[0]?.payload;
    },
    async getMembership(organisationId, userId) {
      const result = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE',
        [organisationId, userId],
      );
      return result.rows[0]?.payload;
    },
    async getOperationalPerformance(brandId, supplierCode) {
      const result = await client.query(
        `SELECT *
           FROM supplier_operational_performance
          WHERE brand_id = $1 AND supplier_code = $2`,
        [brandId, supplierCode],
      );
      return result.rows[0] ? mapOperational(result.rows[0]) : null;
    },
    async listFailureEconomics(brandId, supplierCode) {
      const result = await client.query(
        `SELECT *
           FROM supplier_failure_economics_by_currency
          WHERE brand_id = $1 AND supplier_code = $2
          ORDER BY currency`,
        [brandId, supplierCode],
      );
      return result.rows.map(mapEconomics);
    },
  });
}

function mapOperational(row) {
  return Object.freeze({
    supplierId: row.supplier_id,
    brandId: row.brand_id,
    supplierCode: row.supplier_code,
    supplierStatus: row.supplier_status,
    productionOrderCount: integer(row.production_order_count),
    confirmedOrderCount: integer(row.confirmed_order_count),
    orderedUnits: integer(row.ordered_units),
    executionCount: integer(row.execution_count),
    readyForQcCount: integer(row.ready_for_qc_count),
    onTimeReadyForQcCount: integer(row.on_time_ready_for_qc_count),
    lateReadyForQcCount: integer(row.late_ready_for_qc_count),
    qualityInspectionCount: integer(row.quality_inspection_count),
    releasedInspectionCount: integer(row.released_inspection_count),
    rejectedInspectionCount: integer(row.rejected_inspection_count),
    reworkInspectionCount: integer(row.rework_inspection_count),
    reviewedFirstRunCount: integer(row.reviewed_first_run_count),
    firstPassReleaseCount: integer(row.first_pass_release_count),
    reworkRunCount: integer(row.rework_run_count),
    criticalDefectCount: integer(row.critical_defect_count),
    majorDefectCount: integer(row.major_defect_count),
    minorDefectCount: integer(row.minor_defect_count),
    // Пооперационный контроль: поймала ли фабрика свой брак сама.
    inlineCheckCount: integer(row.inline_check_count),
    openInlineCheckCount: integer(row.open_inline_check_count),
    executionsWithInlineChecks: integer(row.executions_with_inline_checks),
    inlineCheckedUnits: integer(row.inline_checked_units),
    inlineDefectiveUnits: integer(row.inline_defective_units),
    inlineCriticalDefectCount: integer(row.inline_critical_defect_count),
    inlineMajorDefectCount: integer(row.inline_major_defect_count),
    inlineMinorDefectCount: integer(row.inline_minor_defect_count),
    inlineReworkCount: integer(row.inline_rework_count),
    inlineScrapCount: integer(row.inline_scrap_count),
    inlineAcceptedCount: integer(row.inline_accepted_count),
  });
}

function mapEconomics(row) {
  return Object.freeze({
    brandId: row.brand_id,
    supplierCode: row.supplier_code,
    currency: row.currency,
    attributedDiscrepancyCount: integer(row.attributed_discrepancy_count),
    recoveryCount: integer(row.recovery_count),
    recoveredDiscrepancyCount: integer(row.recovered_discrepancy_count),
    confirmedFailureCost: number(row.confirmed_failure_cost),
    recoveryCreditAmount: number(row.recovery_credit_amount),
    netConfirmedFailureCost: number(row.net_confirmed_failure_cost),
  });
}

function integer(value) {
  const normalized = Number(value);
  invariant(Number.isSafeInteger(normalized) && normalized >= 0, 'SUPPLIER_PERFORMANCE_INTEGER_INVALID', 'Supplier performance integer value is invalid', { value });
  return normalized;
}
function number(value) {
  const normalized = Number(value);
  invariant(Number.isFinite(normalized), 'SUPPLIER_PERFORMANCE_NUMBER_INVALID', 'Supplier performance numeric value is invalid', { value });
  return normalized;
}
