function catalogSkuForm() {
  const caps = window.SynthaUiCapabilities;
  const validation = window.SynthaUiValidation;
  const collections = state.workspace.collections.filter(item => caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU', [
    selectDef('collectionId','\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f',collections),
    textDef('sku','SKU','',64),
    textDef('name','\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435','',160),
    numberDef('wholesalePrice','Wholesale price',0.01,false,0.01),
    numberDef('minimumOrderQuantity','MOQ',1,true,1),
    numberDef('availableQuantity','Sellable quantity',0,true,0),
  ], values => {
    const collection = collections.find(item => item.id === values.collectionId);
    if (!collection) throw new Error('COLLECTION_NOT_AVAILABLE');
    return mutate('/v2/catalog/skus', {
      collectionId: collection.id,
      brandId: collection.brandId,
      currency: collection.currency,
      sku: validation.sku(values.sku),
      name: validation.requiredText(values.name, 'SKU name'),
      wholesalePrice: validation.number(values.wholesalePrice, 'Wholesale price', { min: 0.01 }),
      minimumOrderQuantity: validation.number(values.minimumOrderQuantity, 'MOQ', { integer: true, min: 1 }),
      availableQuantity: validation.number(values.availableQuantity, 'Available quantity', { integer: true, min: 0 }),
    });
  });
}

async function catalogSkuEditForm(item) {
  const validation = window.SynthaUiValidation;
  const latest = await api(`/v2/catalog/skus/${encodeURIComponent(item.sku)}`);
  if (latest.status !== 'draft') {
    const error = new Error('CATALOG_SKU_NOT_DRAFT: Only a draft SKU can be edited');
    error.code = 'CATALOG_SKU_NOT_DRAFT';
    throw error;
  }
  openForm('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c SKU', [
    textDef('name', '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', latest.name, 160),
    numberDef('wholesalePrice', 'Wholesale price', latest.wholesalePrice, false, 0.01),
    numberDef('minimumOrderQuantity', 'MOQ', latest.minimumOrderQuantity, true, 1),
    numberDef('availableQuantity', 'Sellable quantity', latest.availableQuantity, true, latest.reservedQuantity || 0),
  ], values => mutate(`/v2/catalog/skus/${encodeURIComponent(latest.sku)}`, {
    expectedVersion: latest.version,
    name: validation.requiredText(values.name, 'SKU name'),
    wholesalePrice: validation.number(values.wholesalePrice, 'Wholesale price', { min: 0.01 }),
    minimumOrderQuantity: validation.number(values.minimumOrderQuantity, 'MOQ', { integer: true, min: 1 }),
    availableQuantity: validation.number(values.availableQuantity, 'Available quantity', { integer: true, min: latest.reservedQuantity || 0 }),
  }, 'PATCH'));
}
