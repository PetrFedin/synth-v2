import { invariant } from '../core/errors.mjs';
import { AWAITING_ACTION_TYPE_CODES, rolesForAwaitingAction } from '../modules/awaiting-action/public.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

// Whose move it is is a fact about the state of other tables, so this reader owns no data: it asks
// each of them "which of you is waiting for somebody this person can stand in for".
//
// Everything is one statement. The reader's memberships are a CTE, every kind of waiting work is a
// branch of a UNION that joins that CTE on the organisation that owns the move and on the roles
// that hold the capability the executing command checks, and the counters come from the same
// branches in the same snapshot. A branch is added to the statement only when its type was asked
// for, so a screen that wants one family does not pay for the others, and a role that holds no
// capability of a type matches no row of it.
//
// `$1` actor, `$2` reference time, `$3` page size; role arrays follow, one per requested type.
const PARTY_NAME = (organisationAlias, left, right) => `(SELECT organisation.payload->>'name' FROM organisations AS organisation
        WHERE organisation.id = CASE WHEN ${organisationAlias}.organisation_id = ${left} THEN ${right} ELSE ${left} END)`;

const BRANCHES = Object.freeze({
  'order-accept-terms': (roles) => `
    SELECT 'order-accept-terms'::text AS type, ord.id AS entity_id, ord.id AS label, me.organisation_id,
           COALESCE((ord.payload->>'updatedAt')::timestamptz, (ord.payload->>'createdAt')::timestamptz) AS since,
           NULL::timestamptz AS due_at,
           jsonb_build_object('status', ord.status, 'currency', ord.currency, 'totalAmount', ord.total_amount,
                              'counterpartyName', ${PARTY_NAME('me', 'ord.brand_id', 'ord.shop_id')}) AS detail
      FROM orders AS ord
      JOIN me ON me.organisation_id IN (ord.brand_id, ord.shop_id) AND me.role = ANY(${roles}::text[])
     WHERE ord.status IN ('draft', 'ready')
       AND NOT (COALESCE(ord.payload->'acceptedOrganisationIds', '[]'::jsonb) @> to_jsonb(me.organisation_id))`,

  'order-attach': (roles) => `
    SELECT 'order-attach'::text, ord.id, ord.id, me.organisation_id,
           COALESCE((ord.payload->>'updatedAt')::timestamptz, (ord.payload->>'createdAt')::timestamptz),
           NULL::timestamptz,
           jsonb_build_object('status', ord.status, 'currency', ord.currency, 'totalAmount', ord.total_amount,
                              'counterpartyName', ${PARTY_NAME('me', 'ord.brand_id', 'ord.shop_id')})
      FROM orders AS ord
      JOIN me ON me.organisation_id IN (ord.brand_id, ord.shop_id) AND me.role = ANY(${roles}::text[])
     WHERE ord.status = 'ready'`,

  // The proposer cannot answer its own proposal, and an amendment applies only to an attached
  // order: both are the rules `respondToOrderAmendment` enforces, so both are applied here.
  'order-amendment-response': (roles) => `
    SELECT 'order-amendment-response'::text, amendment.id, ord.id || ' · ' || amendment.line_no::text, me.organisation_id,
           amendment.proposed_at, NULL::timestamptz,
           jsonb_build_object('orderId', ord.id, 'lineNo', amendment.line_no, 'currentQuantity', amendment.current_quantity,
                              'proposedQuantity', amendment.proposed_quantity, 'deltaAmount', amendment.delta_amount,
                              'currency', amendment.currency)
      FROM order_amendments AS amendment
      JOIN orders AS ord ON ord.id = amendment.order_id AND ord.status = 'attached'
      JOIN me ON me.organisation_id IN (ord.brand_id, ord.shop_id) AND me.role = ANY(${roles}::text[])
     WHERE amendment.status = 'proposed'
       AND me.organisation_id <> amendment.proposed_organisation_id`,

  // Поставка ждёт приёмки, пока нет окончательной приёмки (`receiptComplete`): частичная приёмка
  // дело не закрывает, потому что недостача фиксируется только окончательной. Срок — ожидаемая
  // доставка по уведомлению об отгрузке. Приёмку проводит только магазин-получатель.
  'receipt-accept': (roles) => `
    SELECT 'receipt-accept'::text, sn.id, sn.shipment_number, me.organisation_id,
           sn.shipped_at, sn.expected_delivery_at,
           jsonb_build_object('orderId', sn.order_id, 'shipmentNumber', sn.shipment_number, 'carrier', sn.carrier,
                              'counterpartyName', ${PARTY_NAME('me', 'sn.brand_id', 'sn.shop_id')})
      FROM shipment_notice_snapshots AS sn
      JOIN me ON me.organisation_id = sn.shop_id AND me.role = ANY(${roles}::text[])
     WHERE NOT EXISTS (SELECT 1 FROM receipt_snapshots AS rcpt
                        WHERE rcpt.shipment_notice_snapshot_id = sn.id AND rcpt.receipt_complete)`,

  // Претензия ждёт решения, пока у неё нет решения: оно неизменяемо и одно на претензию. Решает
  // только бренд-продавец (`resolveClaim`).
  'claim-resolve': (roles) => `
    SELECT 'claim-resolve'::text, claim.id, claim.claim_reference, me.organisation_id,
           claim.submitted_at, NULL::timestamptz,
           jsonb_build_object('orderId', claim.order_id, 'claimReference', claim.claim_reference,
                              'requestedRemedy', claim.requested_remedy,
                              'counterpartyName', ${PARTY_NAME('me', 'claim.brand_id', 'claim.shop_id')})
      FROM receipt_discrepancy_claim_snapshots AS claim
      JOIN me ON me.organisation_id = claim.brand_id AND me.role = ANY(${roles}::text[])
     WHERE NOT EXISTS (SELECT 1 FROM receipt_claim_resolution_snapshots AS resolution
                        WHERE resolution.claim_snapshot_id = claim.id)`,

  'selection-approval': (roles) => `
    SELECT 'selection-approval'::text, sel.id, sel.id, me.organisation_id,
           COALESCE((sel.payload->>'approvalRequestedAt')::timestamptz, (sel.payload->>'updatedAt')::timestamptz),
           NULL::timestamptz,
           jsonb_build_object('brandId', sel.brand_id, 'collectionId', sel.collection_id)
      FROM selections AS sel
      JOIN me ON me.organisation_id = sel.shop_id AND me.role = ANY(${roles}::text[])
     WHERE sel.status = 'pending_approval'`,

  // The side that did not ask is the side that answers (`acceptRelationship`).
  'relationship-response': (roles) => `
    SELECT 'relationship-response'::text, rel.id, rel.id, me.organisation_id,
           COALESCE((rel.payload->>'updatedAt')::timestamptz, (rel.payload->>'createdAt')::timestamptz),
           NULL::timestamptz,
           jsonb_build_object('brandId', rel.brand_id, 'shopId', rel.shop_id,
                              'counterpartyName', ${PARTY_NAME('me', 'rel.brand_id', 'rel.shop_id')})
      FROM counterparty_relationships AS rel
      JOIN me ON me.organisation_id IN (rel.brand_id, rel.shop_id) AND me.role = ANY(${roles}::text[])
     WHERE rel.status = 'pending'
       AND me.organisation_id IS DISTINCT FROM rel.payload->>'requestedByOrganisationId'`,

  // An invitation that has run out is not waiting: it can no longer be accepted.
  'showroom-invitation-response': (roles) => `
    SELECT 'showroom-invitation-response'::text, inv.id, inv.showroom_id, me.organisation_id,
           COALESCE((inv.payload->>'updatedAt')::timestamptz, (inv.payload->>'createdAt')::timestamptz),
           inv.expires_at,
           jsonb_build_object('showroomId', inv.showroom_id, 'brandId', inv.brand_id,
                              'counterpartyName', (SELECT organisation.payload->>'name' FROM organisations AS organisation WHERE organisation.id = inv.brand_id))
      FROM showroom_invitations AS inv
      JOIN me ON me.organisation_id = inv.shop_id AND me.role = ANY(${roles}::text[])
     WHERE inv.status = 'pending' AND inv.expires_at > $2::timestamptz`,

  'rfq-award': (roles) => `
    SELECT 'rfq-award'::text, rfq.rfq_code, rfq.rfq_code || ' · ' || rfq.sku, me.organisation_id,
           rfq.updated_at, NULL::timestamptz,
           jsonb_build_object('sku', rfq.sku, 'targetQuantity', rfq.target_quantity,
                              'quoteCount', jsonb_array_length(COALESCE(rfq.payload->'quotes', '[]'::jsonb)))
      FROM sourcing_rfqs AS rfq
      JOIN me ON me.organisation_id = rfq.brand_id AND me.role = ANY(${roles}::text[])
     WHERE rfq.status = 'quoted'`,

  'material-rfq-award': (roles) => `
    SELECT 'material-rfq-award'::text, rfq.rfq_code, rfq.rfq_code || ' · ' || rfq.material_code, me.organisation_id,
           rfq.updated_at, NULL::timestamptz,
           jsonb_build_object('materialCode', rfq.material_code, 'targetQuantity', rfq.target_quantity, 'unit', rfq.unit,
                              'quoteCount', jsonb_array_length(COALESCE(rfq.payload->'quotes', '[]'::jsonb)))
      FROM material_rfqs AS rfq
      JOIN me ON me.organisation_id = rfq.brand_id AND me.role = ANY(${roles}::text[])
     WHERE rfq.status = 'quoted'`,

  'production-order-confirm': (roles) => `
    SELECT 'production-order-confirm'::text, po.production_order_number, po.production_order_number, me.organisation_id,
           COALESCE(po.issued_at, po.updated_at), NULL::timestamptz,
           jsonb_build_object('sku', po.sku, 'supplierCode', po.supplier_code, 'quantity', po.quantity)
      FROM production_orders AS po
      JOIN me ON me.organisation_id = po.brand_id AND me.role = ANY(${roles}::text[])
     WHERE po.status = 'issued'`,

  'material-purchase-order-confirm': (roles) => `
    SELECT 'material-purchase-order-confirm'::text, mpo.purchase_order_number, mpo.purchase_order_number, me.organisation_id,
           COALESCE(mpo.issued_at, mpo.updated_at), NULL::timestamptz,
           jsonb_build_object('materialCode', mpo.material_code, 'supplierCode', mpo.supplier_code, 'quantity', mpo.quantity, 'unit', mpo.unit)
      FROM material_purchase_orders AS mpo
      JOIN me ON me.organisation_id = mpo.brand_id AND me.role = ANY(${roles}::text[])
     WHERE mpo.status = 'issued'`,

  'tech-pack-acknowledge': (roles) => `
    SELECT 'tech-pack-acknowledge'::text, tp.tech_pack_code, tp.tech_pack_code, me.organisation_id,
           COALESCE(tp.issued_at, tp.updated_at), NULL::timestamptz,
           jsonb_build_object('sku', tp.sku, 'revision', tp.revision, 'supplierCode', tp.supplier_code)
      FROM tech_packs AS tp
      JOIN me ON me.organisation_id = tp.brand_id AND me.role = ANY(${roles}::text[])
     WHERE tp.status = 'issued'`,

  'sample-decision': (roles) => `
    SELECT 'sample-decision'::text, smp.sample_code, smp.sample_code, me.organisation_id,
           COALESCE(smp.received_at, smp.updated_at), NULL::timestamptz,
           jsonb_build_object('sku', smp.sku, 'round', smp.round, 'sampleType', smp.sample_type)
      FROM samples AS smp
      JOIN me ON me.organisation_id = smp.brand_id AND me.role = ANY(${roles}::text[])
     WHERE smp.status = 'received'`,

  // The person who inspected the run, or closed it, cannot sign it off: `review` refuses them with
  // QUALITY_SELF_APPROVAL_FORBIDDEN, so the list does not offer them the decision.
  'inspection-review': (roles) => `
    SELECT 'inspection-review'::text, qi.inspection_code, qi.inspection_code, me.organisation_id,
           qi.updated_at, NULL::timestamptz,
           jsonb_build_object('sku', qi.sku, 'productionOrderNumber', qi.production_order_number, 'quantity', qi.quantity,
                              'recommendation', qi.payload->'runs'->(-1)->>'recommendation')
      FROM quality_inspections AS qi
      JOIN me ON me.organisation_id = qi.brand_id AND me.role = ANY(${roles}::text[])
     WHERE qi.status = 'review-pending'
       AND COALESCE(qi.payload->'runs'->(-1)->>'inspectorId', '') <> $1
       AND COALESCE(qi.payload->'runs'->(-1)->>'completedBy', '') <> $1`,

  'material-lot-release': (roles) => `
    SELECT 'material-lot-release'::text, lot.id, lot.material_code || ' · ' || lot.lot_reference, me.organisation_id,
           lot.updated_at, NULL::timestamptz,
           jsonb_build_object('materialCode', lot.material_code, 'lotReference', lot.lot_reference, 'supplierCode', lot.supplier_code,
                              'receivedQuantity', lot.received_quantity, 'unit', lot.unit)
      FROM material_lots AS lot
      JOIN me ON me.organisation_id = lot.brand_id AND me.role = ANY(${roles}::text[])
     WHERE lot.status = 'quarantine'`,

  'lab-dip-decision': (roles) => `
    SELECT 'lab-dip-decision'::text, dip.id, dip.dip_reference, me.organisation_id,
           COALESCE(dip.submitted_at, dip.updated_at), NULL::timestamptz,
           jsonb_build_object('materialCode', dip.material_code, 'colourCode', dip.colour_code, 'submissionRound', dip.submission_round,
                              'supplierCode', dip.supplier_code)
      FROM lab_dips AS dip
      JOIN me ON me.organisation_id = dip.brand_id AND me.role = ANY(${roles}::text[])
     WHERE dip.status = 'submitted'`,

  // Falls due when its trigger has happened (the same evidence `paymentScheduleView` reads) and is
  // late once the schedule's term has run out. An unpaid milestone whose trigger has not happened
  // is a forecast, not a debt, and is not listed.
  'supplier-payment': (roles) => `
    SELECT 'supplier-payment'::text, sched.production_order_number || '#' || milestone.sequence::text,
           sched.production_order_number || ' · ' || milestone.label_ru, me.organisation_id,
           evidence.occurred_at, evidence.occurred_at + sched.payment_terms_days * interval '1 day',
           jsonb_build_object('productionOrderNumber', sched.production_order_number, 'sequence', milestone.sequence,
                              'triggerEvent', milestone.trigger_event, 'amountMinor', milestone.amount_minor,
                              'currency', sched.currency, 'supplierCode', sched.supplier_code)
      FROM payment_milestones AS milestone
      JOIN payment_schedules AS sched ON sched.id = milestone.schedule_id
      JOIN me ON me.organisation_id = sched.brand_id AND me.role = ANY(${roles}::text[])
      JOIN production_orders AS po ON po.production_order_number = sched.production_order_number
      LEFT JOIN production_executions AS execution ON execution.production_order_number = sched.production_order_number
      CROSS JOIN LATERAL (SELECT CASE milestone.trigger_event
          WHEN 'order-confirmed' THEN po.confirmed_at
          WHEN 'production-started' THEN execution.started_at
          WHEN 'ready-for-quality-control' THEN execution.ready_for_qc_at
          WHEN 'shipment-released' THEN (SELECT min(release.released_at) FROM quality_shipment_releases AS release
                                          WHERE release.production_order_number = sched.production_order_number)
        END AS occurred_at) AS evidence
     WHERE milestone.paid_at IS NULL AND evidence.occurred_at IS NOT NULL`,

  'compliance-document-issue': (roles) => `
    SELECT 'compliance-document-issue'::text, doc.id, doc.document_number, me.organisation_id,
           doc.updated_at, NULL::timestamptz,
           jsonb_build_object('documentNumber', doc.document_number, 'documentType', doc.document_type)
      FROM compliance_documents AS doc
      JOIN me ON me.organisation_id = doc.organisation_id AND me.role = ANY(${roles}::text[])
     WHERE doc.status = 'draft'`,
});

invariant(
  AWAITING_ACTION_TYPE_CODES.every((type) => typeof BRANCHES[type] === 'function') && Object.keys(BRANCHES).length === AWAITING_ACTION_TYPE_CODES.length,
  'AWAITING_ACTION_BRANCHES_INCOMPLETE',
  'Every awaiting action type needs exactly one reader branch',
);

/** @param {{ pool?: any }} [options] */
export function createPostgresAwaitingActionReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'AWAITING_ACTION_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    forActor(actorId, { types, limit, asOf }) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'AWAITING_ACTION_ACTOR_REQUIRED', 'Actor is required');
      invariant(Array.isArray(types) && types.every((type) => AWAITING_ACTION_TYPE_CODES.includes(type)), 'AWAITING_ACTION_TYPE_INVALID', 'Awaiting action type is invalid');
      invariant(Number.isInteger(limit) && limit >= 0, 'AWAITING_ACTION_LIMIT_INVALID', 'Limit is invalid');
      if (types.length === 0) return Promise.resolve({ rows: [], counts: [] });
      const parameters = [actorId, asOf, limit];
      const branches = types.map((type) => {
        parameters.push(rolesForAwaitingAction(type));
        return BRANCHES[type](`$${parameters.length}`);
      });
      const statement = `
        WITH me AS (
          SELECT organisation_id, role FROM memberships WHERE user_id = $1 AND status = 'active'
        ), waiting (type, entity_id, label, organisation_id, since, due_at, detail) AS (
          ${branches.join('\n          UNION ALL\n')}
        ), flagged AS (
          SELECT waiting.*, (waiting.due_at IS NOT NULL AND waiting.due_at < $2::timestamptz) AS overdue FROM waiting
        ), ranked AS (
          SELECT flagged.*, row_number() OVER (
                   ORDER BY flagged.overdue DESC,
                            CASE WHEN flagged.overdue THEN flagged.due_at END ASC NULLS LAST,
                            flagged.since ASC NULLS LAST, flagged.type, flagged.entity_id, flagged.organisation_id) AS rank_no
            FROM flagged
        )
        SELECT 'item'::text AS row_kind, type, entity_id, label, organisation_id, since, due_at, detail, overdue,
               NULL::bigint AS item_count, NULL::bigint AS overdue_count, rank_no
          FROM ranked WHERE rank_no <= $3
        UNION ALL
        SELECT 'count'::text, type, NULL, NULL, NULL, NULL::timestamptz, NULL::timestamptz, NULL::jsonb, NULL::boolean,
               count(*)::bigint, count(*) FILTER (WHERE overdue)::bigint, NULL::bigint
          FROM flagged GROUP BY type
        ORDER BY row_kind, rank_no NULLS LAST`;
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(statement, parameters);
        const rows = [];
        const counts = [];
        for (const row of result.rows) {
          if (row.row_kind === 'count') {
            counts.push({ type: row.type, count: Number(row.item_count), overdue: Number(row.overdue_count) });
          } else {
            rows.push({
              type: row.type,
              entityId: row.entity_id,
              label: row.label,
              organisationId: row.organisation_id,
              since: row.since ? new Date(row.since).toISOString() : null,
              dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
              detail: row.detail ?? {},
            });
          }
        }
        return { rows, counts };
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
