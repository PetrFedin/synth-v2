export async function loadPostgresVisibilityScope(queryable, actorId) {
  const membershipResult = await queryable.query(
    `SELECT organisation_id, payload->>'organisationType' AS organisation_type
       FROM memberships
      WHERE user_id = $1 AND status = $2
      ORDER BY organisation_id ASC`,
    [actorId, 'active'],
  );
  const ownIds = unique(membershipResult.rows.map((row) => row.organisation_id));
  const brandIds = unique(membershipResult.rows.filter((row) => row.organisation_type === 'brand').map((row) => row.organisation_id));
  if (!ownIds.length) return emptyPostgresVisibilityScope();

  const [relationshipResult, cycleResult, invitationResult, selectionResult] = await Promise.all([
    queryable.query(
      'SELECT brand_id, shop_id FROM counterparty_relationships WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
    queryable.query(
      'SELECT campaign_id, collection_id FROM commercial_cycles WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
    queryable.query(
      'SELECT showroom_id FROM showroom_invitations WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
    queryable.query(
      'SELECT showroom_id FROM selections WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
  ]);
  const relationshipOrganisationIds = relationshipResult.rows.flatMap((row) => [row.brand_id, row.shop_id]);
  const campaignIds = unique(cycleResult.rows.map((row) => row.campaign_id));
  const collectionIds = unique(cycleResult.rows.map((row) => row.collection_id));
  const linkedShowroomIds = unique([
    ...invitationResult.rows.map((row) => row.showroom_id),
    ...selectionResult.rows.map((row) => row.showroom_id),
  ]);
  const showroomResult = linkedShowroomIds.length || brandIds.length
    ? await queryable.query(
      'SELECT id, collection_id FROM showrooms WHERE id = ANY($1::text[]) OR brand_id = ANY($2::text[])',
      [linkedShowroomIds, brandIds],
    )
    : { rows: [] };
  const showroomIds = unique([...linkedShowroomIds, ...showroomResult.rows.map((row) => row.id)]);
  const visibleCollectionIds = unique([...collectionIds, ...showroomResult.rows.map((row) => row.collection_id)]);
  return Object.freeze({
    ownIds: Object.freeze(ownIds),
    brandIds: Object.freeze(brandIds),
    visibleOrganisationIds: Object.freeze(unique([...ownIds, ...relationshipOrganisationIds])),
    campaignIds: Object.freeze(campaignIds),
    collectionIds: Object.freeze(collectionIds),
    showroomIds: Object.freeze(showroomIds),
    visibleCollectionIds: Object.freeze(visibleCollectionIds),
  });
}

export function emptyPostgresVisibilityScope() {
  return Object.freeze({
    ownIds: Object.freeze([]),
    brandIds: Object.freeze([]),
    visibleOrganisationIds: Object.freeze([]),
    campaignIds: Object.freeze([]),
    collectionIds: Object.freeze([]),
    showroomIds: Object.freeze([]),
    visibleCollectionIds: Object.freeze([]),
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
