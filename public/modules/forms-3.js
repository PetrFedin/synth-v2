function invitationForm(showroom) {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  if (!caps.hasForOrganisation(state.workspace, showroom.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) throw new Error('CAPABILITY_DENIED');
  const activeShops = state.workspace.relationships.filter(x => x.status === 'active' && x.brandId === showroom.brandId).map(x => state.workspace.organisations.find(o => o.id === x.shopId)).filter(Boolean);
  openForm('\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d', [
    selectDef('shopId','\u041c\u0430\u0433\u0430\u0437\u0438\u043d',activeShops),
    dateTimeDef('expiresAt','\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e'),
  ], values => {
    validation.futureDate(values.expiresAt, new Date().toISOString(), 'Invitation expiry');
    return mutate(`/v2/showrooms/${encodeURIComponent(showroom.id)}/invitations`, { shopId: values.shopId, expiresAt: toIso(values.expiresAt) });
  });
}
function cycleForm() {
  const caps = window.SynthaUiCapabilities;
  const contexts = window.SynthaWorkflowContexts.buildCycleContexts(state.workspace, ownIds()).filter(context => caps.hasForTrade(state.workspace, context.brandId, context.shopId, caps.CAPABILITIES.COMMERCIAL_CYCLE_CREATE));
  openForm('\u041d\u0430\u0447\u0430\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 \u0446\u0438\u043a\u043b', [
    selectDef('contextId','\u0421\u0432\u044f\u0437\u044c',contexts, context => `${orgName(context.brandId)} \u2192 ${orgName(context.shopId)} / ${nameById('campaigns', context.campaignId)} / ${nameById('collections', context.collectionId)}`),
  ], values => {
    const context = contexts.find(item => item.id === values.contextId);
    if (!context) throw new Error(I18N.t('common.requestError'));
    return mutate('/v2/cycles', { brandId: context.brandId, shopId: context.shopId, campaignId: context.campaignId, collectionId: context.collectionId });
  });
}
function selectionForm() {
  const caps = window.SynthaUiCapabilities;
  const contexts = window.SynthaWorkflowContexts.buildSelectionContexts(state.workspace, ownIds(), new Date().toISOString()).filter(context => caps.hasForOrganisation(state.workspace, context.shopId, caps.CAPABILITIES.SELECTION_WRITE));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection', [
    selectDef('contextId','\u0426\u0438\u043a\u043b',contexts, context => `${orgName(context.brandId)} \u2192 ${orgName(context.shopId)} / ${nameById('showrooms', context.showroomId)} / ${nameById('collections', context.collectionId)}`),
  ], values => {
    const context = contexts.find(item => item.id === values.contextId);
    if (!context) throw new Error(I18N.t('common.requestError'));
    return mutate('/v2/selections', { cycleId: context.cycleId, showroomId: context.showroomId });
  });
}
function selectionLineForm(selection) {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  if (!caps.hasForOrganisation(state.workspace, selection.shopId, caps.CAPABILITIES.SELECTION_WRITE)) throw new Error('CAPABILITY_DENIED');
  const skus = (state.workspace.catalogSkus || []).filter(x => x.status === 'published' && x.collectionId === selection.collectionId && Number(x.availableToSell ?? x.availableQuantity ?? 0) >= Number(x.minimumOrderQuantity || 1));
  openForm('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0438\u043b\u0438 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c SKU', [
    selectDef('sku','SKU',skus,x => `${x.sku} \u00b7 ${x.name} \u00b7 ${money(x.wholesalePrice)} ${x.currency} \u00b7 MOQ ${x.minimumOrderQuantity || 1} \u00b7 ATS ${x.availableToSell ?? x.availableQuantity ?? 0}`),
    numberDef('quantity','\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e',1,true,1),
  ], values => {
    const sku = skus.find(item => item.sku === values.sku || item.id === values.sku);
    if (!sku) throw new Error('CATALOG_SKU_NOT_AVAILABLE');
    const quantity = validation.number(values.quantity, 'Quantity', { integer: true, min: Number(sku.minimumOrderQuantity || 1), max: Number(sku.availableToSell ?? sku.availableQuantity ?? 0) });
    return mutate(`/v2/selections/${encodeURIComponent(selection.id)}/lines/${encodeURIComponent(sku.sku)}`, { selectionId: selection.id, sku: sku.sku, quantity }, 'PUT');
  });
}
function orderForm() {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  const selections = state.workspace.selections.filter(x => x.status === 'submitted' && caps.hasForOrganisation(state.workspace, x.shopId, caps.CAPABILITIES.ORDER_WRITE) && !state.workspace.orders.some(o => o.selectionId === x.id));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437', [
    selectDef('selectionId','Selection',selections),
    selectDef('incoterm','Incoterm',['EXW','FCA','FOB','CIF','DAP','DDP']),
    numberDef('paymentDays','\u041e\u0442\u0441\u0440\u043e\u0447\u043a\u0430, \u0434\u043d\u0435\u0439',30,true,0),
    numberDef('prepaymentPercent','\u041f\u0440\u0435\u0434\u043e\u043f\u043b\u0430\u0442\u0430, %',20,false,0),
    dateDef('deliveryStart','\u041d\u0430\u0447\u0430\u043b\u043e \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438'),
    dateDef('deliveryEnd','\u041a\u043e\u043d\u0435\u0446 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438'),
  ], values => {
    validation.dateRange(values.deliveryStart, values.deliveryEnd, 'Delivery dates');
    const paymentDays = validation.number(values.paymentDays, 'Payment days', { integer: true, min: 0, max: 3650 });
    const prepaymentPercent = validation.number(values.prepaymentPercent, 'Prepayment', { min: 0, max: 100 });
    return mutate('/v2/orders', { selectionId: values.selectionId, terms: { incoterm: values.incoterm, paymentDays, prepaymentPercent, deliveryStart: values.deliveryStart, deliveryEnd: values.deliveryEnd } });
  });
}
function orderCancellationForm(order) {
  const validation = window.SynthaUiValidation;
  openForm(I18N.t('form.cancelOrder'), [textDef('reason', I18N.t('form.cancellationReason'),'',500)], values => mutate(`/v2/orders/${encodeURIComponent(order.id)}/cancel`, {
    orderId: order.id,
    reason: validation.requiredText(values.reason, 'Cancellation reason', { minLength: 2, maxLength: 500 }),
  }));
}
