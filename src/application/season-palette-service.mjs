import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { domainEvent } from '../core/events.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { seasonPaletteEntry } from '../modules/season-palette/public.mjs';

/**
 * Палитра сезона.
 *
 * Регистр отвечает на вопрос «что вообще в этом сезоне», на который до сих пор ответить было
 * некому: таблица существовала, а кода к ней не было ни строки.
 *
 * Право то же, что и у самой кампании: палитра — это решение о сезоне, а не о материале, и ведёт
 * её тот, кто ведёт коммерческий цикл. Читать её вправе всякий, кто состоит в бренде: по ней
 * рисуют цветомодели, по ней же закупают полотно.
 *
 * @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options]
 */
export function createSeasonPaletteService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'SEASON_PALETTE_STORE_REQUIRED', 'Season palette store is required');

  return Object.freeze({
    addColourToSeason(commandId, actorId, campaignId, input) {
      invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      const fingerprint = `addColourToSeason:${actorId}:${campaignId}:${canonicalJson(input)}`;
      return store.transaction(async (tx) => {
        const previous = await tx.getCommand?.(commandId);
        if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });

        const campaign = await tx.getCampaign(campaignId);
        invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign not found', { campaignId });
        const membership = await tx.getMembership(campaign.brandId, actorId);
        assertCapability(membership, CAPABILITIES.COMMERCIAL_CYCLE_CREATE);
        if (previous) return previous.result;

        const colourEntry = await tx.getColourEntry(input?.colourCode);
        invariant(colourEntry, 'SEASON_PALETTE_COLOUR_UNKNOWN',
          'That colour is not in the colour dictionary', { colourCode: input?.colourCode ?? null });

        const entry = seasonPaletteEntry({
          id: nextId('season-palette'),
          brandId: campaign.brandId,
          campaign,
          colourEntry,
          position: input?.position,
          createdAt: clock(),
          createdBy: actorId,
        });
        await tx.insertPaletteEntry(entry);
        await tx.appendOutbox?.(domainEvent({
          id: nextId('event'),
          type: 'season.palette-colour-added',
          aggregateId: entry.campaignId,
          occurredAt: entry.createdAt,
          payload: {
            campaignId: entry.campaignId,
            brandId: entry.brandId,
            colourCode: entry.colourCode,
            colourEntryId: entry.colourEntryId,
            colourEntryVersion: entry.colourEntryVersion,
            position: entry.position,
          },
          metadata: { commandId, actorId },
        }));
        await tx.insertCommand?.(Object.freeze({ id: commandId, fingerprint, actorId, result: entry, completedAt: clock() }));
        return entry;
      });
    },

    getSeasonPaletteForActor(actorId, campaignId) {
      return store.transaction(async (tx) => {
        const campaign = await tx.getCampaign(campaignId);
        invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign not found', { campaignId });
        const membership = await tx.getMembership(campaign.brandId, actorId);
        assertCapability(membership, CAPABILITIES.PRODUCT_READ);
        return Object.freeze({ campaignId, brandId: campaign.brandId, colours: Object.freeze(await tx.listPalette(campaignId)) });
      });
    },
  });
}

function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
