import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  approveTechnicalDrawing as approveTechnicalDrawingDomain,
  completeAnalysis as completeAnalysisDomain,
  completeModelRun as completeModelRunDomain,
  createAnalysisRun as createAnalysisRunDomain,
  createConflict as createConflictDomain,
  createDrawingObject as createDrawingObjectDomain,
  createEvidence as createEvidenceDomain,
  createFinding as createFindingDomain,
  createModelRun as createModelRunDomain,
  createProposal as createProposalDomain,
  createTechnicalDrawing as createTechnicalDrawingDomain,
  resolveConflict as resolveConflictDomain,
  resolveProposal as resolveProposalDomain,
  markProposalApplied as markProposalAppliedDomain,
  startAnalysis as startAnalysisDomain,
} from '../modules/product-engineering/public.mjs';
import {
  admitEngineeringSource,
  completeSourceParsing,
  createEngineeringFragment,
  createEngineeringSource,
  recordSourceScan,
  rejectEngineeringSource,
} from '../modules/product-engineering/intake.mjs';
import { assertTechnicalFlatApprovable } from '../modules/product-engineering/technical-flat.mjs';
import { inspectEngineeringUpload, postgresBlobStorageRef } from '../modules/product-engineering/source-upload.mjs';
import { createCanonicalApplicationIntent } from '../modules/product-engineering/application-authority.mjs';
import {
  acknowledgeEngineeringChangeCase,
  createEngineeringChangeCase,
  createEngineeringSourceRevision,
  evaluateSourceRevisionImpact,
} from '../modules/product-engineering/change-impact.mjs';

/**
 * @param {{
 *   store?: any,
 *   productReader?: any,
 *   clock?: () => string,
 *   nextId?: (prefix: string) => string
 * }} [options]
 */
export function createProductEngineeringService(options = {}) {
  const {
    store,
    productReader,
    clock = () => new Date().toISOString(),
    nextId = defaultIdGenerator(),
  } = options;
  invariant(store && typeof store.transaction === 'function' && typeof store.getStyleWorkspace === 'function', 'PRODUCT_ENGINEERING_STORE_REQUIRED', 'Product Engineering store is required');
  invariant(productReader && typeof productReader.getStyle === 'function' && typeof productReader.getMembership === 'function', 'PRODUCT_ENGINEERING_READER_REQUIRED', 'Product reader is required');

  async function authorizeStyle(actorId, styleId, capability) {
    const style = await productReader.getStyle(styleId);
    invariant(style, 'PRODUCT_STYLE_NOT_FOUND', 'Product Style not found', { styleId });
    const membership = await productReader.getMembership(style.brandId, actorId);
    assertCapability(membership, capability);
    return style;
  }

  async function authorizeBrand(actorId, brandId, capability) {
    const membership = await productReader.getMembership(brandId, actorId);
    assertCapability(membership, capability);
  }

  async function runCommand(commandId, actorId, fingerprint, action) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every Product Engineering mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: now(clock) }));
      return result;
    });
  }

  /**
   * @param {string} actorId
   * @param {string} analysisRunId
   * @param {any} capability
   */
  async function analysisForActor(actorId, analysisRunId, capability = CAPABILITIES.PRODUCT_ENGINEERING_READ) {
    const run = await store.getAnalysisRun(analysisRunId);
    invariant(run, 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', 'Engineering analysis not found', { analysisRunId });
    await authorizeBrand(actorId, run.brandId, capability);
    return run;
  }

  return Object.freeze({
    async uploadSourceBytes(commandId, actorId, styleId, input, bytes) {
      requireObject(input, 'ENGINEERING_UPLOAD_INPUT_INVALID');
      const style = await authorizeStyle(actorId, styleId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const inspected = inspectEngineeringUpload({
        bytes,
        mediaType: input.mediaType,
        originalName: input.originalName,
      });
      const fingerprint = `uploadEngineeringSource:${actorId}:${styleId}:${inspected.contentHash}:${inspected.mediaType}:${inspected.originalName}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const sourceId = nextId('engineering-source');
        const createdAt = now(clock);
        const source = createEngineeringSource({
          id: sourceId,
          brandId: style.brandId,
          styleId: style.id,
          kind: inspected.kind,
          ingestMode: 'upload',
          mediaType: inspected.mediaType,
          originalName: inspected.originalName,
          sizeBytes: inspected.sizeBytes,
          contentHash: inspected.contentHash,
          storageRef: postgresBlobStorageRef(sourceId),
          metadata: {
            upload: {
              transport: 'binary-http',
              integrity: 'server-computed-sha256',
            },
          },
          createdAt,
          createdBy: actorId,
        });
        await tx.insertSource(source);
        await tx.insertSourceBlob({
          sourceId,
          brandId: style.brandId,
          styleId: style.id,
          mediaType: inspected.mediaType,
          sizeBytes: inspected.sizeBytes,
          contentHash: inspected.contentHash,
          content: bytes,
          createdAt,
        });
        await tx.insertJob({
          id: nextId('engineering-job'),
          dedupeKey: `source-scan:${sourceId}:${inspected.contentHash}`,
          brandId: style.brandId,
          styleId: style.id,
          sourceId,
          analysisRunId: null,
          jobType: 'source_scan',
          payload: { contentHash: inspected.contentHash },
          maxAttempts: 5,
          availableAt: createdAt,
        });
        return source;
      });
    },

    async registerSource(commandId, actorId, styleId, input) {
      requireObject(input, 'ENGINEERING_SOURCE_INPUT_INVALID');
      const style = await authorizeStyle(actorId, styleId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `registerEngineeringSource:${actorId}:${styleId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const source = createEngineeringSource({
          id: nextId('engineering-source'),
          brandId: style.brandId,
          styleId: style.id,
          kind: input.kind,
          ingestMode: input.ingestMode,
          mediaType: input.mediaType ?? null,
          originalName: input.originalName ?? null,
          sizeBytes: input.sizeBytes ?? null,
          contentHash: input.contentHash ?? null,
          storageRef: input.storageRef ?? null,
          sourceUri: input.sourceUri ?? null,
          metadata: input.metadata ?? {},
          createdAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertSource(source);
        return source;
      });
    },

    async recordSourceScan(commandId, actorId, sourceId, input) {
      requireObject(input, 'ENGINEERING_SOURCE_SCAN_INPUT_INVALID');
      const current = required(await store.getSource(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `recordEngineeringSourceScan:${actorId}:${sourceId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getSourceForUpdate(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
        invariant(exact.version === input.expectedVersion, 'ENGINEERING_SOURCE_CONCURRENCY_CONFLICT', 'Engineering source changed concurrently', { sourceId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const next = recordSourceScan(exact, {
          status: input.status,
          scannedAt: now(clock),
          engine: input.engine ?? null,
          details: input.details ?? {},
        });
        await tx.updateSource(next, exact.version);
        return next;
      });
    },

    async admitSource(commandId, actorId, sourceId, input) {
      requireObject(input, 'ENGINEERING_SOURCE_ADMISSION_INPUT_INVALID');
      const current = required(await store.getSource(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `admitEngineeringSource:${actorId}:${sourceId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getSourceForUpdate(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
        invariant(exact.version === input.expectedVersion, 'ENGINEERING_SOURCE_CONCURRENCY_CONFLICT', 'Engineering source changed concurrently', { sourceId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const next = admitEngineeringSource(exact, { admittedAt: now(clock), admittedBy: actorId, policyVersion: input.policyVersion });
        await tx.updateSource(next, exact.version);
        return next;
      });
    },

    async rejectSource(commandId, actorId, sourceId, input) {
      requireObject(input, 'ENGINEERING_SOURCE_REJECTION_INPUT_INVALID');
      const current = required(await store.getSource(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `rejectEngineeringSource:${actorId}:${sourceId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getSourceForUpdate(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
        invariant(exact.version === input.expectedVersion, 'ENGINEERING_SOURCE_CONCURRENCY_CONFLICT', 'Engineering source changed concurrently', { sourceId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const next = rejectEngineeringSource(exact, {
          code: input.code,
          message: input.message,
          rejectedAt: now(clock),
          rejectedBy: actorId,
          quarantine: input.quarantine === true,
        });
        await tx.updateSource(next, exact.version);
        return next;
      });
    },

    async addSourceFragment(commandId, actorId, sourceId, input) {
      requireObject(input, 'ENGINEERING_FRAGMENT_INPUT_INVALID');
      const current = required(await store.getSource(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `addEngineeringSourceFragment:${actorId}:${sourceId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getSourceForUpdate(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
        const fragment = createEngineeringFragment({
          id: nextId('engineering-fragment'),
          source: exact,
          kind: input.kind,
          locator: input.locator,
          content: input.content ?? null,
          contentHash: input.contentHash ?? null,
          createdAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertFragment(fragment);
        return fragment;
      });
    },

    async completeSourceParsing(commandId, actorId, sourceId, input) {
      requireObject(input, 'ENGINEERING_SOURCE_PARSE_INPUT_INVALID');
      const current = required(await store.getSource(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `completeEngineeringSourceParsing:${actorId}:${sourceId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getSourceForUpdate(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
        invariant(exact.version === input.expectedVersion, 'ENGINEERING_SOURCE_CONCURRENCY_CONFLICT', 'Engineering source changed concurrently', { sourceId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const next = completeSourceParsing(exact, {
          completedAt: now(clock),
          parser: input.parser,
          parserVersion: input.parserVersion,
          fragmentCount: input.fragmentCount,
        });
        await tx.updateSource(next, exact.version);
        return next;
      });
    },

    async getSourceForActor(actorId, sourceId) {
      const source = required(await store.getSource(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
      await authorizeBrand(actorId, source.brandId, CAPABILITIES.PRODUCT_ENGINEERING_READ);
      return deepFreeze({ source, fragments: await store.getSourceFragments(sourceId) });
    },

    async reviseSource(commandId, actorId, sourceId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_SOURCE_REVISION_INPUT_INVALID');
      const current = required(await store.getSource(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
      const replacement = required(await store.getSource(input.replacementSourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId: input.replacementSourceId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `reviseEngineeringSource:${actorId}:${sourceId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const superseded = required(await tx.getSourceForUpdate(sourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId });
        const exactReplacement = required(await tx.getSourceForUpdate(input.replacementSourceId), 'ENGINEERING_SOURCE_NOT_FOUND', { sourceId: input.replacementSourceId });
        invariant(!(await tx.getSourceRevisionBySuperseded(sourceId)), 'PRODUCT_ENGINEERING_SOURCE_ALREADY_REVISED', 'Engineering source already has a replacement', { sourceId });
        invariant(!(await tx.getSourceRevisionByReplacement(input.replacementSourceId)), 'PRODUCT_ENGINEERING_SOURCE_REPLACEMENT_ALREADY_USED', 'Replacement source is already part of another revision', { replacementSourceId: input.replacementSourceId });
        invariant(!(await tx.getSourceRevisionBySuperseded(input.replacementSourceId)), 'PRODUCT_ENGINEERING_SOURCE_REPLACEMENT_STALE', 'A source that is already superseded cannot become the replacement', { replacementSourceId: input.replacementSourceId });
        const revision = createEngineeringSourceRevision({
          id: nextId('engineering-source-revision'),
          superseded,
          replacement: exactReplacement,
          reason: input.reason,
          createdAt: now(clock),
          createdBy: actorId,
        });
        const lineage = await tx.getSourceImpactLineage(sourceId);
        const evaluation = evaluateSourceRevisionImpact({ revision, lineage });
        const changeCase = createEngineeringChangeCase({
          id: nextId('engineering-change-case'),
          revision,
          evaluation,
          createdAt: now(clock),
          createdBy: actorId,
        });
        const impacts = evaluation.impacts.map((impact) => Object.freeze({
          id: nextId('engineering-change-impact'),
          ...impact,
          createdAt: changeCase.createdAt,
          createdBy: actorId,
        }));
        await tx.insertSourceRevision(revision);
        await tx.insertChangeCase(changeCase);
        await tx.insertChangeImpacts(changeCase.id, impacts);
        return deepFreeze({ revision, changeCase, impacts });
      });
    },

    async getChangeCaseForActor(actorId, changeCaseId) {
      const bundle = required(await store.getChangeCase(changeCaseId), 'PRODUCT_ENGINEERING_CHANGE_CASE_NOT_FOUND', { changeCaseId });
      await authorizeBrand(actorId, bundle.changeCase.brandId, CAPABILITIES.PRODUCT_ENGINEERING_READ);
      return bundle;
    },

    async acknowledgeChangeCase(commandId, actorId, changeCaseId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_CHANGE_CASE_ACK_INVALID');
      const bundle = required(await store.getChangeCase(changeCaseId), 'PRODUCT_ENGINEERING_CHANGE_CASE_NOT_FOUND', { changeCaseId });
      await authorizeBrand(actorId, bundle.changeCase.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `acknowledgeEngineeringChange:${actorId}:${changeCaseId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getChangeCaseForUpdate(changeCaseId), 'PRODUCT_ENGINEERING_CHANGE_CASE_NOT_FOUND', { changeCaseId });
        invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'PRODUCT_ENGINEERING_CHANGE_CASE_EXPECTED_VERSION_INVALID', 'Expected change-case version must be a positive integer');
        invariant(exact.version === input.expectedVersion, 'PRODUCT_ENGINEERING_CHANGE_CASE_CONCURRENCY_CONFLICT', 'Engineering change case changed concurrently', { changeCaseId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const next = acknowledgeEngineeringChangeCase(exact, { note: input.note, acknowledgedAt: now(clock), acknowledgedBy: actorId });
        await tx.updateChangeCase(next, exact.version);
        return next;
      });
    },

    async requestAnalysis(commandId, actorId, styleId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_INPUT_INVALID');
      const style = await authorizeStyle(actorId, styleId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const styleVersionId = input.styleVersionId ?? null;
      if (styleVersionId !== null) {
        const exact = await store.getStyleVersion(styleVersionId);
        invariant(exact && exact.styleId === style.id && exact.brandId === style.brandId, 'PRODUCT_STYLE_VERSION_NOT_FOUND', 'Product Style Version not found for this style', { styleVersionId, styleId });
      }
      const sourceIds = Array.isArray(input.inputManifest?.sourceIds) ? [...new Set(input.inputManifest.sourceIds)] : [];
      for (const sourceId of sourceIds) {
        const source = await store.getSource(sourceId);
        invariant(source && source.styleId === style.id && source.brandId === style.brandId, 'ENGINEERING_ANALYSIS_SOURCE_INVALID', 'Analysis source is not available for this style', { sourceId, styleId });
        invariant(source.status === 'admitted' && source.parseStatus === 'completed', 'ENGINEERING_ANALYSIS_SOURCE_NOT_READY', 'Analysis source must be admitted and parsed before execution', { sourceId, status: source.status, parseStatus: source.parseStatus });
      }
      if (input.inputManifest?.autoExecute === true) {
        invariant(sourceIds.length >= 1, 'ENGINEERING_ANALYSIS_SOURCES_REQUIRED', 'Automatic engineering analysis requires at least one admitted parsed source');
        const contract = input.inputManifest?.modelContract;
        invariant(contract && typeof contract.promptVersion === 'string' && contract.promptVersion.trim() && typeof contract.schemaVersion === 'string' && contract.schemaVersion.trim(), 'ENGINEERING_MODEL_CONTRACT_REQUIRED', 'Automatic engineering analysis requires prompt/schema contract');
      }
      const value = createAnalysisRunDomain({
        id: nextId('engineering-analysis'),
        style,
        styleVersionId,
        purpose: input.purpose,
        inputManifest: input.inputManifest,
        requestedAt: now(clock),
        requestedBy: actorId,
      });
      const fingerprint = `requestEngineeringAnalysis:${actorId}:${styleId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        await tx.insertAnalysisRun(value);
        if (input.inputManifest?.autoExecute === true) {
          await tx.insertJob({
            id: nextId('engineering-job'),
            dedupeKey: `analysis-execute:${value.id}:${value.inputHash}`,
            brandId: value.brandId,
            styleId: value.styleId,
            sourceId: null,
            analysisRunId: value.id,
            jobType: 'analysis_execute',
            payload: {
              purpose: value.purpose,
              promptVersion: input.inputManifest.modelContract.promptVersion,
              schemaVersion: input.inputManifest.modelContract.schemaVersion,
              sourceIds,
            },
            maxAttempts: 5,
            availableAt: value.requestedAt,
          });
        }
        return value;
      });
    },

    async startAnalysis(commandId, actorId, analysisRunId) {
      await analysisForActor(actorId, analysisRunId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `startEngineeringAnalysis:${actorId}:${analysisRunId}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getAnalysisRunForUpdate(analysisRunId), 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', { analysisRunId });
        const next = startAnalysisDomain(exact, { startedAt: now(clock) });
        await tx.updateAnalysisRun(next, exact.version);
        return next;
      });
    },

    async completeAnalysis(commandId, actorId, analysisRunId) {
      await analysisForActor(actorId, analysisRunId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `completeEngineeringAnalysis:${actorId}:${analysisRunId}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getAnalysisRunForUpdate(analysisRunId), 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', { analysisRunId });
        const next = completeAnalysisDomain(exact, { completedAt: now(clock) });
        await tx.updateAnalysisRun(next, exact.version);
        return next;
      });
    },

    async startModelRun(commandId, actorId, analysisRunId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_MODEL_INPUT_INVALID');
      await analysisForActor(actorId, analysisRunId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `startEngineeringModelRun:${actorId}:${analysisRunId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const analysis = required(await tx.getAnalysisRunForUpdate(analysisRunId), 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', { analysisRunId });
        const value = createModelRunDomain({
          id: nextId('engineering-model-run'),
          analysisRun: analysis,
          provider: input.provider,
          model: input.model,
          purpose: input.purpose,
          promptVersion: input.promptVersion,
          schemaVersion: input.schemaVersion,
          inputHash: input.inputHash,
          startedAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertModelRun(value);
        return value;
      });
    },

    async completeModelRun(commandId, actorId, modelRunId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_MODEL_INPUT_INVALID');
      const current = required(await store.getModelRun(modelRunId), 'PRODUCT_ENGINEERING_MODEL_RUN_NOT_FOUND', { modelRunId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `completeEngineeringModelRun:${actorId}:${modelRunId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getModelRunForUpdate(modelRunId), 'PRODUCT_ENGINEERING_MODEL_RUN_NOT_FOUND', { modelRunId });
        const next = completeModelRunDomain(exact, {
          outputHash: input.outputHash,
          usage: input.usage ?? {},
          costMinor: input.costMinor ?? null,
          currency: input.currency ?? null,
          completedAt: now(clock),
        });
        await tx.updateModelRun(next);
        return next;
      });
    },

    async recordFinding(commandId, actorId, analysisRunId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_FINDING_INPUT_INVALID');
      await analysisForActor(actorId, analysisRunId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `recordEngineeringFinding:${actorId}:${analysisRunId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const analysis = required(await tx.getAnalysisRunForUpdate(analysisRunId), 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', { analysisRunId });
        const finding = createFindingDomain({
          id: nextId('engineering-finding'),
          analysisRun: analysis,
          findingType: input.findingType,
          origin: input.origin,
          value: input.value,
          confidence: input.confidence ?? null,
          createdAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertFinding(finding);
        const evidence = [];
        for (const raw of input.evidence ?? []) {
          const row = createEvidenceDomain({
            id: nextId('engineering-evidence'),
            analysisRun: analysis,
            finding,
            sourceKind: raw.sourceKind,
            sourceId: raw.sourceId ?? null,
            sourceLocator: raw.sourceLocator ?? {},
            sourceHash: raw.sourceHash ?? null,
            excerpt: raw.excerpt ?? null,
            createdAt: now(clock),
            createdBy: actorId,
          });
          await tx.insertEvidence(row);
          evidence.push(row);
        }
        return deepFreeze({ finding, evidence });
      });
    },

    async createProposal(commandId, actorId, analysisRunId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_PROPOSAL_INPUT_INVALID');
      await analysisForActor(actorId, analysisRunId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `createEngineeringProposal:${actorId}:${analysisRunId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const analysis = required(await tx.getAnalysisRunForUpdate(analysisRunId), 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', { analysisRunId });
        const finding = input.findingId ? required(await tx.getFinding(input.findingId), 'PRODUCT_ENGINEERING_FINDING_NOT_FOUND', { findingId: input.findingId }) : null;
        const proposal = createProposalDomain({
          id: nextId('engineering-proposal'),
          analysisRun: analysis,
          finding,
          targetAuthority: input.targetAuthority,
          targetEntityId: input.targetEntityId ?? null,
          targetField: input.targetField,
          proposedValue: input.proposedValue,
          confidence: input.confidence ?? null,
          rationale: input.rationale ?? null,
          createdAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertProposal(proposal);
        return proposal;
      });
    },

    async resolveProposal(commandId, actorId, proposalId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_PROPOSAL_RESOLUTION_INVALID');
      const current = required(await store.getProposal(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `resolveEngineeringProposal:${actorId}:${proposalId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getProposalForUpdate(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
        invariant(exact.version === input.expectedVersion, 'PRODUCT_ENGINEERING_PROPOSAL_CONCURRENCY_CONFLICT', 'Engineering proposal changed concurrently', { proposalId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const next = resolveProposalDomain(exact, { decision: input.decision, note: input.note ?? null, resolvedAt: now(clock), resolvedBy: actorId });
        await tx.updateProposal(next, exact.version);
        return next;
      });
    },

    async getProposalForActor(actorId, proposalId) {
      const proposal = required(await store.getProposal(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
      await authorizeBrand(actorId, proposal.brandId, CAPABILITIES.PRODUCT_ENGINEERING_READ);
      return proposal;
    },

    async prepareProposalApplication(actorId, proposalId, input = {}) {
      requireObject(input, 'PRODUCT_ENGINEERING_PROPOSAL_APPLY_INVALID');
      const current = required(await store.getProposal(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      if (current.appliedReference) {
        invariant(
          typeof input.applicationCommandId === 'string'
            && input.applicationCommandId
            && typeof input.canonicalCommandId === 'string'
            && input.canonicalCommandId
            && current.appliedReference.commandId === input.canonicalCommandId,
          'PRODUCT_ENGINEERING_PROPOSAL_ALREADY_APPLIED',
          'Engineering proposal was already applied by another command',
          { proposalId, appliedReference: current.appliedReference },
        );
        const intent = await store.getApplicationIntentByProposal?.(proposalId) ?? null;
        invariant(!intent || intent.applicationCommandId === input.applicationCommandId, 'PRODUCT_ENGINEERING_PROPOSAL_ALREADY_APPLIED', 'Engineering proposal was applied by another application command', { proposalId, applicationCommandId: intent?.applicationCommandId ?? null });
        return deepFreeze({ proposal: current, applicationIntent: intent, replay: true });
      }
      invariant(current.status === 'accepted', 'PRODUCT_ENGINEERING_PROPOSAL_NOT_ACCEPTED', 'Only an accepted proposal can be applied', { proposalId, status: current.status });
      invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'PRODUCT_ENGINEERING_PROPOSAL_EXPECTED_VERSION_INVALID', 'Expected proposal version must be a positive integer');
      invariant(current.version === input.expectedVersion, 'PRODUCT_ENGINEERING_PROPOSAL_CONCURRENCY_CONFLICT', 'Engineering proposal changed concurrently', { proposalId, expectedVersion: input.expectedVersion, actualVersion: current.version });
      invariant(typeof current.targetEntityId === 'string' && current.targetEntityId, 'PRODUCT_ENGINEERING_APPLY_TARGET_REQUIRED', 'Canonical application requires an explicit target entity');
      const intent = await store.getApplicationIntentByProposal?.(proposalId) ?? null;
      if (intent) {
        invariant(intent.applicationCommandId === input.applicationCommandId, 'PRODUCT_ENGINEERING_APPLICATION_IN_PROGRESS', 'Engineering proposal already has a canonical application intent owned by another command', { proposalId, applicationCommandId: intent.applicationCommandId });
        invariant(intent.canonicalCommandId === input.canonicalCommandId, 'PRODUCT_ENGINEERING_APPLICATION_INTENT_MISMATCH', 'Prepared application intent belongs to another canonical command', { proposalId, canonicalCommandId: intent.canonicalCommandId });
        invariant(intent.expectedProposalVersion === input.expectedVersion, 'PRODUCT_ENGINEERING_APPLICATION_INTENT_MISMATCH', 'Prepared application intent does not match the requested proposal version', { proposalId });
      }
      return deepFreeze({ proposal: current, applicationIntent: intent, replay: false });
    },

    async recordProposalApplicationIntent(commandId, actorId, proposalId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_APPLICATION_INTENT_INVALID');
      const current = required(await store.getProposal(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `prepareEngineeringProposalApplication:${actorId}:${proposalId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getProposalForUpdate(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
        const existing = await tx.getApplicationIntentByProposal(proposalId);
        if (existing) {
          invariant(existing.applicationCommandId === input.applicationCommandId, 'PRODUCT_ENGINEERING_APPLICATION_IN_PROGRESS', 'Engineering proposal already has a canonical application intent owned by another command', { proposalId, applicationCommandId: existing.applicationCommandId });
          invariant(existing.canonicalCommandId === input.canonicalCommandId, 'PRODUCT_ENGINEERING_APPLICATION_INTENT_MISMATCH', 'Prepared application intent belongs to another canonical command', { proposalId, canonicalCommandId: existing.canonicalCommandId });
          return existing;
        }
        invariant(exact.status === 'accepted' && exact.appliedReference === null, 'PRODUCT_ENGINEERING_PROPOSAL_NOT_ACCEPTED', 'Only an unapplied accepted proposal can prepare a canonical application intent', { proposalId, status: exact.status });
        const intent = createCanonicalApplicationIntent({
          id: nextId('engineering-application-intent'),
          proposal: exact,
          actorId,
          applicationCommandId: input.applicationCommandId,
          canonicalCommandId: input.canonicalCommandId,
          expectedProposalVersion: input.expectedProposalVersion,
          expectedCanonicalVersion: input.expectedCanonicalVersion,
          canonicalBefore: input.canonicalBefore,
          lineage: input.lineage ?? {},
          preparedAt: now(clock),
        });
        await tx.insertApplicationIntent(intent);
        return intent;
      });
    },

    async getProposalApplicationReceiptForActor(actorId, proposalId) {
      const proposal = required(await store.getProposal(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
      await authorizeBrand(actorId, proposal.brandId, CAPABILITIES.PRODUCT_ENGINEERING_READ);
      return required(await store.getApplicationReceiptByProposal?.(proposalId), 'PRODUCT_ENGINEERING_APPLICATION_RECEIPT_NOT_FOUND', { proposalId });
    },

    async markProposalApplied(commandId, actorId, proposalId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_PROPOSAL_APPLY_INVALID');
      const current = required(await store.getProposal(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `markEngineeringProposalApplied:${actorId}:${proposalId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getProposalForUpdate(proposalId), 'PRODUCT_ENGINEERING_PROPOSAL_NOT_FOUND', { proposalId });
        if (exact.appliedReference) {
          invariant(exact.appliedReference.commandId === input.commandId, 'PRODUCT_ENGINEERING_PROPOSAL_ALREADY_APPLIED', 'Engineering proposal was already applied by another command', { proposalId, appliedReference: exact.appliedReference });
          return exact;
        }
        invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'PRODUCT_ENGINEERING_PROPOSAL_EXPECTED_VERSION_INVALID', 'Expected proposal version must be a positive integer');
        invariant(exact.version === input.expectedVersion, 'PRODUCT_ENGINEERING_PROPOSAL_CONCURRENCY_CONFLICT', 'Engineering proposal changed concurrently', { proposalId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const receipt = input.receipt;
        invariant(receipt && receipt.proposalId === exact.id, 'PRODUCT_ENGINEERING_APPLICATION_RECEIPT_INVALID', 'Canonical application receipt must belong to the exact proposal', { proposalId });
        const intent = required(await tx.getApplicationIntentByProposal(proposalId), 'PRODUCT_ENGINEERING_APPLICATION_INTENT_REQUIRED', { proposalId });
        invariant(receipt.intentId === intent.id && receipt.intentHash === intent.intentHash, 'PRODUCT_ENGINEERING_APPLICATION_RECEIPT_INVALID', 'Canonical application receipt does not match the prepared intent', { proposalId, intentId: intent.id });
        invariant(receipt.canonicalCommandId === input.commandId, 'PRODUCT_ENGINEERING_APPLICATION_RECEIPT_INVALID', 'Canonical application receipt command does not match the applied reference', { proposalId });
        const next = markProposalAppliedDomain(exact, {
          authority: input.authority,
          entityId: input.entityId,
          version: input.version ?? null,
          action: input.action ?? null,
          commandId: input.commandId ?? null,
          receiptId: receipt.id,
          receiptHash: receipt.receiptHash,
          appliedAt: receipt.appliedAt,
        });
        await tx.insertApplicationReceipt(receipt);
        await tx.updateProposal(next, exact.version);
        return next;
      });
    },

    async createConflict(commandId, actorId, analysisRunId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_CONFLICT_INPUT_INVALID');
      await analysisForActor(actorId, analysisRunId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `createEngineeringConflict:${actorId}:${analysisRunId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const analysis = required(await tx.getAnalysisRunForUpdate(analysisRunId), 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', { analysisRunId });
        const conflict = createConflictDomain({
          id: nextId('engineering-conflict'),
          analysisRun: analysis,
          conflictType: input.conflictType,
          subject: input.subject,
          candidates: input.candidates,
          severity: input.severity,
          createdAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertConflict(conflict);
        return conflict;
      });
    },

    async resolveConflict(commandId, actorId, conflictId, input) {
      requireObject(input, 'PRODUCT_ENGINEERING_CONFLICT_RESOLUTION_INVALID');
      const current = required(await store.getConflict(conflictId), 'PRODUCT_ENGINEERING_CONFLICT_NOT_FOUND', { conflictId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `resolveEngineeringConflict:${actorId}:${conflictId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getConflictForUpdate(conflictId), 'PRODUCT_ENGINEERING_CONFLICT_NOT_FOUND', { conflictId });
        invariant(exact.version === input.expectedVersion, 'PRODUCT_ENGINEERING_CONFLICT_CONCURRENCY_CONFLICT', 'Engineering conflict changed concurrently', { conflictId, expectedVersion: input.expectedVersion, actualVersion: exact.version });
        const next = resolveConflictDomain(exact, { disposition: input.disposition, resolution: input.resolution ?? {}, resolvedAt: now(clock), resolvedBy: actorId });
        await tx.updateConflict(next, exact.version);
        return next;
      });
    },

    async createDrawing(commandId, actorId, styleId, input) {
      requireObject(input, 'TECHNICAL_DRAWING_INPUT_INVALID');
      const style = await authorizeStyle(actorId, styleId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const styleVersionId = input.styleVersionId ?? null;
      if (styleVersionId !== null) {
        const exactVersion = await store.getStyleVersion(styleVersionId);
        invariant(exactVersion && exactVersion.styleId === style.id, 'PRODUCT_STYLE_VERSION_NOT_FOUND', 'Product Style Version not found for this style', { styleVersionId, styleId });
      }
      let analysis = null;
      if (input.analysisRunId) {
        analysis = await store.getAnalysisRun(input.analysisRunId);
        invariant(analysis && analysis.styleId === style.id, 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', 'Engineering analysis not found for this style', { analysisRunId: input.analysisRunId, styleId });
      }
      const fingerprint = `createTechnicalDrawing:${actorId}:${styleId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        await tx.lockStyle(styleId);
        const previous = await tx.latestDrawing(styleId, input.viewType);
        const drawing = createTechnicalDrawingDomain({
          id: nextId('technical-drawing'),
          style,
          styleVersionId,
          analysisRun: analysis,
          viewType: input.viewType,
          versionNo: (previous?.versionNo ?? 0) + 1,
          sourceDrawingId: previous?.id ?? null,
          svg: input.svg,
          createdAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertDrawing(drawing);
        return drawing;
      });
    },

    async addDrawingObject(commandId, actorId, drawingId, input) {
      requireObject(input, 'TECHNICAL_DRAWING_OBJECT_INPUT_INVALID');
      const current = required(await store.getDrawing(drawingId), 'TECHNICAL_DRAWING_NOT_FOUND', { drawingId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `addTechnicalDrawingObject:${actorId}:${drawingId}:${canonicalJson(input)}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const drawing = required(await tx.getDrawingForUpdate(drawingId), 'TECHNICAL_DRAWING_NOT_FOUND', { drawingId });
        const object = createDrawingObjectDomain({
          id: nextId('technical-drawing-object'),
          drawing,
          objectType: input.objectType,
          semanticCode: input.semanticCode ?? null,
          garmentNodeId: input.garmentNodeId ?? null,
          geometry: input.geometry,
          linkPayload: input.linkPayload ?? {},
          confidence: input.confidence ?? null,
          createdAt: now(clock),
          createdBy: actorId,
        });
        await tx.insertDrawingObject(object);
        return object;
      });
    },

    async approveDrawing(commandId, actorId, drawingId) {
      const current = required(await store.getDrawing(drawingId), 'TECHNICAL_DRAWING_NOT_FOUND', { drawingId });
      await authorizeBrand(actorId, current.brandId, CAPABILITIES.PRODUCT_ENGINEERING_MANAGE);
      const fingerprint = `approveTechnicalDrawing:${actorId}:${drawingId}`;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exact = required(await tx.getDrawingForUpdate(drawingId), 'TECHNICAL_DRAWING_NOT_FOUND', { drawingId });
        const objects = await tx.getDrawingObjects(drawingId);
        assertTechnicalFlatApprovable({ drawing: exact, objects });
        const next = approveTechnicalDrawingDomain(exact, { approvedAt: now(clock), approvedBy: actorId });
        await tx.supersedeApprovedDrawing(exact.styleId, exact.viewType, exact.id);
        await tx.approveDrawing(next);
        return next;
      });
    },

    async getStyleWorkspaceForActor(actorId, styleId, options = {}) {
      await authorizeStyle(actorId, styleId, CAPABILITIES.PRODUCT_ENGINEERING_READ);
      return store.getStyleWorkspace(styleId, { limit: normalizeLimit(options.limit) });
    },

    async getAnalysisWorkspaceForActor(actorId, analysisRunId) {
      const run = await analysisForActor(actorId, analysisRunId, CAPABILITIES.PRODUCT_ENGINEERING_READ);
      const workspace = await store.getAnalysisWorkspace(analysisRunId);
      invariant(workspace && workspace.analysis.id === run.id, 'PRODUCT_ENGINEERING_ANALYSIS_NOT_FOUND', 'Engineering analysis not found', { analysisRunId });
      return workspace;
    },
  });
}

function required(value, code, details) { invariant(value, code, code.replaceAll('_', ' ').toLowerCase(), details); return value; }
function requireObject(value, code) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Request body must be an object'); }
function now(clock) { const value = clock(); invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'PRODUCT_ENGINEERING_CLOCK_INVALID', 'Clock must return an ISO-compatible string'); return new Date(value).toISOString(); }
function normalizeLimit(value) { if (value === undefined || value === null || value === '') return 100; const number = typeof value === 'string' ? Number(value) : value; invariant(Number.isInteger(number) && number >= 1 && number <= 200, 'PRODUCT_ENGINEERING_LIMIT_INVALID', 'Engineering workspace limit must be 1-200'); return number; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
