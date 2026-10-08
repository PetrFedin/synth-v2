import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  assertVisualRailCapacity,
  buildVisualRailSnapshot,
  createVisualRail,
  createVisualRailBoard,
  createVisualRailPlacement,
  previewVisualRailArrangement,
  relocateVisualRailPlacement,
  reviseVisualRailBoard,
} from '../modules/visual-rail/public.mjs';

/** @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options] */
export function createVisualRailService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function','VISUAL_RAIL_STORE_REQUIRED','Visual Rail store is required');

  async function execute(commandId,actorId,fingerprint,action) {
    invariant(typeof commandId==='string'&&commandId,'COMMAND_ID_REQUIRED','Every mutation requires commandId');
    invariant(typeof actorId==='string'&&actorId,'ACTOR_ID_REQUIRED','Actor id is required');
    return store.transaction(async (tx)=>{
      const previous=await tx.getCommand(commandId);
      if(previous) {
        invariant(fingerprintsMatch(previous.fingerprint,fingerprint),'COMMAND_ID_CONFLICT','commandId was already used by another mutation',{commandId});
        return previous.result;
      }
      const result=await action(tx);
      await tx.insertCommand({id:commandId,fingerprint,actorId,result,completedAt:clock()});
      return result;
    });
  }

  async function requireMembership(tx,organisationId,actorId,capability) {
    const membership=await tx.getMembership(organisationId,actorId);
    assertCapability(membership,capability);
    return membership;
  }

  async function requireRead(tx,board,actorId) {
    const membership=await tx.getMembership(board.ownerOrganisationId,actorId);
    if(membership?.status==='active') {
      try { assertCapability(membership,CAPABILITIES.VISUAL_RAIL_READ); return; } catch {}
    }
    if(board.source?.type==='showroom' && await tx.actorHasShowroomAccess(board.source.id,actorId)) return;
    invariant(false,'VISUAL_RAIL_READ_DENIED','Actor cannot read this Visual Rail board',{boardId:board.id});
  }

  async function loadManaged(tx,boardId,actorId,expectedVersion) {
    const board=await tx.getBoard(boardId,{lock:true});
    invariant(board,'VISUAL_RAIL_BOARD_NOT_FOUND','Visual Rail board not found',{boardId});
    await requireMembership(tx,board.ownerOrganisationId,actorId,CAPABILITIES.VISUAL_RAIL_MANAGE);
    invariant(expectedVersion===board.version,'VISUAL_RAIL_CONCURRENCY_CONFLICT','Visual Rail board version conflict',{
      boardId,expectedVersion,actualVersion:board.version,
    });
    return board;
  }

  async function append(tx,type,aggregateId,payload,commandId,actorId) {
    await tx.appendOutbox(domainEvent({
      id:nextId('event'),type,aggregateId,occurredAt:clock(),payload,metadata:{commandId,actorId},
    }));
  }

  async function revise(tx,board,actorId,status='draft') {
    const next=reviseVisualRailBoard(board,{updatedBy:actorId,updatedAt:clock(),status});
    await tx.saveBoard(next,board.version);
    return next;
  }

  return Object.freeze({
    createBoard(commandId,actorId,input) {
      const fingerprint=`visualRail.createBoard:${actorId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const source=await tx.getSource(String(input?.sourceType??''),String(input?.sourceId??''),{lock:true});
        invariant(source,'VISUAL_RAIL_SOURCE_NOT_FOUND','Visual Rail source not found',{sourceType:input?.sourceType,sourceId:input?.sourceId});
        await requireMembership(tx,source.ownerOrganisationId,actorId,CAPABILITIES.VISUAL_RAIL_MANAGE);
        if(source.type==='showroom') invariant(['draft','open'].includes(source.status),'VISUAL_RAIL_SHOWROOM_INACTIVE','Showroom must be draft or open');
        const board=createVisualRailBoard({
          id:nextId('visual-rail-board'),
          ownerOrganisationId:source.ownerOrganisationId,
          mode:input?.mode,
          source:{type:source.type,id:source.id,version:source.version,contentHash:source.contentHash},
          title:input?.title,
          createdBy:actorId,
          createdAt:clock(),
        });
        await tx.insertBoard(board);
        await append(tx,'visual-rail.board.created.v1',board.id,{
          boardId:board.id,ownerOrganisationId:board.ownerOrganisationId,mode:board.mode,source:board.source,version:board.version,
        },commandId,actorId);
        return board;
      });
    },

    addRail(commandId,actorId,boardId,input) {
      const fingerprint=`visualRail.addRail:${actorId}:${boardId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const board=await loadManaged(tx,boardId,actorId,input?.expectedVersion);
        const rails=await tx.listRails(boardId,{lock:true});
        const position=rails.length+1;
        const rail=createVisualRail({
          id:nextId('visual-rail'),board,position,label:input?.label,
          capacityMode:input?.capacityMode??'items',
          capacityCount:input?.capacityCount??20,
          physicalLengthCm:input?.physicalLengthCm??null,
          densityProfile:input?.densityProfile??'balanced',
        });
        await tx.insertRail(rail);
        const nextBoard=await revise(tx,board,actorId);
        await append(tx,'visual-rail.rail.added.v1',board.id,{boardId:board.id,railId:rail.id,position:rail.position,version:nextBoard.version},commandId,actorId);
        return Object.freeze({board:nextBoard,rail});
      });
    },

    updateRail(commandId,actorId,boardId,railId,input) {
      const fingerprint=`visualRail.updateRail:${actorId}:${boardId}:${railId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const board=await loadManaged(tx,boardId,actorId,input?.expectedVersion);
        const current=await tx.getRail(railId,{lock:true});
        invariant(current?.boardId===board.id,'VISUAL_RAIL_NOT_FOUND','Visual Rail not found',{railId});
        const next=createVisualRail({
          id:current.id,board,position:current.position,label:input?.label??current.label,
          capacityMode:input?.capacityMode??current.capacityMode,
          capacityCount:input?.capacityCount??current.capacityCount,
          physicalLengthCm:input?.physicalLengthCm??current.physicalLengthCm,
          densityProfile:input?.densityProfile??current.densityProfile,
        });
        const revised=Object.freeze({...next,version:current.version+1});
        const placements=(await tx.listPlacements(board.id,{lock:true})).filter((item)=>item.railId===railId);
        assertVisualRailCapacity(revised,placements);
        await tx.saveRail(revised,current.version);
        const nextBoard=await revise(tx,board,actorId);
        await append(tx,'visual-rail.rail.updated.v1',board.id,{boardId:board.id,railId,version:nextBoard.version},commandId,actorId);
        return Object.freeze({board:nextBoard,rail:revised});
      });
    },

    addPlacement(commandId,actorId,boardId,input) {
      const fingerprint=`visualRail.addPlacement:${actorId}:${boardId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const board=await loadManaged(tx,boardId,actorId,input?.expectedVersion);
        const rail=await tx.getRail(String(input?.railId??''),{lock:true});
        invariant(rail?.boardId===board.id,'VISUAL_RAIL_NOT_FOUND','Destination rail not found',{railId:input?.railId});
        const source=await tx.getSource(board.source.type,board.source.id,{lock:false});
        invariant(source,'VISUAL_RAIL_SOURCE_NOT_FOUND','Visual Rail source not found');
        const productRef={type:input?.productRefType,id:input?.productRefId};
        const product=await tx.getVisualProduct(source,productRef);
        invariant(product,'VISUAL_RAIL_PRODUCT_NOT_AVAILABLE','Product is not available in this Visual Rail source',{productRef});
        const all=await tx.listPlacements(board.id,{lock:true});
        invariant(!all.some((item)=>item.productRef.type===product.productRef.type&&item.productRef.id===product.productRef.id),
          'VISUAL_RAIL_PRODUCT_ALREADY_PLACED','Product is already placed on this board',{productRef:product.productRef});
        const targetItems=all.filter((item)=>item.railId===rail.id).sort(byPosition);
        const requested=normalizeInsertPosition(input?.position,targetItems.length+1);
        const placement=createVisualRailPlacement({
          id:nextId('visual-rail-placement'),board,rail,position:targetItems.length+1,
          productRef:product.productRef,
          sourceSnapshot:sourceSnapshot(product),
          visualProfile:visualProfile(product),
          estimatedWidthCm:input?.estimatedWidthCm??null,
          createdBy:actorId,createdAt:clock(),
        });
        await tx.insertPlacement(placement);
        const ordered=[...targetItems];
        ordered.splice(requested-1,0,placement);
        const targetIds=new Set(ordered.map((item)=>item.id));
        const layout=all.filter((item)=>!targetIds.has(item.id)).concat(
          ordered.map((item,index)=>relocateVisualRailPlacement(item,{railId:rail.id,position:index+1})),
        );
        const targetLayout=layout.filter((item)=>item.railId===rail.id);
        assertVisualRailCapacity(rail,targetLayout);
        await tx.replacePlacementLayout(board.id,layout);
        const nextBoard=await revise(tx,board,actorId);
        const inserted=targetLayout.find((item)=>item.id===placement.id);
        await append(tx,'visual-rail.placement.added.v1',board.id,{
          boardId:board.id,railId:rail.id,placementId:placement.id,productRef:placement.productRef,position:inserted.position,version:nextBoard.version,
        },commandId,actorId);
        return Object.freeze({board:nextBoard,placement:inserted});
      });
    },

    movePlacement(commandId,actorId,boardId,placementId,input) {
      const fingerprint=`visualRail.movePlacement:${actorId}:${boardId}:${placementId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const board=await loadManaged(tx,boardId,actorId,input?.expectedVersion);
        const placement=await tx.getPlacement(placementId,{lock:true});
        invariant(placement?.boardId===board.id,'VISUAL_RAIL_PLACEMENT_NOT_FOUND','Visual Rail placement not found',{placementId});
        invariant(!placement.locked,'VISUAL_RAIL_PLACEMENT_LOCKED','Locked garment cannot be moved',{placementId});
        const rails=await tx.listRails(board.id,{lock:true});
        const destination=rails.find((rail)=>rail.id===input?.toRailId);
        invariant(destination,'VISUAL_RAIL_NOT_FOUND','Destination rail not found',{railId:input?.toRailId});
        const all=await tx.listPlacements(board.id,{lock:true});
        const without=all.filter((item)=>item.id!==placement.id);
        const destinationItems=without.filter((item)=>item.railId===destination.id).sort(byPosition);
        const requested=normalizeInsertPosition(input?.toPosition,destinationItems.length+1);
        const moved=relocateVisualRailPlacement(placement,{railId:destination.id,position:destinationItems.length+1});
        destinationItems.splice(requested-1,0,moved);
        const affectedRails=new Set([placement.railId,destination.id]);
        const layout=[];
        for(const rail of rails) {
          let items;
          if(rail.id===destination.id) items=destinationItems;
          else items=without.filter((item)=>item.railId===rail.id).sort(byPosition);
          const normalized=items.map((item,index)=>relocateVisualRailPlacement(item,{railId:rail.id,position:index+1}));
          if(affectedRails.has(rail.id)) assertVisualRailCapacity(rail,normalized);
          layout.push(...normalized);
        }
        await tx.replacePlacementLayout(board.id,layout);
        const nextBoard=await revise(tx,board,actorId);
        const result=layout.find((item)=>item.id===placement.id);
        await append(tx,'visual-rail.placement.moved.v1',board.id,{
          boardId:board.id,placementId,fromRailId:placement.railId,toRailId:result.railId,position:result.position,version:nextBoard.version,
        },commandId,actorId);
        return Object.freeze({board:nextBoard,placement:result});
      });
    },

    removePlacement(commandId,actorId,boardId,placementId,input) {
      const fingerprint=`visualRail.removePlacement:${actorId}:${boardId}:${placementId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const board=await loadManaged(tx,boardId,actorId,input?.expectedVersion);
        const placement=await tx.getPlacement(placementId,{lock:true});
        invariant(placement?.boardId===board.id,'VISUAL_RAIL_PLACEMENT_NOT_FOUND','Visual Rail placement not found',{placementId});
        invariant(!placement.locked,'VISUAL_RAIL_PLACEMENT_LOCKED','Locked garment cannot be removed',{placementId});
        const all=await tx.listPlacements(board.id,{lock:true});
        await tx.deletePlacement(board.id,placementId);
        const layout=all.filter((item)=>item.id!==placementId).map((item)=>item);
        const sourceItems=layout.filter((item)=>item.railId===placement.railId).sort(byPosition)
          .map((item,index)=>relocateVisualRailPlacement(item,{railId:item.railId,position:index+1}));
        const sourceIds=new Set(sourceItems.map((item)=>item.id));
        const normalized=layout.filter((item)=>!sourceIds.has(item.id)).concat(sourceItems);
        if(normalized.length) await tx.replacePlacementLayout(board.id,normalized);
        const nextBoard=await revise(tx,board,actorId);
        await append(tx,'visual-rail.placement.removed.v1',board.id,{boardId:board.id,placementId,version:nextBoard.version},commandId,actorId);
        return Object.freeze({board:nextBoard,removedPlacementId:placementId});
      });
    },

    async previewArrangement(actorId,boardId,railId,strategy) {
      return store.transaction(async (tx)=>{
        const board=await tx.getBoard(boardId,{lock:false});
        invariant(board,'VISUAL_RAIL_BOARD_NOT_FOUND','Visual Rail board not found',{boardId});
        await requireRead(tx,board,actorId);
        const rail=await tx.getRail(railId,{lock:false});
        invariant(rail?.boardId===board.id,'VISUAL_RAIL_NOT_FOUND','Visual Rail not found',{railId});
        const placements=(await tx.listPlacements(board.id,{lock:false})).filter((item)=>item.railId===rail.id);
        return previewVisualRailArrangement(placements,strategy);
      });
    },

    applyArrangement(commandId,actorId,boardId,railId,input) {
      const fingerprint=`visualRail.applyArrangement:${actorId}:${boardId}:${railId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const board=await loadManaged(tx,boardId,actorId,input?.expectedVersion);
        const rail=await tx.getRail(railId,{lock:true});
        invariant(rail?.boardId===board.id,'VISUAL_RAIL_NOT_FOUND','Visual Rail not found',{railId});
        const all=await tx.listPlacements(board.id,{lock:true});
        const onRail=all.filter((item)=>item.railId===rail.id);
        const preview=previewVisualRailArrangement(onRail,input?.strategy);
        const byId=new Map(onRail.map((item)=>[item.id,item]));
        const ordered=preview.placementIds.map((id)=>byId.get(id));
        const arranged=ordered.map((item,index)=>relocateVisualRailPlacement(item,{railId:rail.id,position:index+1}));
        const ids=new Set(arranged.map((item)=>item.id));
        const layout=all.filter((item)=>!ids.has(item.id)).concat(arranged);
        await tx.replacePlacementLayout(board.id,layout);
        const nextBoard=await revise(tx,board,actorId);
        await append(tx,'visual-rail.arrangement.applied.v1',board.id,{
          boardId:board.id,railId,strategy:input?.strategy,placementIds:preview.placementIds,version:nextBoard.version,
        },commandId,actorId);
        return Object.freeze({board:nextBoard,preview});
      });
    },

    publish(commandId,actorId,boardId,input) {
      const fingerprint=`visualRail.publish:${actorId}:${boardId}:${canonicalJson(input??null)}`;
      return execute(commandId,actorId,fingerprint,async (tx)=>{
        const board=await loadManaged(tx,boardId,actorId,input?.expectedVersion);
        const rails=await tx.listRails(board.id,{lock:true});
        const placements=await tx.listPlacements(board.id,{lock:true});
        invariant(rails.length>0,'VISUAL_RAIL_EMPTY','Visual Rail board needs at least one rail');
        invariant(placements.length>0,'VISUAL_RAIL_EMPTY','Visual Rail board needs at least one garment');
        for(const rail of rails) assertVisualRailCapacity(rail,placements.filter((item)=>item.railId===rail.id));
        const publishedBoard=reviseVisualRailBoard(board,{updatedBy:actorId,updatedAt:clock(),status:'published'});
        const snapshot=buildVisualRailSnapshot({
          id:nextId('visual-rail-snapshot'),board:publishedBoard,rails,placements,
          commercialMetrics:input?.commercialMetrics??{},publishedBy:actorId,publishedAt:clock(),
        });
        await tx.insertSnapshot(snapshot);
        await tx.saveBoard(publishedBoard,board.version);
        await append(tx,'visual-rail.board.published.v1',board.id,{
          boardId:board.id,boardVersion:publishedBoard.version,snapshotId:snapshot.id,contentHash:snapshot.contentHash,
        },commandId,actorId);
        return Object.freeze({board:publishedBoard,snapshot});
      });
    },

    async getForActor(actorId,boardId) {
      return store.transaction(async (tx)=>{
        const board=await tx.getBoard(boardId,{lock:false});
        invariant(board,'VISUAL_RAIL_BOARD_NOT_FOUND','Visual Rail board not found',{boardId});
        await requireRead(tx,board,actorId);
        const rails=await tx.listRails(board.id,{lock:false});
        const placements=await tx.listPlacements(board.id,{lock:false});
        const capacities=Object.freeze(Object.fromEntries(rails.map((rail)=>[
          rail.id,assertVisualRailCapacity(rail,placements.filter((item)=>item.railId===rail.id)),
        ])));
        return Object.freeze({board,rails:Object.freeze(rails),placements:Object.freeze(placements),capacities,latestSnapshot:await tx.latestSnapshot(board.id)});
      });
    },

    async listForSource(actorId,sourceType,sourceId) {
      return store.transaction(async (tx)=>{
        const source=await tx.getSource(sourceType,sourceId,{lock:false});
        invariant(source,'VISUAL_RAIL_SOURCE_NOT_FOUND','Visual Rail source not found',{sourceType,sourceId});
        const pseudo={id:'source-access',ownerOrganisationId:source.ownerOrganisationId,source:{type:source.type,id:source.id}};
        await requireRead(tx,pseudo,actorId);
        return Object.freeze(await tx.listBoardsBySource(sourceType,sourceId));
      });
    },
  });
}

function sourceSnapshot(product) {
  const buyer=product.buyerLine??null;
  return Object.freeze({
    productRef:product.productRef,
    brandId:product.brandId,
    skuCode:product.skuCode,
    styleVersionId:product.styleVersionId,
    styleVersionContentHash:product.styleVersionContentHash,
    colorwayId:product.colorwayId,
    colorwayContentHash:product.colorwayContentHash,
    displayName:product.displayName,
    category:product.category,
    colorName:product.colorName,
    colorHex:product.colorHex,
    commercialTerms:Object.freeze({
      currency:buyer?.currency??product.currency??null,
      unitPrice:buyer?.unitPrice??product.wholesalePrice??null,
      wholesalePriceMinor:buyer?.wholesalePriceMinor??null,
      minimumOrderQuantity:buyer?.minimumOrderQuantity??product.minimumOrderQuantity??null,
      availability:buyer?.availability??null,
      availableQuantity:product.availableQuantity??null,
      reservedQuantity:product.reservedQuantity??null,
      deliveryStart:buyer?.deliveryStart??null,
      deliveryEnd:buyer?.deliveryEnd??null,
      rrpMinor:buyer?.rrpMinor??null,
    }),
  });
}

function visualProfile(product) {
  const media=Array.isArray(product.media)?product.media:[];
  const image=(predicate)=>media.find((item)=>item.type==='image'&&predicate(item))?.uri??null;
  const view=(item)=>String(item.payload?.view??item.payload?.drawingView??'').toLowerCase();
  const front=image((item)=>view(item)==='front')??image((item)=>item.role==='hero')??image((item)=>item.role==='gallery')??image(()=>true);
  const back=image((item)=>view(item)==='back');
  const side=image((item)=>['side','left','right'].includes(view(item)));
  const detail=image((item)=>item.role==='detail');
  const video=media.find((item)=>item.type==='video')?.uri??null;
  return Object.freeze({
    displayName:product.displayName??null,
    category:product.category??null,
    colorName:product.colorName??null,
    colorHex:product.colorHex??null,
    colorSource:product.colorHex?'canonical':null,
    styleVersionId:product.styleVersionId??null,
    colorwayId:product.colorwayId??null,
    assets:Object.freeze({front,back,side,detail,video,spin:null,model3d:null}),
  });
}

function normalizeInsertPosition(value,max) {
  if(value===undefined||value===null) return max;
  invariant(Number.isSafeInteger(value)&&value>=1&&value<=max,'VISUAL_RAIL_PLACEMENT_POSITION_INVALID','Placement position is outside the rail',{position:value,max});
  return value;
}
function byPosition(a,b){return a.position-b.position||String(a.id).localeCompare(String(b.id));}
function defaultIdGenerator(){let sequence=0;return(prefix)=>`${prefix}_${++sequence}`;}
