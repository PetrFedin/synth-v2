function renderCatalog() {
  const box = el('div');
  box.append(toolbar('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438, \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u0438 SKU', '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', campaignForm));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', state.workspace.campaigns.length ? state.workspace.campaigns.map(campaignEntity) : [empty('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')]),
    sectionCard('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', state.workspace.collections.length ? state.workspace.collections.map(collectionEntity) : [empty('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')], '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e', collectionForm),
  );
  box.append(grid);
  const skus = state.workspace.catalogSkus || [];
  const canCreate = ownOrganisations('brand').length > 0;
  box.append(sectionCard(
    'SKU',
    skus.length ? skus.map(catalogSkuEntity) : [empty('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 SKU \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
    canCreate ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU' : undefined,
    canCreate ? catalogSkuForm : undefined,
  ));
  return box;
}

function catalogSkuEntity(item) {
  const ownBrand = ownOrganisations('brand').some(org => org.id === item.brandId);
  const actions = ownBrand && item.status === 'draft'
    ? [actionButton('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', () => mutate(`/v2/catalog/skus/${encodeURIComponent(item.sku)}/publish`, {}), 'primary')]
    : [];
  const ats = Number.isInteger(item.availableToSell)
    ? item.availableToSell
    : Math.max(0, Number(item.availableQuantity || 0) - Number(item.reservedQuantity || 0));
  return entity(item.name, item.status, [
    item.sku,
    `${money(item.wholesalePrice)} ${item.currency}`,
    `MOQ: ${item.minimumOrderQuantity || 1}`,
    `ATS: ${ats} / ${item.availableQuantity || 0}`,
    `\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: ${nameById('collections', item.collectionId)}`,
    `v${item.version}`,
  ], actions);
}
