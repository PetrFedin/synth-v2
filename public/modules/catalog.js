const catalogBulkSelection = window.catalogBulkSelection || (window.catalogBulkSelection = new Set());

function renderCatalog() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCampaign = caps.hasAny(state.workspace, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand');
  const canCollection = caps.hasAny(state.workspace, caps.CAPABILITIES.COLLECTION_MANAGE, 'brand') && state.workspace.campaigns.some(item => item.status !== 'closed' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.COLLECTION_MANAGE));
  const canCatalog = caps.hasAny(state.workspace, caps.CAPABILITIES.CATALOG_MANAGE, 'brand') && state.workspace.collections.some(item => caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE));
  box.append(toolbar('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438, \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u0438 SKU', canCampaign ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e' : undefined, canCampaign ? campaignForm : undefined));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard(
      '\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438',
      state.workspace.campaigns.length ? state.workspace.campaigns.map(campaignEntity) : [empty('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
      undefined,
      undefined,
      'campaigns',
    ),
    sectionCard(
      '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438',
      state.workspace.collections.length ? state.workspace.collections.map(collectionEntity) : [empty('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
      canCollection ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e' : undefined,
      canCollection ? collectionForm : undefined,
      'collections',
    ),
  );
  box.append(grid);
  const skus = state.workspace.catalogSkus || [];
  const manageableDrafts = skus.filter(canManageCatalogSku);
  for (const sku of [...catalogBulkSelection]) {
    if (!manageableDrafts.some(item => item.sku === sku)) catalogBulkSelection.delete(sku);
  }
  if (manageableDrafts.length) box.append(catalogBulkToolbar(manageableDrafts));
  box.append(sectionCard(
    'SKU',
    skus.length ? skus.map(catalogSkuEntity) : [empty('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 SKU \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
    canCatalog ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU' : undefined,
    canCatalog ? catalogSkuForm : undefined,
    'catalogSkus',
  ));
  return box;
}

function catalogSkuEntity(item) {
  const caps = window.SynthaUiCapabilities;
  const collection = state.workspace.collections.find(candidate => candidate.id === item.collectionId);
  const canManageDraft = item.status === 'draft'
    && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE);
  const actions = [];
  if (canManageDraft) actions.push(catalogBulkSelectionButton(item), catalogEditActionButton(item));
  if (canManageDraft && collection?.status === 'published') {
    actions.push(actionButton('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', () => mutate(
      `/v2/catalog/skus/${encodeURIComponent(item.sku)}/publish`,
      { expectedVersion: item.version },
    ), 'primary'));
  }
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

function canManageCatalogSku(item) {
  const caps = window.SynthaUiCapabilities;
  return item.status === 'draft'
    && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE);
}

function catalogBulkSelectionButton(item) {
  const selected = catalogBulkSelection.has(item.sku);
  const button = el('button', {
    className: `button small ${selected ? 'secondary' : ''}`.trim(),
    type: 'button',
    ariaPressed: selected,
    rawText: selected ? localText('\u0412\u044b\u0431\u0440\u0430\u043d\u043e','Selected') : localText('\u0412\u044b\u0431\u0440\u0430\u0442\u044c','Select'),
  });
  button.addEventListener('click', () => {
    if (catalogBulkSelection.has(item.sku)) catalogBulkSelection.delete(item.sku);
    else catalogBulkSelection.add(item.sku);
    renderApp();
  });
  return button;
}

function catalogBulkToolbar(items) {
  const selected = items.filter(item => catalogBulkSelection.has(item.sku));
  const card = el('section', { className: 'card form-card', ariaLabel: localText('\u041c\u0430\u0441\u0441\u043e\u0432\u044b\u0435 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430','Catalog bulk operations') });
  card.append(el('strong', { rawText: localText(`\u0412\u044b\u0431\u0440\u0430\u043d\u043e SKU: ${selected.length}`, `Selected SKUs: ${selected.length}`) }));
  const actions = el('div', { className: 'entity-actions' });
  if (!selected.length) {
    actions.append(el('span', { className: 'muted', rawText: localText('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438 \u0434\u043b\u044f \u0430\u0442\u043e\u043c\u0430\u0440\u043d\u043e\u0439 \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438.','Select drafts for atomic publication.') }));
    card.append(actions);
    return card;
  }
  actions.append(actionButton(localText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0435','Publish selected'), async () => {
    const current = await Promise.all(selected.map(item => api(`/v2/catalog/skus/${encodeURIComponent(item.sku)}`)));
    const operations = current.map(item => {
      if (item.status !== 'draft') throw new Error(localText(`SKU ${item.sku} \u0443\u0436\u0435 \u043d\u0435 \u044f\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u043e\u043c.`, `SKU ${item.sku} is no longer a draft.`));
      return { type: 'publish', sku: item.sku, expectedVersion: item.version };
    });
    await mutate('/v2/catalog/skus/bulk', { operations });
    catalogBulkSelection.clear();
  }, 'primary', localText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c \u0432\u0441\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0435 SKU \u0430\u0442\u043e\u043c\u0430\u0440\u043d\u043e?','Publish all selected SKUs atomically?')));
  const clearSelection = el('button', { className: 'button small', type: 'button', rawText: localText('\u0421\u043d\u044f\u0442\u044c \u0432\u044b\u0431\u043e\u0440','Clear selection') });
  clearSelection.addEventListener('click', () => { catalogBulkSelection.clear(); renderApp(); });
  actions.append(clearSelection);
  card.append(actions);
  return card;
}


function catalogEditActionButton(item) {
  const button = el('button', { className: 'button small', text: '\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c', type: 'button' });
  button.addEventListener('click', () => runAction(() => catalogSkuEditForm(item), button));
  return button;
}
