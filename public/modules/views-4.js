function cycleEntity(item) {
  const index = STAGES.indexOf(item.stage);
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const canAdvance = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE);
  const canConfirm = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_CONFIRM);
  if (canAdvance && index >= 0 && index < STAGES.indexOf('showroom')) actions.push(actionButton(`Перейти: ${stageLabel(STAGES[index+1])}`, () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/advance`, { targetStage: STAGES[index+1] })));
  if (canConfirm && item.stage === 'confirmation') actions.push(actionButton('Открыть DealSpace', () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/confirm`, {}), 'primary'));
  const wrapper = entity(`${orgName(item.brandId)} → ${orgName(item.shopId)}`, item.stage, [`Кампания: ${nameById('campaigns',item.campaignId)}`, `Коллекция: ${nameById('collections',item.collectionId)}`, item.id], actions);
  const pipeline = el('div', { className: 'pipeline' });
  STAGES.forEach((stage, position) => pipeline.append(el('div', { className: `pipeline-step ${position < index ? 'done' : position === index ? 'current' : ''}`, text: stageLabel(stage) })));
  wrapper.append(pipeline); return wrapper;
}
function selectionEntity(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const canWrite = caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SELECTION_WRITE);
  const lines = Array.isArray(item.lines) ? item.lines : [];
  if (item.status === 'draft' && canWrite) {
    actions.push(formActionButton('Добавить SKU', () => selectionLineForm(item)));
    if (lines.length > 0) actions.push(actionButton('Отправить', () => mutate(`/v2/selections/${encodeURIComponent(item.id)}/submit`, {}), 'primary'));
  }
  const lineSummary = lines.map(line => `${line.sku}: ${line.quantity} × ${money(line.unitPrice)}`).join(' · ') || 'Строк нет';
  return entity(item.id, item.status, [`Шоурум: ${nameById('showrooms',item.showroomId)}`, lineSummary], actions);
}
function orderEntity(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const accepted = new Set(item.acceptedOrganisationIds || []);
  for (const orgId of ownIds().filter(id => [item.brandId,item.shopId].includes(id))) {
    if (!accepted.has(orgId) && ['draft','ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, orgId, caps.CAPABILITIES.ORDER_CONFIRM)) {
      actions.push(actionButton(`Согласовать: ${orgName(orgId)}`, () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { organisationId: orgId })));
    }
  }
  const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);
  if (item.status === 'ready' && canWrite) actions.push(actionButton('Прикрепить к циклу', () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, {}), 'primary'));
  if (item.status === 'attached' && canWrite) actions.push(actionButton('Отменить заказ', () => orderCancellationForm(item)));
  const details = [
    `${money(item.totalAmount)} ${item.currency}`,
    `${item.terms?.incoterm || ''}, оплата ${item.terms?.paymentDays ?? 0} дн.`,
    `Согласовано: ${(item.acceptedOrganisationIds || []).map(orgName).join(', ') || 'нет'}`,
  ];
  if (item.status === 'cancelled') details.push(`Причина: ${item.cancellationReason}`, `Отменён: ${formatDate(item.cancelledAt)}`);
  return entity(item.id, item.status, details, actions);
}
function dealEntity(item) { return entity(item.id, item.status, [`Заказ: ${item.orderId}`, pairName(item.brandId,item.shopId), money(item.totalAmount)], []); }
function calendarEntity(item) { return entity(item.title || item.type, item.visibility || item.type, [formatDate(item.startsAt), `Организация: ${orgName(item.ownerOrganisationId)}`], []); }
function notificationEntity(item) {
  const actions = item.status !== 'read' ? [notificationReadButton(item)] : [];
  return entity(item.title || item.type, item.status, [item.body || item.message || item.type, formatDate(item.createdAt)], actions);
}
function notificationReadButton(item) {
  const button = el('button', { className: 'button small', text: 'Прочитано', type: 'button' });
  button.addEventListener('click', () => runAction(async () => {
    const updated = await mutate(`/v2/notifications/${encodeURIComponent(item.id)}/read`, {});
    window.SynthaNotificationController.applyUpdated(updated);
    toast(I18N.t('common.operationComplete'), 'success');
  }, button));
  return button;
}
function formActionButton(label, fn) {
  const button = el('button', { className: 'button small', text: label, type: 'button' });
  button.addEventListener('click', () => runAction(() => fn(), button));
  return button;
}
