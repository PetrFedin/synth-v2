import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { issueCanonicalTechPack, supersedeTechPack } from '../modules/tech-packs/public.mjs';
import { buildCanonicalTechPackIssueSnapshot } from './tech-pack-canonical-issue-snapshot.mjs';

/**
 * Internal P0 issuing path; not exposed through HTTP or the browser.
 * The active transaction locks pack, membership, catalog and exact canonical
 * sources. No data from the read-only inspector can authorise a write.
 *
 * @param {{techPackStore: any, clock?: () => string, nextId: (prefix: string) => string}} options
 */
export function createCanonicalTechPackIssueService({
  techPackStore, clock = () => new Date().toISOString(), nextId,
}) {
  invariant(typeof techPackStore?.canonicalTransaction === 'function',
    'TECH_PACK_CANONICAL_TRANSACTION_REQUIRED',
    'An isolated serializable canonical Tech Pack transaction is required');
  invariant(typeof nextId === 'function', 'TECH_PACK_CANONICAL_EVENT_IDS_REQUIRED',
    'A durable collision-resistant event ID provider is required');

  return Object.freeze({
    async issueCanonicalTechPack(commandId, actorId, code, input) {
      invariant(typeof commandId === 'string' && commandId.length > 0,
        'COMMAND_ID_REQUIRED', 'Canonical issue requires a durable command ID');
      invariant(typeof actorId === 'string' && actorId.length > 0,
        'TECH_PACK_ISSUER_INVALID', 'Canonical issue requires an actor');
      invariant(input && typeof input === 'object' && !Array.isArray(input)
        && Object.keys(input).length === 1 && Number.isSafeInteger(input.expectedVersion)
        && input.expectedVersion >= 1,
        'TECH_PACK_CANONICAL_ISSUE_INPUT_INVALID',
        'Only a valid expectedVersion is accepted');
      const fingerprint = 'issueCanonicalTechPack:' + actorId + ':' + code + ':' + canonicalJson(input);

      return techPackStore.canonicalTransaction(async (tx) => {
        // Context and current access rights are checked on *every* replay, too.
        const pack = requireEntity(await tx.getTechPackByCode(code),
          'TECH_PACK_NOT_FOUND', { techPackCode: code });
        const membership = await tx.getMembership(pack.brandId, actorId);
        // Non-members and revoked accounts must not learn if a foreign Pack
        // exists. Active members without the capability receive CAPABILITY_DENIED.
        invariant(membership?.status === 'active',
          'TECH_PACK_NOT_FOUND', 'Tech Pack not found or not accessible');
        assertCapability(membership, CAPABILITIES.TECH_PACK_MANAGE);
        const previous = await tx.getCommand(commandId);
        if (previous) {
          invariant(fingerprintsMatch(previous.fingerprint, fingerprint)
            && previous.actorId === actorId,
          'COMMAND_ID_CONFLICT', 'This command ID was used for another operation');
        }

        if (previous) return previous.result;

        invariant(pack.version === input.expectedVersion,
          'TECH_PACK_CONCURRENCY_CONFLICT',
          'Tech Pack was modified before canonical issuance');
        const catalogSku = requireEntity(await tx.getSku(pack.sku),
          'CATALOG_SKU_NOT_FOUND', { sku: pack.sku });
        const active = await tx.getActiveTechPackBySku(pack.sku);
        invariant(!active || active.id === pack.id
          || active.techPackCode === pack.sourceTechPackCode,
        'TECH_PACK_ACTIVE_ISSUE_EXISTS',
        'A different issued Tech Pack is already active for this SKU');

        // All of these reads use the same SERIALIZABLE client and FOR SHARE.
        // Deliberately never match canonical identity using legacy text SKU.
        const sources = await tx.getCanonicalIssueSources(pack);
        const snapshot = buildCanonicalTechPackIssueSnapshot({
          techPack: pack, catalogSku, sources,
        });
        const at = clock();
        const value = issueCanonicalTechPack(pack, {
          actorId, issuedAt: at, dependencySnapshot: snapshot,
        });

        if (active && active.id !== pack.id) {
          const superseded = supersedeTechPack(active, { supersededAt: at });
          await tx.saveTechPack(superseded, active.version);
          await emit(tx, nextId, at, commandId, actorId, 'tech-pack.superseded', superseded);
        }
        await tx.saveTechPack(value, input.expectedVersion);
        await emit(tx, nextId, at, commandId, actorId, 'tech-pack.issued', value);
        await tx.insertCommand(Object.freeze({
          id: commandId, fingerprint, actorId, result: value, completedAt: at,
        }));
        return value;
      });
    },
  });
}

async function emit(tx, nextId, at, commandId, actorId, type, pack) {
  await tx.appendOutbox(domainEvent({
    id: nextId('event'), type, aggregateId: pack.id, occurredAt: at,
    payload: {
      techPackCode: pack.techPackCode, sku: pack.sku, brandId: pack.brandId,
      supplierCode: pack.supplierCode, revision: pack.revision, status: pack.status,
      version: pack.version, sourceTechPackCode: pack.sourceTechPackCode,
      ...(pack.dependencySnapshot?.canonical?.lineageHash
        ? { canonicalLineageHash: pack.dependencySnapshot.canonical.lineageHash }
        : {}),
    },
    metadata: { commandId, actorId },
  }));
}
