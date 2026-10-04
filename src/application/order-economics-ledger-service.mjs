import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { resolveOrderEconomicsLineageMode } from '../modules/order-economics/allocation-close-lineage.mjs';

// Рабочее место «Экономика заказа» должно знать, **что уже записано**: какие обязательства поставки,
// курсы, затраты, снимки себестоимости, прогоны распределения и политики есть у подтверждённого
// заказа. Позиция (`economics-position`) отдаёт только итог — действующую себестоимость и маржу, — а
// шаги цепочки принимают идентификаторы этих снимков. Без чтения по заказу экран мог бы помнить
// только то, что создал сам в текущей сессии, и после перезагрузки страницы цепочку нельзя было бы
// продолжить. Чтение — то же право, что и у позиции (`margin.read`): всё здесь — денежные поля.
const LIST_LIMIT = 500;

/** @param {{ reader?: any }} [options] */
export function createOrderEconomicsLedgerService({ reader } = {}) {
  invariant(reader && typeof reader.transaction === 'function', 'ORDER_ECONOMICS_LEDGER_READER_REQUIRED', 'Order economics ledger reader is required');

  return Object.freeze({
    getOrderEconomicsLedgerForActor(actorId, orderId) {
      return reader.transaction(async (tx) => {
        const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
        assertCapability(await tx.getMembership(order.brandId, actorId), CAPABILITIES.MARGIN_READ);
        invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Economics ledger requires an immutable order commit snapshot', { orderId });
        const orderCommit = requireEntity(await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId), 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND', { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId });
        invariant(orderCommit.orderId === order.id && orderCommit.status === 'committed', 'ORDER_COMMIT_SNAPSHOT_INVALID_FOR_EXECUTION', 'Economics ledger requires the committed snapshot for this order', { orderId, orderCommitSnapshotId: orderCommit.id });

        const commitId = orderCommit.id;
        const [supply, fxRates, allEntries, landed, runs, policies, margins, readiness, close] = await Promise.all([
          tx.listSupplyCommitments(commitId, LIST_LIMIT),
          tx.listFxRateSnapshots(commitId, LIST_LIMIT),
          tx.listActualCostEntries(order.id),
          tx.listLandedCostSnapshots(commitId, LIST_LIMIT),
          tx.listCostAllocationRuns(commitId, LIST_LIMIT),
          tx.listCostAllocationPolicies(order.brandId, LIST_LIMIT),
          tx.listMarginActualizations(commitId, LIST_LIMIT),
          tx.getLatestCostCloseReadiness(commitId),
          tx.getCostCloseByOrderCommitSnapshotId(commitId),
        ]);
        const adjustments = close ? await tx.listPostCloseAdjustments(close.id, LIST_LIMIT) : [];
        const reconciliations = close ? await tx.listPostCloseAllocationReconciliations(commitId, LIST_LIMIT) : [];

        const entries = allEntries.filter((entry) => entry.orderCommitSnapshotId === commitId);
        const currentIds = canonicalJson(entries.map((entry) => entry.id).sort());
        const reversed = new Set(entries.filter((entry) => entry.entryKind === 'reversal' && entry.reversalOfEntryId).map((entry) => entry.reversalOfEntryId));
        const reconciledAdjustmentIds = new Set(reconciliations.map((item) => item.postCloseAdjustmentId));

        return Object.freeze({
          orderId: order.id,
          orderCommitSnapshotId: commitId,
          brandId: order.brandId,
          currency: orderCommit.currency,
          // `product-sku-v2`: у каждой строки есть номер и ProductSku — маржа требует точного прогона
          // распределения по SKU. `legacy`: строки без такой привязки — распределение не применимо.
          lineageMode: lineageModeOf(orderCommit),
          lines: Object.freeze(orderCommit.lines.map((line, index) => Object.freeze({
            lineNo: Number.isInteger(line.lineNo) && line.lineNo > 0 ? line.lineNo : index + 1,
            sku: line.sku,
            productSkuId: line.productSkuId ?? null,
            quantity: line.quantity,
          }))),
          supplyCommitments: Object.freeze(supply.map((item) => Object.freeze({
            id: item.id,
            createdAt: item.createdAt,
            allocations: Object.freeze(item.allocations.map((allocation) => Object.freeze({
              orderLineNo: allocation.orderLineNo, sku: allocation.sku, quantity: allocation.quantity,
              sourceType: allocation.sourceType, sourceRef: allocation.sourceRef,
            }))),
          }))),
          fxRateSnapshots: Object.freeze(fxRates.map((item) => Object.freeze({
            id: item.id, sourceCurrency: item.sourceCurrency, targetCurrency: item.targetCurrency, rate: item.rate,
            rateType: item.rateType, sourceRef: item.sourceRef, effectiveAt: item.effectiveAt,
          }))),
          actualCosts: Object.freeze(entries.map((item) => Object.freeze({
            id: item.id,
            entryKind: item.entryKind ?? 'actual',
            reversalOfEntryId: item.reversalOfEntryId ?? null,
            reversed: reversed.has(item.id),
            costType: item.costType,
            sourceAmount: item.sourceAmount,
            sourceCurrency: item.sourceCurrency,
            amount: item.amount,
            currency: item.currency,
            supplyCommitmentSnapshotId: item.supplyCommitmentSnapshotId,
            fxRateSnapshotId: item.fxRateSnapshotId ?? null,
            sourceRef: item.sourceRef,
            occurredAt: item.occurredAt,
          }))),
          landedCosts: Object.freeze(landed.map((item) => Object.freeze({
            id: item.id,
            totalCost: item.totalCost,
            currency: item.currency,
            createdAt: item.createdAt,
            supplyLineageComplete: item.supplyLineageComplete === true,
            costEntryCount: (item.costEntryIds ?? []).length,
            current: canonicalJson([...(item.costEntryIds ?? [])].sort()) === currentIds,
          }))),
          allocationPolicies: Object.freeze(policies.map((item) => Object.freeze({
            id: item.id, name: item.name, version: item.version, defaultBasis: item.defaultBasis,
            rules: Object.freeze((item.rules ?? []).map((rule) => Object.freeze({ costType: rule.costType, basis: rule.basis }))),
            status: item.status,
          }))),
          allocationRuns: Object.freeze(runs.map((item) => Object.freeze({
            id: item.id, landedCostSnapshotId: item.landedCostSnapshotId, policyVersionId: item.policyVersionId,
            lineageMode: item.lineageMode ?? null, allocatedTotal: item.allocatedTotal, currency: item.currency, createdAt: item.createdAt,
          }))),
          marginActualizations: Object.freeze(margins.map((item) => Object.freeze({
            id: item.id,
            landedCostSnapshotId: item.landedCostSnapshotId,
            costAllocationRunSnapshotId: item.costAllocationRunSnapshotId ?? null,
            allocationStatus: item.allocationStatus ?? null,
            contributionMarginAmount: item.contributionMarginAmount,
            contributionMarginPercent: item.contributionMarginPercent,
            createdAt: item.createdAt,
          }))),
          readiness: readiness ? Object.freeze({
            id: readiness.id,
            landedCostSnapshotId: readiness.landedCostSnapshotId,
            marginActualizationSnapshotId: readiness.marginActualizationSnapshotId,
            status: readiness.status,
            blockingReasons: Object.freeze([...(readiness.blockingReasons ?? [])]),
            requirements: Object.freeze((readiness.requirements ?? []).map((item) => Object.freeze({ type: item.type, status: item.status }))),
            evaluatedAt: readiness.evaluatedAt,
          }) : null,
          costClose: close ? Object.freeze({ id: close.id, closedAt: close.closedAt }) : null,
          postCloseAdjustments: Object.freeze(adjustments.map((item) => Object.freeze({
            id: item.id,
            reason: item.reason,
            landedCostSnapshotId: item.landedCostSnapshotId,
            marginActualizationSnapshotId: item.marginActualizationSnapshotId,
            costDeltaAmount: item.costDeltaAmount,
            marginDeltaAmount: item.marginDeltaAmount,
            resultingAllocationStatus: item.resultingAllocationStatus ?? null,
            recordedAt: item.recordedAt,
            reconciled: reconciledAdjustmentIds.has(item.id),
          }))),
        });
      });
    },
  });
}

function lineageModeOf(orderCommit) {
  try { return resolveOrderEconomicsLineageMode(orderCommit); } catch { return 'mixed'; }
}
