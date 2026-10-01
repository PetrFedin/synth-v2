function invitationForm(showroom) {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  if (!caps.hasForOrganisation(state.workspace, showroom.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) throw new Error('CAPABILITY_DENIED');
  const activeShops = state.workspace.relationships.filter(x => x.status === 'active' && x.brandId === showroom.brandId).map(x => state.workspace.organisations.find(o => o.id === x.shopId)).filter(Boolean);
  openForm('Пригласить магазин', [
    selectDef('shopId','Магазин',activeShops),
    dateTimeDef('expiresAt','Действует до'),
  ], values => {
    validation.futureDate(values.expiresAt, new Date().toISOString());
    return mutate(`/v2/showrooms/${encodeURIComponent(showroom.id)}/invitations`, { shopId: values.shopId, expiresAt: toIso(values.expiresAt) });
  });
}
function cycleForm() {
  const caps = window.SynthaUiCapabilities;
  const contexts = window.SynthaWorkflowContexts.buildCycleContexts(state.workspace, ownIds()).filter(context => caps.hasForTrade(state.workspace, context.brandId, context.shopId, caps.CAPABILITIES.COMMERCIAL_CYCLE_CREATE));
  openForm('Начать коммерческий цикл', [
    selectDef('contextId','Связь',contexts, context => `${orgName(context.brandId)} → ${orgName(context.shopId)} / ${nameById('campaigns', context.campaignId)} / ${nameById('collections', context.collectionId)}`),
  ], values => {
    const context = contexts.find(item => item.id === values.contextId);
    if (!context) throw new Error(I18N.t('common.requestError'));
    return mutate('/v2/cycles', { brandId: context.brandId, shopId: context.shopId, campaignId: context.campaignId, collectionId: context.collectionId });
  });
}
async function selectionForm() {
  const caps = window.SynthaUiCapabilities;
  const doorUi = window.SynthaRetailDoorUi;
  const contexts = window.SynthaWorkflowContexts.buildSelectionContexts(state.workspace, ownIds(), new Date().toISOString()).filter(context => caps.hasForOrganisation(state.workspace, context.shopId, caps.CAPABILITIES.SELECTION_WRITE));
  // A selection is created against one Retail Door (the server refuses SELECTION_RETAIL_DOOR_REQUIRED without it),
  // so the form asks for it the same way the order form does.
  let doorsByShop;
  try {
    const shopIds = [...new Set(contexts.map(context => context.shopId))];
    const doorEntries = await Promise.all(shopIds.map(async shopId => [shopId, await api(`/v2/shops/${encodeURIComponent(shopId)}/doors`)]));
    doorsByShop = Object.fromEntries(doorEntries.map(([shopId, doors]) => [shopId, Array.isArray(doors) ? doors : []]));
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  openForm('Создать Selection', [
    selectDef('contextId','Цикл',contexts, context => `${orgName(context.brandId)} → ${orgName(context.shopId)} / ${nameById('showrooms', context.showroomId)} / ${nameById('collections', context.collectionId)}`),
    dependentSelectDef(
      'retailDoorId',
      'Торговая точка / Retail Door',
      'contextId',
      contextId => doorUi.activeDoorsForSelection(contexts.find(context => context.id === contextId), doorsByShop),
      door => `${door.code} · ${door.name} · ${door.shipToAddress?.city || '—'}`,
      undefined,
      'Для выбранного магазина нет активной торговой точки. Создайте или активируйте её в «Партнёры → Торговые точки».',
    ),
  ], values => {
    const context = contexts.find(item => item.id === values.contextId);
    if (!context) throw new Error(I18N.t('common.requestError'));
    const door = doorUi.activeDoorsForSelection(context, doorsByShop).find(item => item.id === values.retailDoorId);
    if (!door) throw new Error(I18N.t('common.requestError'));
    return mutate('/v2/selections', { cycleId: context.cycleId, showroomId: context.showroomId, retailDoorId: door.id });
  });
}
async function selectionLineForm(selection) {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  if (!caps.hasForOrganisation(state.workspace, selection.shopId, caps.CAPABILITIES.SELECTION_WRITE)) throw new Error('CAPABILITY_DENIED');
  if (!selection.buyerCatalogVersionId || !selection.commercialBasisHash) throw new Error(I18N.t('common.requestError'));

  const catalog = await api(`/v2/buyer-catalog-versions/${encodeURIComponent(selection.buyerCatalogVersionId)}`);
  if (
    !catalog
    || catalog.id !== selection.buyerCatalogVersionId
    || catalog.contentHash !== selection.commercialBasisHash
    // A selection carries no currency field, only its lines do (one currency per selection). The earlier guard read a
    // field that never exists, so it was always true and adding a SKU never succeeded.
    || (Array.isArray(selection.lines) && selection.lines.some(line => line.currency && line.currency !== catalog.currency))
  ) throw new Error(I18N.t('common.requestError'));

  const catalogLines = (Array.isArray(catalog.lines) ? catalog.lines : []).map(line => Object.freeze({ ...line, id: line.sku }));
  if (!catalogLines.length) throw new Error(I18N.translate('Доступных SKU пока нет.'));

  openForm('Добавить или обновить SKU', [
    selectDef('sku','SKU',catalogLines,line => `${line.sku} · ${money(line.unitPrice, line.currency)} · MOQ ${line.minimumOrderQuantity || 1}`),
    numberDef('quantity','Количество',1,true,1),
  ], values => {
    const line = catalogLines.find(item => item.sku === values.sku || item.id === values.sku);
    if (!line) throw new Error(I18N.t('common.requestError'));
    const quantityLabel = I18N.translate('Количество');
    const quantity = validation.quantity(values.quantity, quantityLabel, { min: Number(line.minimumOrderQuantity || 1) });
    // Кратность упаковки замораживается вместе с ценой, и сервер отвергает количество между упаковками.
    validation.multipleOf(quantity, Number(line.packSize), quantityLabel);
    return mutate(`/v2/selections/${encodeURIComponent(selection.id)}/lines/${encodeURIComponent(line.sku)}`, { selectionId: selection.id, sku: line.sku, quantity }, 'PUT');
  });
}
async function orderForm(preferredSelectionId = '') {
  const caps = window.SynthaUiCapabilities;
  const doorUi = window.SynthaRetailDoorUi;
  const selections = state.workspace.selections.filter(x => x.status === 'submitted' && caps.hasForOrganisation(state.workspace, x.shopId, caps.CAPABILITIES.ORDER_WRITE) && !state.workspace.orders.some(o => o.selectionId === x.id));
  if (!selections.length) {
    toast(I18N.translate('Нет отправленных Selection, доступных для создания заказа.'), 'error');
    return;
  }
  try {
    const selectedSelectionId = selections.some(selection => selection.id === preferredSelectionId) ? preferredSelectionId : '';
    const shopIds = [...new Set(selections.map(selection => selection.shopId))];
    const doorEntries = await Promise.all(shopIds.map(async shopId => [shopId, await api(`/v2/shops/${encodeURIComponent(shopId)}/doors`)]));
    const doorsByShop = Object.fromEntries(doorEntries.map(([shopId, doors]) => [shopId, Array.isArray(doors) ? doors : []]));
    openForm('Создать заказ', [
      selectDef('selectionId', localText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442', 'Selection'), selections, selection => `${orgName(selection.shopId)} \u00b7 ${objectReference(selection.id)}`, selectedSelectionId),
      dependentSelectDef(
        'retailDoorId',
        'Торговая точка / Retail Door',
        'selectionId',
        selectionId => doorUi.activeDoorsForSelection(selections.find(selection => selection.id === selectionId), doorsByShop),
        door => `${door.code} · ${door.name} · ${door.shipToAddress?.city || '—'}`,
        undefined,
        'Для выбранного магазина нет активной торговой точки. Создайте или активируйте её в «Партнёры → Торговые точки».',
      ),
      ...orderTermsFields(),
    ], values => mutate('/v2/orders', doorUi.buildOrderPayload({
      selectionId: values.selectionId,
      retailDoorId: values.retailDoorId,
      terms: validatedOrderTerms(values),
    }, selections, doorsByShop)));
  } catch (error) {
    toast(error.message, 'error');
  }
}

function orderTermsFields(terms = {}) {
  return [
    selectDef('incoterm', 'Incoterm', ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'], undefined, terms.incoterm || 'EXW'),
    numberDef('paymentDays', 'Отсрочка, дней', terms.paymentDays ?? 30, true, 0, 365),
    numberDef('prepaymentPercent', 'Предоплата, %', terms.prepaymentPercent ?? 20, false, 0, 100, 'any'),
    dateDef('deliveryStart', 'Начало поставки', orderDateValue(terms.deliveryStart)),
    dateDef('deliveryEnd', 'Конец поставки', orderDateValue(terms.deliveryEnd)),
  ];
}

function validatedOrderTerms(values) {
  const validation = window.SynthaUiValidation;
  // Домен допускает поставку в один день: начало не позже конца, а не строго раньше.
  validation.dateRange(values.deliveryStart, values.deliveryEnd, '', { allowEqual: true });
  return {
    incoterm: values.incoterm,
    paymentDays: validation.number(values.paymentDays, '\u041e\u0442\u0441\u0440\u043e\u0447\u043a\u0430, \u0434\u043d\u0435\u0439', { integer: true, min: 0, max: 365 }),
    prepaymentPercent: validation.number(values.prepaymentPercent, '\u041f\u0440\u0435\u0434\u043e\u043f\u043b\u0430\u0442\u0430, %', { min: 0, max: 100 }),
    deliveryStart: values.deliveryStart,
    deliveryEnd: values.deliveryEnd,
  };
}

function orderDateValue(value) {
  if (!value) return '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function orderCancellationForm(order) {
  const validation = window.SynthaUiValidation;
  openForm(I18N.t('form.cancelOrder'), [textDef('reason', I18N.t('form.cancellationReason'), '', 1000, true, 3)], values => mutate(`/v2/orders/${encodeURIComponent(order.id)}/cancel`, {
    orderId: order.id,
    expectedVersion: order.version,
    reason: validation.requiredText(values.reason, '\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u043e\u0442\u043c\u0435\u043d\u044b', { minLength: 3, maxLength: 1000 }),
  }));
}

// Закрытие брошенного цикла (O-10): причина обязательна, версия — та, что на экране. Черновик заказа
// закрывается вместе с циклом, прикреплённый заказ сервер не даст закрыть молча.
function cycleCloseForm(cycle) {
  const validation = window.SynthaUiValidation;
  openForm(I18N.t('form.closeCycle'), [textDef('reason', I18N.t('form.closeCycleReason'), '', 1000, true, 3)], values => mutate(`/v2/cycles/${encodeURIComponent(cycle.id)}/close`, {
    expectedVersion: cycle.version,
    reason: validation.requiredText(values.reason, '\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u0437\u0430\u043a\u0440\u044b\u0442\u0438\u044f', { minLength: 3, maxLength: 1000 }),
  }));
}
window.cycleCloseForm = cycleCloseForm;
