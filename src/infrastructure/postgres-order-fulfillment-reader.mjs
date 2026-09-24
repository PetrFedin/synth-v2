import { invariant } from '../core/errors.mjs';

/**
 * Чтение отгрузочного хвоста одного заказа.
 *
 * Записи хвоста читались до сих пор **только поштучно, по идентификатору**: план, уведомление,
 * приёмка, расхождение. Спросить «что с этим заказом» было нечем, и это, а не отсутствие вёрстки,
 * держало экран логистики пустым — показывать было нечего, потому что нечего было запросить.
 *
 * Один запрос на всю цепочку, а не пять по кругу: хвост читают целиком, в порядке событий, и
 * отдельные обращения на каждый уровень означали бы N+1 там, где заведомо нужен весь список.
 *
 * @param {{ pool?: any }} [options]
 */
export function createPostgresOrderFulfillmentReader({ pool } = {}) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  return Object.freeze({
    async readOrderFulfillment(orderId) {
      const plans = await pool.query(
        'SELECT payload FROM fulfillment_plan_snapshots WHERE order_id = $1 ORDER BY created_at, id',
        [orderId],
      );
      if (!plans.rowCount) return Object.freeze([]);

      const planIds = plans.rows.map((row) => row.payload.id);
      const notices = await pool.query(
        'SELECT payload FROM shipment_notice_snapshots WHERE fulfillment_plan_snapshot_id = ANY($1) ORDER BY shipped_at, id',
        [planIds],
      );
      const noticeIds = notices.rows.map((row) => row.payload.id);
      const receipts = noticeIds.length
        ? await pool.query('SELECT payload FROM receipt_snapshots WHERE shipment_notice_snapshot_id = ANY($1) ORDER BY received_at, id', [noticeIds])
        : { rows: [] };
      const discrepancies = noticeIds.length
        ? await pool.query('SELECT payload FROM receipt_discrepancy_snapshots WHERE shipment_notice_snapshot_id = ANY($1) ORDER BY created_at, id', [noticeIds])
        : { rows: [] };
      const discrepancyIds = discrepancies.rows.map((row) => row.payload.id);
      const claims = discrepancyIds.length
        ? await pool.query('SELECT payload FROM receipt_discrepancy_claim_snapshots WHERE receipt_discrepancy_snapshot_id = ANY($1) ORDER BY submitted_at, id', [discrepancyIds])
        : { rows: [] };
      const claimIds = claims.rows.map((row) => row.payload.id);
      const resolutions = claimIds.length
        ? await pool.query('SELECT payload FROM receipt_claim_resolution_snapshots WHERE claim_snapshot_id = ANY($1) ORDER BY resolved_at, id', [claimIds])
        : { rows: [] };

      const resolutionByClaim = new Map(resolutions.rows.map((row) => [row.payload.claimSnapshotId, row.payload]));
      const claimByDiscrepancy = new Map(claims.rows.map((row) => [row.payload.receiptDiscrepancySnapshotId, row.payload]));
      // Расхождение пересчитывается после каждой приёмки, поэтому последнее и есть действующее:
      // показывать первое значило бы показывать позавчерашнюю недостачу.
      const discrepancyByNotice = new Map();
      for (const row of discrepancies.rows) discrepancyByNotice.set(row.payload.shipmentNoticeSnapshotId, row.payload);

      const receiptsByNotice = new Map();
      for (const row of receipts.rows) {
        const list = receiptsByNotice.get(row.payload.shipmentNoticeSnapshotId) ?? [];
        list.push(row.payload);
        receiptsByNotice.set(row.payload.shipmentNoticeSnapshotId, list);
      }
      const noticesByPlan = new Map();
      for (const row of notices.rows) {
        const list = noticesByPlan.get(row.payload.fulfillmentPlanSnapshotId) ?? [];
        list.push(row.payload);
        noticesByPlan.set(row.payload.fulfillmentPlanSnapshotId, list);
      }

      return Object.freeze(plans.rows.map((row) => {
        const plan = row.payload;
        return Object.freeze({
          ...plan,
          shipments: Object.freeze((noticesByPlan.get(plan.id) ?? []).map((notice) => {
            const discrepancy = discrepancyByNotice.get(notice.id) ?? null;
            const claim = discrepancy ? claimByDiscrepancy.get(discrepancy.id) ?? null : null;
            return Object.freeze({
              ...notice,
              receipts: Object.freeze(receiptsByNotice.get(notice.id) ?? []),
              discrepancy,
              claim,
              claimResolution: claim ? resolutionByClaim.get(claim.id) ?? null : null,
            });
          })),
        });
      }));
    },
  });
}
