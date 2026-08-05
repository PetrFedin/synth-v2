import { invariant } from '../../core/errors.mjs';
import { allocateRfq as allocateBaseRfq } from './public.mjs';

export function allocateRfqWithAcknowledgedTechPack(rfq, { supplier, techPack, input, allocatedAt }) {
  assertProductionReadyTechPack(rfq, supplier, techPack);
  const allocated = allocateBaseRfq(rfq, { supplier, input, allocatedAt });
  const acknowledgement = techPack.acknowledgement;
  const allocation = Object.freeze({
    ...allocated.allocation,
    techPackCode: techPack.techPackCode,
    techPackRevision: techPack.revision,
    techPackVersion: techPack.version,
    techPackIssuedVersion: acknowledgement.issuedTechPackVersion,
    techPackAcknowledgedAt: techPack.acknowledgedAt,
    techPackAcknowledgementReference: acknowledgement.acknowledgementReference,
  });
  return Object.freeze({ ...allocated, allocation });
}

export function assertProductionReadyTechPack(rfq, supplier, techPack) {
  invariant(techPack, 'TECH_PACK_ACKNOWLEDGEMENT_REQUIRED', 'Production allocation requires a supplier-acknowledged Tech Pack', { rfqCode: rfq?.rfqCode, sku: rfq?.sku, supplierCode: supplier?.supplierCode });
  invariant(techPack.status === 'acknowledged', 'TECH_PACK_NOT_ACKNOWLEDGED', 'Production allocation requires an acknowledged Tech Pack', { techPackCode: techPack.techPackCode, status: techPack.status });
  invariant(techPack.sku === rfq?.sku && techPack.brandId === rfq?.brandId, 'TECH_PACK_RFQ_MISMATCH', 'Acknowledged Tech Pack does not belong to the awarded RFQ', { techPackCode: techPack.techPackCode, rfqCode: rfq?.rfqCode });
  invariant(techPack.supplierCode === supplier?.supplierCode && supplier?.supplierCode === rfq?.selectedSupplierCode, 'TECH_PACK_SUPPLIER_MISMATCH', 'Acknowledged Tech Pack does not belong to the awarded supplier', { techPackCode: techPack.techPackCode, expectedSupplierCode: rfq?.selectedSupplierCode, actualSupplierCode: techPack.supplierCode });
  invariant(Number.isInteger(techPack.revision) && techPack.revision >= 1, 'TECH_PACK_REVISION_INVALID', 'Acknowledged Tech Pack revision is invalid');
  invariant(Number.isInteger(techPack.version) && techPack.version >= 2, 'TECH_PACK_VERSION_INVALID', 'Acknowledged Tech Pack version is invalid');
  invariant(typeof techPack.acknowledgedAt === 'string' && Number.isFinite(Date.parse(techPack.acknowledgedAt)), 'TECH_PACK_ACKNOWLEDGED_AT_INVALID', 'Acknowledged Tech Pack timestamp is invalid');
  const acknowledgement = techPack.acknowledgement;
  invariant(acknowledgement?.supplierCode === supplier.supplierCode, 'TECH_PACK_ACK_SUPPLIER_MISMATCH', 'Tech Pack acknowledgement supplier does not match the awarded supplier');
  invariant(typeof acknowledgement.acknowledgementReference === 'string' && acknowledgement.acknowledgementReference.length >= 2, 'TECH_PACK_ACK_REFERENCE_INVALID', 'Tech Pack acknowledgement reference is invalid');
  invariant(acknowledgement.acknowledgedAt === techPack.acknowledgedAt, 'TECH_PACK_ACK_TIMESTAMP_MISMATCH', 'Tech Pack acknowledgement timestamp is inconsistent');
  invariant(Number.isInteger(acknowledgement.issuedTechPackVersion) && acknowledgement.issuedTechPackVersion === techPack.version - 1, 'TECH_PACK_ACK_VERSION_MISMATCH', 'Tech Pack acknowledgement does not bind the current issued version', { techPackCode: techPack.techPackCode, issuedTechPackVersion: acknowledgement.issuedTechPackVersion, techPackVersion: techPack.version });
  const dependencies = techPack.dependencySnapshot;
  invariant(dependencies && typeof dependencies === 'object', 'TECH_PACK_DEPENDENCY_SNAPSHOT_REQUIRED', 'Acknowledged Tech Pack has no immutable dependency snapshot');
  invariant(dependencies.skuVersion === rfq.skuVersion, 'TECH_PACK_SKU_SNAPSHOT_STALE', 'Tech Pack SKU snapshot does not match the awarded RFQ', { techPackCode: techPack.techPackCode, techPackSkuVersion: dependencies.skuVersion, rfqSkuVersion: rfq.skuVersion });
  invariant(dependencies.bomVersion === rfq.bomVersion, 'TECH_PACK_BOM_SNAPSHOT_STALE', 'Tech Pack BOM snapshot does not match the awarded RFQ', { techPackCode: techPack.techPackCode, techPackBomVersion: dependencies.bomVersion, rfqBomVersion: rfq.bomVersion });
  return techPack;
}
