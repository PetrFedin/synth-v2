import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createLegalEntity as createLegalEntityDomain,
  createLegalEntityVersion as createLegalEntityVersionDomain,
  transitionLegalEntityStatus as transitionLegalEntityStatusDomain,
} from '../modules/legal-entities/public.mjs';

export function createLegalEntityService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'LEGAL_ENTITY_STORE_REQUIRED', 'Legal Entity store is required');

  function execute(commandId, actorId, operation, input, prepare, action) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every Legal Entity mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.trim(), 'LEGAL_ENTITY_ACTOR_REQUIRED', 'Actor id is required');
    const fingerprint = `${operation}:${actorId}:${canonicalJson(input ?? {})}`;
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx, { replay: Boolean(previous) });
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: now(clock) }));
      return result;
    });
  }

  async function authorize(tx, organisationId, actorId) {
    invariant(typeof organisationId === 'string' && organisationId, 'LEGAL_ENTITY_ORGANISATION_REQUIRED', 'Organisation id is required');
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, CAPABILITIES.ORGANISATION_MANAGE);
    return membership;
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: now(clock), payload, metadata: { commandId, actorId } }));
  }

  return Object.freeze({
    createLegalEntity(commandId, actorId, input) {
      return execute(commandId, actorId, 'createLegalEntity', input,
        async (tx) => {
          await authorize(tx, input?.organisationId, actorId);
          return Object.freeze({ existing: await tx.getLegalEntityByOrganisationAndCode(input.organisationId, input.entityCode) });
        },
        async (tx, context) => {
          invariant(!context.existing, 'LEGAL_ENTITY_ALREADY_EXISTS', 'Legal Entity already exists', { organisationId: input.organisationId, entityCode: input.entityCode });
          const value = createLegalEntityDomain({ id: nextId('legal-entity'), organisationId: input.organisationId, entityCode: input.entityCode, createdAt: now(clock), createdBy: actorId });
          await tx.insertLegalEntity(value);
          await append(tx, 'legal-entity.created', value.id, { organisationId: value.organisationId, entityCode: value.entityCode }, commandId, actorId);
          return value;
        });
    },

    transitionLegalEntity(commandId, actorId, legalEntityId, input) {
      return execute(commandId, actorId, `transitionLegalEntity:${legalEntityId}`, input,
        async (tx) => {
          const legalEntity = requireEntity(await tx.getLegalEntityForUpdate(legalEntityId), 'LEGAL_ENTITY_NOT_FOUND', { legalEntityId });
          await authorize(tx, legalEntity.organisationId, actorId);
          return legalEntity;
        },
        async (tx, legalEntity) => {
          assertExpectedVersion(legalEntity.version, input?.expectedVersion, 'LEGAL_ENTITY_CONCURRENCY_CONFLICT');
          const value = transitionLegalEntityStatusDomain(legalEntity, input.nextStatus, { updatedAt: now(clock), updatedBy: actorId });
          await tx.saveLegalEntity(value, input.expectedVersion);
          await append(tx, 'legal-entity.status-changed', value.id, { organisationId: value.organisationId, status: value.status, version: value.version }, commandId, actorId);
          return value;
        });
    },

    createLegalEntityVersion(commandId, actorId, legalEntityId, input) {
      return execute(commandId, actorId, `createLegalEntityVersion:${legalEntityId}`, input,
        async (tx, { replay }) => {
          const legalEntity = requireEntity(await tx.getLegalEntityForUpdate(legalEntityId), 'LEGAL_ENTITY_NOT_FOUND', { legalEntityId });
          await authorize(tx, legalEntity.organisationId, actorId);
          if (replay) return Object.freeze({ legalEntity, replay: true });
          const latest = await tx.getLatestLegalEntityVersion(legalEntityId);
          return Object.freeze({ legalEntity, latest, replay: false });
        },
        async (tx, context) => {
          const expectedLatestVersionNo = input?.expectedLatestVersionNo;
          invariant(Number.isInteger(expectedLatestVersionNo) && expectedLatestVersionNo >= 0, 'LEGAL_ENTITY_VERSION_EXPECTATION_INVALID', 'expectedLatestVersionNo must be a non-negative integer');
          invariant((context.latest?.versionNo ?? 0) === expectedLatestVersionNo, 'LEGAL_ENTITY_VERSION_CONCURRENCY_CONFLICT', 'Legal Entity version changed', {
            legalEntityId, expectedLatestVersionNo, actualLatestVersionNo: context.latest?.versionNo ?? 0,
          });
          const value = createLegalEntityVersionDomain({
            id: nextId('legal-entity-version'),
            legalEntity: context.legalEntity,
            versionNo: (context.latest?.versionNo ?? 0) + 1,
            sourceLegalEntityVersion: context.latest,
            jurisdiction: input.jurisdiction,
            nameRu: input.nameRu,
            nameEn: input.nameEn,
            requisites: input.requisites,
            createdAt: now(clock),
            createdBy: actorId,
          });
          await tx.insertLegalEntityVersion(value);
          await append(tx, 'legal-entity-version.created', value.id, { legalEntityId: value.legalEntityId, organisationId: value.organisationId, versionNo: value.versionNo, jurisdiction: value.jurisdiction }, commandId, actorId);
          return value;
        });
    },

    async getForActor(actorId, legalEntityId) {
      return store.transaction(async (tx) => {
        const legalEntity = requireEntity(await tx.getLegalEntity(legalEntityId), 'LEGAL_ENTITY_NOT_FOUND', { legalEntityId });
        const membership = await tx.getMembership(legalEntity.organisationId, actorId);
        assertCapability(membership, CAPABILITIES.ORGANISATION_MANAGE);
        const latest = await tx.getLatestLegalEntityVersion(legalEntityId);
        return Object.freeze({ ...legalEntity, latestVersion: latest ?? null });
      });
    },

    async listForActor(actorId, organisationId) {
      return store.transaction(async (tx) => {
        await authorize(tx, organisationId, actorId);
        return tx.listLegalEntitiesWithLatestVersion(organisationId);
      });
    },
  });
}

function assertExpectedVersion(currentVersion, expectedVersion, code) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion > 0, 'LEGAL_ENTITY_EXPECTED_VERSION_INVALID', 'Expected version must be a positive integer');
  invariant(currentVersion === expectedVersion, code, 'Legal Entity concurrency conflict', { currentVersion, expectedVersion });
}

function now(clock) {
  const value = clock();
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), 'LEGAL_ENTITY_CLOCK_INVALID', 'Clock must return an ISO-compatible timestamp');
  return value;
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${Date.now().toString(36)}${(++sequence).toString(36)}`;
}
