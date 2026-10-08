import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{ pool?: any }} [options] */
export function createPostgresVisualRailStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction(work) { return withPostgresTransaction(pool, work, { createView: transactionView }); } });
}

function transactionView(client) {
  return Object.freeze({
    getMembership: async (organisationId,userId) => {
      const result=await client.query(
        'SELECT payload FROM memberships WHERE organisation_id=$1 AND user_id=$2 FOR SHARE',
        [organisationId,userId],
      );
      return result.rows[0]?.payload;
    },

    getSource: async (type,id,{lock=false}={}) => {
      if(type==='showroom') {
        const result=await client.query(
          `SELECT id,brand_id,collection_id,status,version,payload
             FROM showrooms WHERE id=$1${lock?' FOR SHARE':''}`,
          [id],
        );
        const row=result.rows[0];
        if(!row) return undefined;
        return Object.freeze({
          type:'showroom',id:row.id,ownerOrganisationId:row.brand_id,
          collectionId:row.collection_id,status:row.status,version:row.version,contentHash:null,payload:row.payload,
        });
      }
      if(type==='buyer-catalog-version') {
        const result=await client.query(
          `SELECT id,publication_id,price_list_version_id,brand_id,shop_id,showroom_id,currency,published_at,content_hash,payload
             FROM buyer_catalog_versions WHERE id=$1${lock?' FOR SHARE':''}`,
          [id],
        );
        const row=result.rows[0];
        if(!row) return undefined;
        return Object.freeze({
          type:'buyer-catalog-version',id:row.id,ownerOrganisationId:row.shop_id,
          brandId:row.brand_id,shopId:row.shop_id,showroomId:row.showroom_id,currency:row.currency,
          publishedAt:timestamp(row.published_at),status:'published',version:null,contentHash:row.content_hash,payload:row.payload,
        });
      }
      return undefined;
    },

    actorHasShowroomAccess: async (showroomId,actorId) => {
      const result=await client.query(
        `SELECT 1
           FROM showroom_invitations invitation
           JOIN memberships membership
             ON membership.organisation_id=invitation.shop_id
            AND membership.user_id=$2
            AND membership.status='active'
          WHERE invitation.showroom_id=$1
            AND invitation.status='accepted'
            AND invitation.expires_at>CURRENT_TIMESTAMP
          LIMIT 1`,
        [showroomId,actorId],
      );
      return result.rowCount>0;
    },

    getBoard: async (id,{lock=false}={}) => {
      const result=await client.query(`SELECT payload FROM visual_rail_boards WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);
      return result.rows[0]?.payload;
    },
    listBoardsBySource: async (sourceType,sourceId) => {
      const result=await client.query(
        'SELECT payload FROM visual_rail_boards WHERE source_type=$1 AND source_id=$2 ORDER BY updated_at DESC,id',
        [sourceType,sourceId],
      );
      return result.rows.map((row)=>row.payload);
    },
    insertBoard: async (board) => {
      await client.query(
        `INSERT INTO visual_rail_boards
          (id,owner_organisation_id,mode,source_type,source_id,source_version,source_content_hash,title,status,version,created_by,created_at,updated_by,updated_at,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
        [board.id,board.ownerOrganisationId,board.mode,board.source.type,board.source.id,board.source.version,board.source.contentHash,
          board.title,board.status,board.version,board.createdBy,board.createdAt,board.updatedBy,board.updatedAt,JSON.stringify(board)],
      );
    },
    saveBoard: async (board,expectedVersion) => {
      const result=await client.query(
        `UPDATE visual_rail_boards SET title=$2,status=$3,version=$4,updated_by=$5,updated_at=$6,payload=$7::jsonb
          WHERE id=$1 AND version=$8`,
        [board.id,board.title,board.status,board.version,board.updatedBy,board.updatedAt,JSON.stringify(board),expectedVersion],
      );
      invariant(result.rowCount===1,'VISUAL_RAIL_CONCURRENCY_CONFLICT','Visual Rail board version conflict',{boardId:board.id,expectedVersion});
    },

    getRail: async (id,{lock=false}={}) => {
      const result=await client.query(`SELECT payload FROM visual_rails WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);
      return result.rows[0]?.payload;
    },
    listRails: async (boardId,{lock=false}={}) => {
      const result=await client.query(
        `SELECT payload FROM visual_rails WHERE board_id=$1 ORDER BY position,id${lock?' FOR UPDATE':''}`,
        [boardId],
      );
      return result.rows.map((row)=>row.payload);
    },
    insertRail: async (rail) => {
      await client.query(
        `INSERT INTO visual_rails
          (id,board_id,position,label,capacity_mode,capacity_count,physical_length_cm,density_profile,version,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [rail.id,rail.boardId,rail.position,rail.label,rail.capacityMode,rail.capacityCount,rail.physicalLengthCm,rail.densityProfile,rail.version,JSON.stringify(rail)],
      );
    },
    saveRail: async (rail,expectedVersion) => {
      const result=await client.query(
        `UPDATE visual_rails
            SET label=$2,capacity_mode=$3,capacity_count=$4,physical_length_cm=$5,density_profile=$6,version=$7,payload=$8::jsonb
          WHERE id=$1 AND version=$9`,
        [rail.id,rail.label,rail.capacityMode,rail.capacityCount,rail.physicalLengthCm,rail.densityProfile,rail.version,JSON.stringify(rail),expectedVersion],
      );
      invariant(result.rowCount===1,'VISUAL_RAIL_CONCURRENCY_CONFLICT','Visual Rail version conflict',{railId:rail.id,expectedVersion});
    },

    getPlacement: async (id,{lock=false}={}) => {
      const result=await client.query(`SELECT payload FROM visual_rail_placements WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);
      return result.rows[0]?.payload;
    },
    listPlacements: async (boardId,{lock=false}={}) => {
      const result=await client.query(
        `SELECT payload FROM visual_rail_placements WHERE board_id=$1 ORDER BY rail_id,position,id${lock?' FOR UPDATE':''}`,
        [boardId],
      );
      return result.rows.map((row)=>row.payload);
    },
    insertPlacement: async (placement) => {
      await client.query(
        `INSERT INTO visual_rail_placements
          (id,board_id,rail_id,position,product_ref_type,product_ref_id,product_ref_version,product_ref_content_hash,
           style_version_id,colorway_id,look_group_id,locked,estimated_width_cm,source_snapshot,visual_profile,created_by,created_at,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18::jsonb)`,
        [placement.id,placement.boardId,placement.railId,placement.position,placement.productRef.type,placement.productRef.id,
          placement.productRef.version,placement.productRef.contentHash,placement.styleVersionId,placement.colorwayId,placement.lookGroupId,
          placement.locked,placement.estimatedWidthCm,JSON.stringify(placement.sourceSnapshot),JSON.stringify(placement.visualProfile),
          placement.createdBy,placement.createdAt,JSON.stringify(placement)],
      );
    },
    replacePlacementLayout: async (boardId,placements) => {
      await client.query('SET CONSTRAINTS visual_rail_placements_position_unique DEFERRED');
      for(const placement of placements) {
        const result=await client.query(
          `UPDATE visual_rail_placements SET rail_id=$2,position=$3,look_group_id=$4,locked=$5,estimated_width_cm=$6,payload=$7::jsonb
            WHERE id=$1 AND board_id=$8`,
          [placement.id,placement.railId,placement.position,placement.lookGroupId,placement.locked,placement.estimatedWidthCm,JSON.stringify(placement),boardId],
        );
        invariant(result.rowCount===1,'VISUAL_RAIL_PLACEMENT_NOT_FOUND','Visual Rail placement not found',{placementId:placement.id});
      }
    },
    deletePlacement: async (boardId,placementId) => {
      const result=await client.query('DELETE FROM visual_rail_placements WHERE id=$1 AND board_id=$2',[placementId,boardId]);
      invariant(result.rowCount===1,'VISUAL_RAIL_PLACEMENT_NOT_FOUND','Visual Rail placement not found',{placementId});
    },

    insertSnapshot: async (snapshot) => {
      await client.query(
        `INSERT INTO visual_rail_snapshots
          (id,board_id,board_version,content_hash,snapshot,source_lineage,commercial_metrics,published_by,published_at)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)`,
        [snapshot.id,snapshot.boardId,snapshot.boardVersion,snapshot.contentHash,JSON.stringify(snapshot.snapshot),
          JSON.stringify(snapshot.sourceLineage),JSON.stringify(snapshot.commercialMetrics),snapshot.publishedBy,snapshot.publishedAt],
      );
    },
    latestSnapshot: async (boardId) => {
      const result=await client.query(
        'SELECT id,board_id,board_version,content_hash,snapshot,source_lineage,commercial_metrics,published_by,published_at FROM visual_rail_snapshots WHERE board_id=$1 ORDER BY board_version DESC LIMIT 1',
        [boardId],
      );
      const row=result.rows[0];
      if(!row) return undefined;
      return Object.freeze({
        id:row.id,boardId:row.board_id,boardVersion:row.board_version,contentHash:row.content_hash,
        snapshot:row.snapshot,sourceLineage:row.source_lineage,commercialMetrics:row.commercial_metrics,
        publishedBy:row.published_by,publishedAt:timestamp(row.published_at),
      });
    },

    getVisualProduct: async (source,productRef) => {
      if(productRef.type==='catalog-sku') return catalogProduct(client,source,productRef.id);
      if(productRef.type==='product-sku') return canonicalProduct(client,source,productRef.id);
      return undefined;
    },

    getCommand: (id) => getRegisteredCommand(client,'visual-rail',id),
    insertCommand: (value) => insertRegisteredCommand(client,'visual-rail',value),
    appendOutbox: async (event) => {
      await client.query(
        `INSERT INTO outbox_events(id,event_type,aggregate_id,status,event,published_at)
         VALUES($1,$2,$3,'pending',$4::jsonb,NULL)`,
        [event.id,event.type,event.aggregateId,JSON.stringify(event)],
      );
    },
  });
}

async function catalogProduct(client,source,sku) {
  if(source?.type!=='showroom') return undefined;
  const result=await client.query(
    `SELECT c.sku,c.collection_id,c.brand_id,c.status,c.version,c.currency,c.wholesale_price,c.minimum_order_quantity,
            c.available_quantity,c.reserved_quantity,c.payload AS catalog_payload,
            link.product_sku_id,ps.content_hash AS product_sku_content_hash,ps.style_version_id,ps.colorway_id,
            sv.title_ru,sv.title_en,sv.category_entry_id,sv.content_hash AS style_version_content_hash,
            cw.name_ru AS color_name_ru,cw.name_en AS color_name_en,cw.swatch_hex,cw.content_hash AS colorway_content_hash
       FROM catalog_skus c
       LEFT JOIN product_catalog_sku_links link ON link.catalog_sku=c.sku AND link.brand_id=c.brand_id
       LEFT JOIN product_skus ps ON ps.id=link.product_sku_id
       LEFT JOIN product_style_versions sv ON sv.id=ps.style_version_id
       LEFT JOIN product_colorways cw ON cw.id=ps.colorway_id
      WHERE c.sku=$1 AND c.collection_id=$2 AND c.status='published'`,
    [sku,source.collectionId],
  );
  const row=result.rows[0];
  if(!row) return undefined;
  const media=row.style_version_id ? await mediaFor(client,row.style_version_id,row.colorway_id) : [];
  return normalizeProductRow(row,media,{type:'catalog-sku',id:row.sku,version:row.version,contentHash:null});
}

async function canonicalProduct(client,source,productSkuId) {
  if(source?.type!=='buyer-catalog-version') return undefined;
  const line=(Array.isArray(source.payload?.lines)?source.payload.lines:[]).find((item)=>item?.productSkuId===productSkuId);
  if(!line) return undefined;
  const result=await client.query(
    `SELECT ps.id AS product_sku_id,ps.sku_code,ps.brand_id,ps.content_hash AS product_sku_content_hash,ps.style_version_id,ps.colorway_id,
            sv.title_ru,sv.title_en,sv.category_entry_id,sv.content_hash AS style_version_content_hash,
            cw.name_ru AS color_name_ru,cw.name_en AS color_name_en,cw.swatch_hex,cw.content_hash AS colorway_content_hash,
            c.sku,c.currency,c.wholesale_price,c.minimum_order_quantity,c.available_quantity,c.reserved_quantity,c.payload AS catalog_payload
       FROM product_skus ps
       JOIN product_style_versions sv ON sv.id=ps.style_version_id
       JOIN product_colorways cw ON cw.id=ps.colorway_id
       LEFT JOIN product_catalog_sku_links link ON link.product_sku_id=ps.id
       LEFT JOIN catalog_skus c ON c.sku=link.catalog_sku
      WHERE ps.id=$1`,
    [productSkuId],
  );
  const row=result.rows[0];
  if(!row) return undefined;
  const media=await mediaFor(client,row.style_version_id,row.colorway_id);
  return Object.freeze({
    ...normalizeProductRow(row,media,{type:'product-sku',id:row.product_sku_id,version:null,contentHash:row.product_sku_content_hash}),
    buyerLine:line,
  });
}

async function mediaFor(client,styleVersionId,colorwayId) {
  const result=await client.query(
    `SELECT id,media_type,media_role,uri,sort_order,payload
       FROM product_media
      WHERE style_version_id=$1 AND (colorway_id=$2 OR colorway_id IS NULL)
      ORDER BY (colorway_id=$2) DESC,
               CASE media_role WHEN 'hero' THEN 0 WHEN 'gallery' THEN 1 WHEN 'detail' THEN 2 WHEN 'technical' THEN 3 ELSE 4 END,
               sort_order,id`,
    [styleVersionId,colorwayId],
  );
  return result.rows.map((row)=>Object.freeze({
    id:row.id,type:row.media_type,role:row.media_role,uri:row.uri,sortOrder:row.sort_order,payload:row.payload,
  }));
}

function normalizeProductRow(row,media,productRef) {
  return Object.freeze({
    productRef:Object.freeze(productRef),
    brandId:row.brand_id,
    skuCode:row.sku_code ?? row.sku,
    styleVersionId:row.style_version_id ?? null,
    styleVersionContentHash:row.style_version_content_hash ?? null,
    colorwayId:row.colorway_id ?? null,
    colorwayContentHash:row.colorway_content_hash ?? null,
    displayName:row.title_en ?? row.title_ru ?? row.catalog_payload?.name ?? row.sku_code ?? row.sku,
    category:row.category_entry_id ?? null,
    colorName:row.color_name_en ?? row.color_name_ru ?? null,
    colorHex:row.swatch_hex ?? null,
    currency:row.currency ?? null,
    wholesalePrice:row.wholesale_price===null||row.wholesale_price===undefined?null:Number(row.wholesale_price),
    minimumOrderQuantity:row.minimum_order_quantity ?? null,
    availableQuantity:row.available_quantity ?? null,
    reservedQuantity:row.reserved_quantity ?? null,
    media:Object.freeze(media),
  });
}

function timestamp(value){return value?.toISOString?.() ?? value;}
