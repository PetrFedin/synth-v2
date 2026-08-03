function invitationForm(showroom) {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  if (!caps.hasForOrganisation(state.workspace, showroom.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) throw new Error('CAPABILITY_DENIED');
  const activeShops = state.workspace.relationships.filter(x => x.status === 'active' && x.brandId === showroom.brandId).map(x => state.workspace.organisations.find(o => o.id === x.shopId)).filter(Boolean);
  openForm('Пригласить магазин', [
    selectDef('shopId','Магазин',activeShops),
    dateTimeDef('expiresAt','Действует до'),
  ], values => {
    validation.futureDate(values.expiresAt, new Date().toISOString(), 'Invitation expiry');
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
function selectionForm() {
  const caps = window.SynthaUiCapabilities;
  const contexts = window.SynthaWorkflowContexts.buildSelectionContexts(state.workspace, ownIds(), new Date().toISOString()).filter(context => caps.hasForOrganisation(state.workspace, context.shopId, caps.CAPABILITIES.SELECTION_WRITE));
  openForm('Создать Selection', [
    selectDef('contextId','Цикл',contexts, context => `${orgName(context.brandId)} → ${orgName(context.shopId)} / ${nameById('showrooms', context.showroomId)} / ${nameById('collections', context.collectionId)}`),
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
  openForm('Добавить или обновить SKU', [
    selectDef('sku','SKU',skus,x => `${x.sku} · ${x.name} · ${money(x.wholesalePrice)} ${x.currency} · MOQ ${x.minimumOrderQuantity || 1} · ATS ${x.availableToSell ?? x.availableQuantity ?? 0}`),
    numberDef('quantity','Количество',1,true,1),
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
  openForm('Создать заказ', [
    selectDef('selectionId','Selection',selections),
    selectDef('incoterm','Incoterm',['EXW','FCA','FOB','CIF','DAP','DDP']),
    numberDef('paymentDays','Отсрочка, дней',30,true,0),
    numberDef('prepaymentPercent','Предоплата, %',20,false,0),
    dateDef('deliveryStart','Начало поставки'),
    dateDef('deliveryEnd','Конец поставки'),
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

function collaborationThreadForm() {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  const owners = ownOrganisations().filter(item => caps.hasForOrganisation(state.workspace, item.id, caps.CAPABILITIES.COLLABORATION_WRITE));
  const subjects = collaborationSubjectOptions();
  openForm(localText('Новая рабочая тема','New collaboration thread'), [
    selectDef('ownerOrganisationId',localText('Организация','Organisation'),owners,item => item.name),
    selectDef('subjectKey',localText('Связанный объект','Linked subject'),subjects,item => item.label),
    textDef('title',localText('Название темы','Thread title'),'',160),
  ], values => {
    const subject = subjects.find(item => item.id === values.subjectKey);
    if (!subject) throw new Error(I18N.t('common.requestError'));
    return mutate('/v2/collaboration/threads', {
      ownerOrganisationId: values.ownerOrganisationId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      title: validation.requiredText(values.title, 'Thread title', { minLength: 2, maxLength: 160 }),
    });
  });
}

function collaborationMessageForm(thread) {
  const validation = window.SynthaUiValidation;
  openForm(localText('Новое сообщение','New message'), [
    textDef('body',localText('Сообщение','Message'),'',5000),
  ], values => mutate(`/v2/collaboration/threads/${encodeURIComponent(thread.id)}/messages`, {
    body: validation.requiredText(values.body, 'Message', { minLength: 1, maxLength: 5000 }),
  }));
}

function calendarEventForm() {
  const validation = window.SynthaUiValidation;
  const caps = window.SynthaUiCapabilities;
  const owners = ownOrganisations().filter(item => caps.hasForOrganisation(state.workspace, item.id, caps.CAPABILITIES.CALENDAR_WRITE));
  const subjects = collaborationSubjectOptions();
  openForm(localText('Добавить событие','Add calendar event'), [
    selectDef('ownerOrganisationId',localText('Организация','Organisation'),owners,item => item.name),
    selectDef('subjectKey',localText('Связанный объект','Linked subject'),subjects,item => item.label),
    selectDef('eventType',localText('Тип события','Event type'),['meeting','shipment','deadline','sample','quality','production','purchase','marketing','other'],calendarEventTypeLabel),
    selectDef('visibility',localText('Видимость','Visibility'),['organisation','trade','private'],value => ({organisation:localText('Организация','Organisation'),trade:localText('Участники сделки','Trade participants'),private:localText('Личное','Private')})[value]),
    textDef('title',localText('Название','Title'),'',200),
    dateTimeDef('startsAt',localText('Начало','Starts at')),
    dateTimeDef('endsAt',localText('Окончание','Ends at')),
    textDef('location',localText('Место или ссылка','Location or link'),localText('Онлайн','Online'),300),
  ], values => {
    validation.dateRange(values.startsAt, values.endsAt, 'Event dates');
    const subject = subjects.find(item => item.id === values.subjectKey);
    if (!subject) throw new Error(I18N.t('common.requestError'));
    const participants = calendarParticipantsForSubject(values.ownerOrganisationId, subject);
    return mutate('/v2/calendar/events', {
      ownerOrganisationId: values.ownerOrganisationId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      eventType: values.eventType,
      visibility: values.visibility,
      title: validation.requiredText(values.title, 'Event title', { minLength: 2, maxLength: 200 }),
      description: '',
      startsAt: toIso(values.startsAt),
      endsAt: toIso(values.endsAt),
      allDay: false,
      location: validation.requiredText(values.location, 'Location', { minLength: 1, maxLength: 300 }),
      participantOrganisationIds: participants,
      reminders: [{ minutesBefore: 1440, channel: 'in_app' }],
    });
  });
}

function collaborationSubjectOptions() {
  const options = [];
  const append = (subjectType, items, label) => items.forEach(item => options.push({
    id: `${subjectType}:${item.id}`,
    subjectType,
    subjectId: item.id,
    item,
    label: `${label}: ${item.name || item.title || item.id}`,
  }));
  append('order', state.workspace.orders || [], localText('Заказ','Order'));
  append('deal', state.workspace.deals || [], 'DealSpace');
  append('selection', state.workspace.selections || [], 'Selection');
  append('showroom', state.workspace.showrooms || [], localText('Шоурум','Showroom'));
  append('collection', state.workspace.collections || [], localText('Коллекция','Collection'));
  append('campaign', state.workspace.campaigns || [], localText('Кампания','Campaign'));
  append('organisation', state.workspace.organisations || [], localText('Организация','Organisation'));
  return options;
}

function calendarParticipantsForSubject(ownerOrganisationId, subject) {
  const values = new Set([ownerOrganisationId]);
  const item = subject.item || {};
  if (item.brandId) values.add(item.brandId);
  if (item.shopId) values.add(item.shopId);
  if (subject.subjectType === 'organisation') values.add(subject.subjectId);
  return [...values];
}
