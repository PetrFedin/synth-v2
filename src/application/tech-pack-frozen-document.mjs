import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';
import { buildFrozenTechPackSourceSections } from './tech-pack-frozen-source-sections.mjs';
import { readFrozenTechPackDocumentContext } from './tech-pack-issued-document-context.mjs';

const HASH=/^[a-f0-9]{64}$/;

/**
 * Compose a historical Tech Pack only from evidence captured at issuance.
 * This function deliberately has one input and no database, MDM, catalog,
 * price, object-store or current-rights resolver.
 * @param {Record<string, any>} pack
 */
export function buildFrozenCanonicalTechPackDocument(pack) {
  invariant(pack?.issueFormat === 'canonical-v1',
    'TECH_PACK_FROZEN_DOCUMENT_CANONICAL_FORMAT_REQUIRED',
    'A durable canonical-v1 issue format is required');
  const snapshot=pack.dependencySnapshot;
  const sources=buildFrozenTechPackSourceSections(snapshot);
  const context=readFrozenTechPackDocumentContext(pack);
  const basis=snapshot?.canonical;

  invariant(HASH.test(basis?.lineageHash ?? '')
    && HASH.test(basis?.frozenSourcesHash ?? '')
    && HASH.test(basis?.documentContextHash ?? ''),
  'TECH_PACK_FROZEN_DOCUMENT_MANIFEST_INVALID',
  'Canonical lineage, source and document-context digests are required');
  invariant(context.header.brandId === sources.bom.brandId
    && context.header.sku === sources.bom.sku
    && context.product.sku.id === basis.productSkuId
    && context.product.sku.styleVersionId === basis.styleVersionId
    && context.product.sku.colorwayId === basis.colorwayId
    && context.product.sizeValue.sizeScaleVersionId === basis.sizeScaleVersionId,
  'TECH_PACK_FROZEN_DOCUMENT_SCOPE_MISMATCH',
  'Frozen document sections do not belong to one canonical product lineage');

  const blockers=[];
  if(context.operations.state !== 'present' || context.operations.rows.length === 0) {
    blockers.push('OPERATION_SEQUENCE_MISSING');
  }
  if(context.sketches.state === 'missing') blockers.push('SKETCH_EVIDENCE_MISSING');
  else if(context.sketches.state !== 'verified') blockers.push('SKETCH_EVIDENCE_INCOMPLETE');

  const body={
    schemaVersion:1,
    purpose:'canonical-historical-tech-pack',
    issueFormat:'canonical-v1',
    publicPrintAdmitted:false,
    factoryEvidenceReady:blockers.length === 0,
    blockers,
    renderPolicyRequired:['current-publication-rights'],
    header:context.header,
    product:context.product,
    supplier:context.supplier,
    bom:sources.bom,
    measurement:sources.measurement,
    preProductionSample:sources.sample,
    operations:context.operations,
    sketches:context.sketches,
    evidenceManifest:{
      lineageHash:basis.lineageHash,
      frozenSourcesHash:basis.frozenSourcesHash,
      documentContextHash:basis.documentContextHash,
      sourceProjectionHash:sources.projectionHash,
      productSkuId:basis.productSkuId,
      bomId:snapshot.bomId,
      bomVersion:snapshot.bomVersion,
      measurementChartId:snapshot.measurementChartId,
      measurementChartVersion:snapshot.measurementChartVersion,
      sampleCode:snapshot.sampleCode,
      sampleVersion:snapshot.sampleVersion,
    },
  };
  const documentHash=createHash('sha256').update(canonicalJson(body),'utf8').digest('hex');
  return deepFreeze(JSON.parse(canonicalJson({...body,documentHash})));
}

function deepFreeze(value) {
  if(value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for(const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
