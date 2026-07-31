function invitationForm(showroom) {
  const activeShops = state.workspace.relationships.filter(x => x.status === 'active' && x.brandId === showroom.brandId).map(x => state.workspace.organisations.find(o => o.id === x.shopId)).filter(Boolean);
  openForm('\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d', [selectDef('shopId','\u041c\u0430\u0433\u0430\u0437\u0438\u043d',activeShops), dateTimeDef('expiresAt','\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e')], values => mutate(`/v2/showrooms/${encodeURIComponent(showroom.id)}/invitations`, { ...values, expiresAt: toIso(values.expiresAt) }));
}
function cycleForm() {
  const active = state.workspace.relationships.filter(x => x.status === 'active');
  const campaigns = state.workspace.campaigns.filter(x => x.status === 'open');
  const collections = state.workspace.collections.filter(x => x.status === 'published');
  openForm('\u041d\u0430\u0447\u0430\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 \u0446\u0438\u043a\u043b', [selectDef('relationship','\u0421\u0432\u044f\u0437\u044c',active, x => `${orgName(x.brandId)} \u2192 ${orgName(x.shopId)}`), selectDef('campaignId','\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f',campaigns), selectDef('collectionId','\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f',collections)], values => {
    const rel = active.find(x => x.id === values.relationship);
    return mutate('/v2/cycles', { brandId: rel.brandId, shopId: rel.shopId, campaignId: values.campaignId, collectionId: values.collectionId });
  });
}
function selectionForm() {
  const cycles = state.workspace.cycles.filter(x => x.stage === 'showroom' && ownIds().includes(x.shopId));
  const showrooms = state.workspace.showrooms.filter(x => x.status === 'open');
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection', [selectDef('cycleId','\u0426\u0438\u043a\u043b',cycles, x => `${orgName(x.brandId)} \u2192 ${orgName(x.shopId)} / ${x.id}`), selectDef('showroomId','\u0428\u043e\u0443\u0440\u0443\u043c',showrooms)], values => mutate('/v2/selections', values));
}
function selectionLineForm(selection) {
  const skus = (state.workspace.catalogSkus || []).filter(x => x.status === 'published' && x.collectionId === selection.collectionId);
  openForm('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0438\u043b\u0438 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c SKU', [
    selectDef('sku','SKU',skus,x => `${x.sku} \u00b7 ${x.name} \u00b7 ${money(x.wholesalePrice)} ${x.currency}`),
    numberDef('quantity','\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e',1,true),
  ], values => mutate(`/v2/selections/${encodeURIComponent(selection.id)}/lines/${encodeURIComponent(values.sku)}`, { selectionId: selection.id, sku: values.sku, quantity: values.quantity }, 'PUT'));
}
function orderForm() {
  const selections = state.workspace.selections.filter(x => x.status === 'submitted' && !state.workspace.orders.some(o => o.selectionId === x.id));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437', [selectDef('selectionId','Selection',selections), selectDef('incoterm','Incoterm',['EXW','FCA','FOB','CIF','DAP','DDP']), numberDef('paymentDays','\u041e\u0442\u0441\u0440\u043e\u0447\u043a\u0430, \u0434\u043d\u0435\u0439',30,true), numberDef('prepaymentPercent','\u041f\u0440\u0435\u0434\u043e\u043f\u043b\u0430\u0442\u0430, %',20,false), dateDef('deliveryStart','\u041d\u0430\u0447\u0430\u043b\u043e \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438'), dateDef('deliveryEnd','\u041a\u043e\u043d\u0435\u0446 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438')], values => mutate('/v2/orders', { selectionId: values.selectionId, terms: { incoterm: values.incoterm, paymentDays: values.paymentDays, prepaymentPercent: values.prepaymentPercent, deliveryStart: values.deliveryStart, deliveryEnd: values.deliveryEnd } }));
}
