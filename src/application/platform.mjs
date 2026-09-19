import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { assertTradePair } from '../modules/organisations/public.mjs';
import { CAPABILITIES, assertCapability, assertTradeCapability } from '../modules/access-control/public.mjs';
import { assertActiveRelationship } from '../modules/counterparty-relationships/public.mjs';
import { createCampaign, changeCampaignStatus } from '../modules/campaigns/public.mjs';
import { createProductResponsibility } from '../modules/product-responsibility/public.mjs';
import {
  createProductPlaceholder,
  createPlaceholderStyleLink,
  transitionProductPlaceholder,
} from '../modules/assortment-planning/public.mjs';
import {
  DICTIONARY_COLUMNS,
  findRepeatedCodes,
  importContract,
  readRow,
  referenceField,
} from '../modules/assortment-planning/import.mjs';
import { createCollection, createCollectionStyleVersionAssignment, publishCollection } from '../modules/collections/public.mjs';
import { advanceCommercialCycle, attachOrder, createCommercialCycle } from '../modules/commercial-cycle/public.mjs';
import { openDealSpace } from '../modules/deal-space/public.mjs';
import { createCalendarMilestone } from '../modules/calendar/public.mjs';

// The import speaks the payload's own field names: the browser has already matched the spreadsheet's
// headers to them, and the server reads the row through the same reader so a hand-written request is
// held to exactly the same rules as an uploaded file.
const ROW_FIELDS = Object.freeze([
  'placeholderCode', 'nameRu', 'nameEn', 'category', 'gender', 'ageGroup', 'novelty', 'seasonality',
  'fit', 'capsule', 'drop', 'description', 'colourwayCount', 'plannedQuantity', 'launchAt', 'currency',
  'recommendedRetailPrice', 'plannedUnitCost',
]);
const ROW_COLUMNS = Object.freeze(Object.fromEntries(ROW_FIELDS.map((field, index) => [field, index])));
function rowValues(row) { return ROW_FIELDS.map((field) => row?.[field] ?? ''); }

export function createWholesalePlatform({
  store,
  productIdentityStore = null,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
  systemActorId = 'system',
} = {}) {
  assertWholesaleStore(store);

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      }
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    const event = domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } });
    await tx.appendOutbox(event);
    return event;
  }

  async function assertOrganisationActor(tx, organisationId, actorId, capability) {
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, capability);
    return membership;
  }

  async function authorizeTrade(tx, actorId, cycle, capability) {
    return assertTradeCapability({
      memberships: await tx.listMembershipsForTrade(cycle.brandId, cycle.shopId), actorId,
      brandId: cycle.brandId, shopId: cycle.shopId, capability,
    });
  }

  async function loadStyle(styleId) {
    invariant(productIdentityStore && typeof productIdentityStore.transaction === 'function', 'PRODUCT_IDENTITY_STORE_REQUIRED', 'Product Identity store is required for assortment planning');
    return productIdentityStore.transaction(async (tx) => {
      invariant(typeof tx.getStyleForUpdate === 'function', 'PRODUCT_STYLE_READER_REQUIRED', 'Product Identity store must expose a style reader');
      return tx.getStyleForUpdate(styleId);
    });
  }

  async function loadStyleVersion(styleVersionId) {
    invariant(productIdentityStore && typeof productIdentityStore.transaction === 'function', 'PRODUCT_IDENTITY_STORE_REQUIRED', 'Product Identity store is required for collection Style Version assignment');
    return productIdentityStore.transaction(async (tx) => {
      invariant(typeof tx.getStyleVersion === 'function', 'PRODUCT_STYLE_VERSION_READER_REQUIRED', 'Product Identity store must expose getStyleVersion');
      return tx.getStyleVersion(styleVersionId);
    });
  }

  return Object.freeze({
    registerOrganisation(commandId, actorId, organisation) {
      return execute(
        commandId,
        `registerOrganisation:${actorId}:${canonicalJson(organisation)}`,
        actorId,
        async () => {
          invariant(actorId === systemActorId, 'SYSTEM_ACTOR_REQUIRED', 'Only the system actor can register organisations');
          return organisation;
        },
        async (tx) => {
          await tx.insertOrganisation(organisation);
          await append(tx, 'organisation.registered', organisation.id, { type: organisation.type }, commandId, actorId);
          return organisation;
        },
      );
    },

    grantMembership(commandId, actorId, membership) {
      return execute(
        commandId,
        `grantMembership:${actorId}:${canonicalJson(membership)}`,
        actorId,
        async (tx) => {
          const organisation = await tx.getOrganisation(membership.organisationId);
          invariant(organisation, 'ORG_NOT_FOUND', 'Membership organisation not found', { organisationId: membership.organisationId });
          invariant(organisation.type === membership.organisationType, 'MEMBERSHIP_ORG_TYPE_MISMATCH', 'Membership organisation type does not match organisation');
          const organisationMemberships = await tx.listMembershipsByOrganisation(organisation.id);
          const replayedBootstrap = actorId === systemActorId && organisationMemberships.some((candidate) => candidate.id === membership.id);
          if (organisationMemberships.length === 0 || replayedBootstrap) {
            invariant(actorId === systemActorId, 'SYSTEM_ACTOR_REQUIRED', 'Only the system actor can bootstrap the first membership');
            invariant(membership.role === 'owner', 'FIRST_MEMBERSHIP_OWNER_REQUIRED', 'The first membership must be owner');
          } else {
            await assertOrganisationActor(tx, organisation.id, actorId, CAPABILITIES.ORGANISATION_MANAGE);
          }
          return organisation;
        },
        async (tx, organisation) => {
          await tx.insertMembership(membership);
          await append(tx, 'membership.granted', membership.id, { organisationId: organisation.id, userId: membership.userId, role: membership.role }, commandId, actorId);
          return membership;
        },
      );
    },

    createCampaign(commandId, actorId, input) {
      return execute(
        commandId,
        `createCampaign:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const brand = await tx.getOrganisation(input.brandId);
          invariant(brand?.type === 'brand', 'BRAND_REQUIRED', 'Campaign owner must be a brand');
          await assertOrganisationActor(tx, brand.id, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          return brand;
        },
        async (tx) => {
          const campaign = createCampaign({ id: nextId('campaign'), ...input, createdAt: clock() });
          await tx.insertCampaign(campaign);
          await append(tx, 'campaign.created', campaign.id, { brandId: campaign.brandId, season: campaign.season }, commandId, actorId);
          return campaign;
        },
      );
    },

    openCampaign(commandId, actorId, campaignId) {
      return execute(
        commandId,
        `openCampaign:${actorId}:${campaignId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCampaign(campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId });
          await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          return current;
        },
        async (tx, current) => {
          const updated = changeCampaignStatus(current, 'open', clock());
          await tx.saveCampaign(updated, current.version);
          await append(tx, 'campaign.opened', campaignId, { version: updated.version }, commandId, actorId);
          return updated;
        },
      );
    },

    // Assortment planning. A placeholder is planned against an open campaign before any style exists;
    // the styles developed for it are linked back, which is what lets the season be read as plan
    // versus fact instead of a list of what happened to get built.
    createProductPlaceholder(commandId, actorId, input) {
      return execute(
        commandId,
        `createProductPlaceholder:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const campaign = requireEntity(await tx.getCampaign(input?.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: input?.campaignId });
          await assertOrganisationActor(tx, campaign.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          return campaign;
        },
        async (tx, campaign) => {
          const placeholder = createProductPlaceholder({
            id: nextId('product-placeholder'),
            campaign,
            brandId: campaign.brandId,
            ...input,
            createdAt: clock(),
            createdBy: actorId,
          });
          await tx.insertProductPlaceholder(placeholder);
          await append(tx, 'assortment.placeholder.planned', placeholder.id, {
            campaignId: placeholder.campaignId,
            placeholderCode: placeholder.placeholderCode,
            plannedQuantity: placeholder.plannedQuantity,
            plannedMarginBasisPoints: placeholder.plannedMarginBasisPoints,
          }, commandId, actorId);
          return placeholder;
        },
      );
    },

    // The spreadsheet contract, so the screen that builds the template and the server that checks it
    // cannot describe different files.
    placeholderImportContract() { return importContract(); },

    // Import a season plan.
    //
    // Two things decide the shape of this. It runs twice — once to say what would happen, once to do
    // it — because a plan is read by a person before it is committed, and an import that reports its
    // mistakes one at a time is an import that takes a morning. And a commit is all or nothing: a
    // season half-loaded looks exactly like a season, and the gap is found weeks later by someone
    // wondering why a category is thin. The one exception is a slot that already exists, which is
    // skipped rather than refused, so a corrected file can simply be sent again.
    // Async so the guards below reject rather than throw synchronously: a caller awaiting a command
    // should not have to also wrap it in a try block for the cheap checks.
    async importProductPlaceholders(commandId, actorId, input) {
      const mode = input?.mode === 'commit' ? 'commit' : 'validate';
      const rows = Array.isArray(input?.rows) ? input.rows : [];
      invariant(rows.length > 0, 'PLACEHOLDER_IMPORT_EMPTY', 'An import needs at least one row');
      invariant(rows.length <= 1000, 'PLACEHOLDER_IMPORT_TOO_LARGE', 'An import is limited to 1000 rows', { rows: rows.length });

      const run = async (tx) => {
        const campaign = requireEntity(await tx.getCampaign(input?.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: input?.campaignId });
        await assertOrganisationActor(tx, campaign.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);

        const existing = new Set(await tx.getPlaceholderCodesForCampaign(campaign.id));
        const repeated = findRepeatedCodes(rows.map((row, index) => ({
          code: String(row?.placeholderCode ?? '').trim().toUpperCase(),
          line: Number.isInteger(row?.line) ? row.line : index + 1,
        })));
        const dictionaries = new Map();
        const resolved = new Map();

        const verdicts = [];
        for (const [index, row] of rows.entries()) {
          const line = Number.isInteger(row?.line) ? row.line : index + 1;
          const read = readRow(rowValues(row), ROW_COLUMNS, { defaultCurrency: input?.defaultCurrency ?? null });
          const problems = [...read.problems];

          if (read.placeholderCode && repeated.has(read.placeholderCode)) {
            problems.push({ column: 'placeholderCode', reason: 'repeatedInFile', value: repeated.get(read.placeholderCode).join(', ') });
          }

          const references = {};
          for (const [column, token] of Object.entries(read.lookups)) {
            const dictionaryCode = DICTIONARY_COLUMNS[column];
            const key = `${dictionaryCode}:${token.toLowerCase()}`;
            if (!dictionaries.has(dictionaryCode)) dictionaries.set(dictionaryCode, await tx.mdmDictionaryExists(dictionaryCode));
            if (!dictionaries.get(dictionaryCode)) {
              problems.push({ column, reason: 'dictionaryMissing', value: dictionaryCode });
              continue;
            }
            if (!resolved.has(key)) resolved.set(key, await tx.findMdmEntryByToken(dictionaryCode, token));
            const entry = resolved.get(key);
            if (!entry) problems.push({ column, reason: 'unknownValue', value: token });
            else if (entry.ambiguous) problems.push({ column, reason: 'ambiguousValue', value: token });
            else references[referenceField(column)] = { entryId: entry.entryId, version: entry.version };
          }

          if (problems.length) {
            verdicts.push({ line, placeholderCode: read.placeholderCode || null, verdict: 'rejected', problems });
            continue;
          }
          if (existing.has(read.placeholderCode)) {
            verdicts.push({ line, placeholderCode: read.placeholderCode, verdict: 'skipped', problems: [] });
            continue;
          }
          verdicts.push({ line, placeholderCode: read.placeholderCode, verdict: 'ready', problems: [], input: { ...read.draft, ...references } });
        }

        const rejected = verdicts.filter((verdict) => verdict.verdict === 'rejected');
        const ready = verdicts.filter((verdict) => verdict.verdict === 'ready');
        const summary = {
          total: verdicts.length,
          ready: ready.length,
          skipped: verdicts.filter((verdict) => verdict.verdict === 'skipped').length,
          rejected: rejected.length,
        };
        if (mode === 'validate' || rejected.length || !ready.length) {
          return Object.freeze({
            mode, campaignId: campaign.id, committed: false, summary,
            rows: Object.freeze(verdicts.map((verdict) => Object.freeze({ ...verdict, problems: Object.freeze(verdict.problems) }))),
          });
        }

        const created = [];
        for (const verdict of ready) {
          const placeholder = createProductPlaceholder({
            id: nextId('product-placeholder'),
            campaign,
            brandId: campaign.brandId,
            ...verdict.input,
            createdAt: clock(),
            createdBy: actorId,
          });
          await tx.insertProductPlaceholder(placeholder);
          created.push(placeholder.placeholderCode);
          verdict.verdict = 'created';
          delete verdict.input;
        }
        // One event for the import, not one per slot: what happened is that a plan was loaded, and a
        // reader of the history wants to see that, not four hundred identical lines.
        await append(tx, 'assortment.placeholders.imported', campaign.id, {
          campaignId: campaign.id, created: created.length, skipped: summary.skipped, placeholderCodes: created,
        }, commandId, actorId);
        return Object.freeze({
          mode, campaignId: campaign.id, committed: true, summary,
          rows: Object.freeze(verdicts.map((verdict) => Object.freeze({ ...verdict, problems: Object.freeze(verdict.problems) }))),
        });
      };

      // A dry run changes nothing, so it must not consume the caller's command id either: the same id
      // is what commits the import a moment later.
      if (mode === 'validate') return store.transaction(run);
      return execute(commandId, `importProductPlaceholders:${actorId}:${canonicalJson(input)}`, actorId, run, (tx, result) => result);
    },

    transitionProductPlaceholder(commandId, actorId, placeholderId, input) {
      return execute(
        commandId,
        `transitionProductPlaceholder:${actorId}:${placeholderId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getProductPlaceholder(placeholderId), 'PLACEHOLDER_NOT_FOUND', { placeholderId });
          await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          return current;
        },
        async (tx, current) => {
          const updated = transitionProductPlaceholder(current, input?.nextStatus, {
            updatedAt: clock(),
            updatedBy: actorId,
            expectedVersion: input?.expectedVersion,
          });
          await tx.saveProductPlaceholder(updated, current.version);
          await append(tx, 'assortment.placeholder.transitioned', placeholderId, {
            from: current.status, to: updated.status, version: updated.version,
          }, commandId, actorId);
          return updated;
        },
      );
    },

    linkStyleToPlaceholder(commandId, actorId, placeholderId, input) {
      return execute(
        commandId,
        `linkStyleToPlaceholder:${actorId}:${placeholderId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const placeholder = requireEntity(await tx.getProductPlaceholder(placeholderId), 'PLACEHOLDER_NOT_FOUND', { placeholderId });
          await assertOrganisationActor(tx, placeholder.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          // Styles live in the Product Identity context, so they are read through its own store
          // rather than joined here.
          const style = requireEntity(await loadStyle(input?.styleId), 'PRODUCT_STYLE_NOT_FOUND', { styleId: input?.styleId });
          return { placeholder, style };
        },
        async (tx, { placeholder, style }) => {
          const link = createPlaceholderStyleLink({
            id: nextId('placeholder-style-link'),
            placeholder,
            style,
            linkedAt: clock(),
            linkedBy: actorId,
          });
          await tx.insertProductPlaceholderStyleLink(link);
          await append(tx, 'assortment.placeholder.style-linked', placeholder.id, {
            styleId: link.styleId, campaignId: link.campaignId,
          }, commandId, actorId);
          return link;
        },
      );
    },

    // Desks on a style. Assignment is a recorded event, and the person has to be an active member of
    // the brand that owns the style -- checked here and again by a database trigger.
    assignProductResponsibility(commandId, actorId, styleId, input) {
      return execute(
        commandId,
        `assignProductResponsibility:${actorId}:${styleId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const style = requireEntity(await loadStyle(styleId), 'PRODUCT_STYLE_NOT_FOUND', { styleId });
          await assertOrganisationActor(tx, style.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          const membership = await tx.getMembership(style.brandId, input?.userId);
          return { style, membership };
        },
        async (tx, { style, membership }) => {
          const responsibility = createProductResponsibility({
            id: nextId('product-responsibility'),
            style,
            role: input?.role,
            userId: input?.userId,
            membership,
            assignedAt: clock(),
            assignedBy: actorId,
          });
          await tx.insertProductResponsibility(responsibility);
          await append(tx, 'product.responsibility.assigned', responsibility.id, {
            styleId: responsibility.styleId, role: responsibility.role, userId: responsibility.userId,
          }, commandId, actorId);
          return responsibility;
        },
      );
    },

    releaseProductResponsibility(commandId, actorId, responsibilityId) {
      return execute(
        commandId,
        `releaseProductResponsibility:${actorId}:${responsibilityId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getProductResponsibility(responsibilityId), 'PRODUCT_RESPONSIBILITY_NOT_FOUND', { responsibilityId });
          await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          return current;
        },
        async (tx, current) => {
          await tx.deleteProductResponsibility(responsibilityId);
          await append(tx, 'product.responsibility.released', responsibilityId, {
            styleId: current.styleId, role: current.role, userId: current.userId,
          }, commandId, actorId);
          return Object.freeze({ ...current, releasedAt: clock(), releasedBy: actorId });
        },
      );
    },

    createCollection(commandId, actorId, input) {
      return execute(
        commandId,
        `createCollection:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const campaign = requireEntity(await tx.getCampaign(input.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: input.campaignId });
          await assertOrganisationActor(tx, campaign.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
          return campaign;
        },
        async (tx, campaign) => {
          const collection = createCollection({ id: nextId('collection'), campaign, ...input, createdAt: clock() });
          await tx.insertCollection(collection);
          await append(tx, 'collection.created', collection.id, { campaignId: campaign.id, currency: collection.currency }, commandId, actorId);
          return collection;
        },
      );
    },

    assignStyleVersionToCollection(commandId, actorId, input) {
      invariant(input?.collectionId && input?.styleVersionId, 'COLLECTION_STYLE_VERSION_INPUT_REQUIRED', 'collectionId and styleVersionId are required');
      return execute(
        commandId,
        `assignStyleVersionToCollection:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const collection = requireEntity(await tx.getCollection(input.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: input.collectionId });
          await assertOrganisationActor(tx, collection.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
          invariant(collection.status === 'draft', 'COLLECTION_ASSORTMENT_LOCKED', 'Style Version assortment can only change while the collection is draft');
          const existing = await tx.getCollectionStyleVersion(collection.id, input.styleVersionId);
          if (existing) return Object.freeze({ collection, existing, styleVersion: null });
          const styleVersion = requireEntity(await loadStyleVersion(input.styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId: input.styleVersionId });
          invariant(styleVersion.brandId === collection.brandId, 'COLLECTION_STYLE_VERSION_BRAND_MISMATCH', 'Style Version brand must match collection brand');
          return Object.freeze({ collection, existing: null, styleVersion });
        },
        async (tx, { collection, existing, styleVersion }) => {
          if (existing) return existing;
          const assignment = createCollectionStyleVersionAssignment({
            id: nextId('collection-style-version'),
            collection,
            styleVersion,
            assignedAt: clock(),
            assignedBy: actorId,
          });
          await tx.insertCollectionStyleVersion(assignment);
          await append(tx, 'collection.style-version-assigned', collection.id, {
            collectionId: collection.id,
            styleVersionId: styleVersion.id,
            brandId: collection.brandId,
          }, commandId, actorId);
          return assignment;
        },
      );
    },

    publishCollection(commandId, actorId, collectionId) {
      return execute(
        commandId,
        `publishCollection:${actorId}:${collectionId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
          const campaign = requireEntity(await tx.getCampaign(current.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: current.campaignId });
          await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
          return Object.freeze({ current, campaign });
        },
        async (tx, { current, campaign }) => {
          const updated = publishCollection(current, campaign, clock());
          await tx.saveCollection(updated, current.version);
          await append(tx, 'collection.published', collectionId, { version: updated.version }, commandId, actorId);
          return updated;
        },
      );
    },

    startCycle(commandId, actorId, { brandId, shopId, campaignId, collectionId }) {
      const input = { brandId, shopId, campaignId, collectionId };
      return execute(
        commandId,
        `startCycle:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const brand = await tx.getOrganisation(brandId);
          const shop = await tx.getOrganisation(shopId);
          assertTradePair({ brand, shop });
          assertTradeCapability({
            memberships: await tx.listMembershipsForTrade(brandId, shopId), actorId, brandId, shopId,
            capability: CAPABILITIES.COMMERCIAL_CYCLE_CREATE,
          });
          const relationship = await tx.getRelationshipByTrade(brandId, shopId);
          assertActiveRelationship(relationship, { brandId, shopId });
          const campaign = requireEntity(await tx.getCampaign(campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId });
          const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
          return Object.freeze({ brand, shop, relationship, campaign, collection });
        },
        async (tx, { relationship, campaign, collection }) => {
          const cycle = createCommercialCycle({ id: nextId('cycle'), brandId, shopId, campaign, collection, createdAt: clock() });
          await tx.insertCycle(cycle);
          await append(tx, 'commercial-cycle.started', cycle.id, { ...input, relationshipId: relationship.id }, commandId, actorId);
          return cycle;
        },
      );
    },

    advanceCycle(commandId, actorId, cycleId, targetStage) {
      return execute(
        commandId,
        `advanceCycle:${actorId}:${cycleId}:${targetStage}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
          await authorizeTrade(tx, actorId, current, CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE);
          invariant(
            current.stage === 'campaign' || current.stage === 'collection',
            'CYCLE_MANAGED_TRANSITION_REQUIRED',
            'This commercial stage must advance through its dedicated workflow',
            { stage: current.stage, targetStage },
          );
          return current;
        },
        async (tx, current) => {
          const updated = advanceCommercialCycle(current, targetStage, clock());
          await tx.saveCycle(updated, current.version);
          await append(tx, 'commercial-cycle.advanced', cycleId, { from: current.stage, to: targetStage, version: updated.version }, commandId, actorId);
          return updated;
        },
      );
    },

    attachOrder(commandId, actorId, cycleId, order) {
      return execute(
        commandId,
        `attachOrder:${actorId}:${cycleId}:${canonicalJson(order)}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
          await authorizeTrade(tx, actorId, current, CAPABILITIES.ORDER_WRITE);
          const collection = requireEntity(await tx.getCollection(current.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: current.collectionId });
          invariant(order.currency === collection.currency, 'ORDER_COLLECTION_CURRENCY_MISMATCH', 'Order currency must match collection currency', {
            orderCurrency: order.currency, collectionCurrency: collection.currency,
          });
          return current;
        },
        async (tx, current) => {
          const updated = attachOrder(current, order, clock());
          await tx.saveCycle(updated, current.version);
          await append(tx, 'order.attached', cycleId, { orderId: order.id, totalAmount: order.totalAmount, currency: order.currency }, commandId, actorId);
          return updated;
        },
      );
    },

    confirmAndOpenDeal(commandId, actorId, cycleId) {
      return execute(
        commandId,
        `confirmAndOpenDeal:${actorId}:${cycleId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
          await authorizeTrade(tx, actorId, current, CAPABILITIES.ORDER_CONFIRM);
          return current;
        },
        async (tx, current) => {
          const confirmed = advanceCommercialCycle(current, 'confirmation', clock());
          await tx.saveCycle(confirmed, current.version);
          const deal = openDealSpace({ id: nextId('deal'), cycle: confirmed, createdAt: clock() });
          const brandMilestone = createCalendarMilestone({
            id: nextId('calendar'), ownerOrganisationId: confirmed.brandId, cycleId, type: 'deal',
            title: `Deal opened for ${confirmed.order.id}`, startsAt: clock(), visibility: 'shared',
          });
          const shopMilestone = createCalendarMilestone({
            id: nextId('calendar'), ownerOrganisationId: confirmed.shopId, cycleId, type: 'deal',
            title: `Deal opened for ${confirmed.order.id}`, startsAt: brandMilestone.startsAt, visibility: 'shared',
          });
          const completed = advanceCommercialCycle(confirmed, 'deal-space', clock());
          await tx.saveCycle(completed, confirmed.version);
          await tx.insertDeal(deal);
          await tx.insertCalendarMilestone(brandMilestone);
          await tx.insertCalendarMilestone(shopMilestone);
          await append(tx, 'order.confirmed', cycleId, { orderId: completed.order.id }, commandId, actorId);
          await append(tx, 'deal-space.opened', deal.id, { cycleId, orderId: deal.orderId }, commandId, actorId);
          return Object.freeze({ cycle: completed, deal, milestones: Object.freeze([brandMilestone, shopMilestone]) });
        },
      );
    },

    snapshot() { return store.snapshot(); },
  });
}

function requireEntity(entity, code, details) {
  invariant(entity, code, 'Entity not found', details);
  return entity;
}
function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
