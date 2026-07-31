function catalogSkuForm() {
  const brandIds = new Set(ownOrganisations('brand').map(item => item.id));
  const collections = state.workspace.collections.filter(item => brandIds.has(item.brandId));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU', [
    selectDef('collectionId','\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f',collections),
    textDef('sku','SKU'),
    textDef('name','\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435'),
    numberDef('wholesalePrice','Wholesale price',0,false),
    numberDef('minimumOrderQuantity','MOQ',1,true),
    numberDef('availableQuantity','Sellable quantity',0,true),
  ], values => {
    const collection = collections.find(item => item.id === values.collectionId);
    return mutate('/v2/catalog/skus', {
      ...values,
      sku: values.sku.trim().toUpperCase(),
      brandId: collection.brandId,
      currency: collection.currency,
    });
  });
}
