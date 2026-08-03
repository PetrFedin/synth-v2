function cycleEntity(item) {
  const index = STAGES.indexOf(item.stage);
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const canAdvance = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE);
  const canConfirm = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_CONFIRM);
  if (canAdvance && index >= 0 && index < STAGES.indexOf('showroom')) actions.push(actionButton(`\u041f\u0435\u0440\u0435\u0439\u0442\u0438: ${stageLabel(STAGES[index+1])}`, () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/advance`, { targetStage: STAGES[index+1] })));
  if (canConfirm && item.stage === 'confirmation') actions.push(actionButton('\u041e\u0442\u043a\u0440\u044b\u0442\u044c DealSpace', () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/confirm`, {}), 'primary'));
  const wrapper = entity(`${orgName(item.brandId)} \u2192 ${orgName(item.shopId)}`, item.stage, [`\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f: ${nameById('campaigns',item.campaignId)}`, `\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: ${nameById('collections',item.collectionId)}`, item.id], actions);
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
    actions.push(actionButton('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c SKU', () => selectionLineForm(item)));
    if (lines.length > 0) actions.push(actionButton('\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c', () => mutate(`/v2/selections/${encodeURIComponent(item.id)}/submit`, {}), 'primary'));
  }
  const lineSummary = lines.map(line => `${line.sku}: ${line.quantity} \u00d7 ${money(line.unitPrice)}`).join(' \u00b7 ') || '\u0421\u0442\u0440\u043e\u043a \u043d\u0435\u0442';
  return entity(item.id, item.status, [`\u0428\u043e\u0443\u0440\u0443\u043c: ${nameById('showrooms',item.showroomId)}`, lineSummary], actions);
}
function orderEntity(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const accepted = new Set(item.acceptedOrganisationIds || []);
  for (const orgId of ownIds().filter(id => [item.brandId,item.shopId].includes(id))) {
    if (!accepted.has(orgId) && ['draft','ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, orgId, caps.CAPABILITIES.ORDER_CONFIRM)) {
      actions.push(actionButton(`\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c: ${orgName(orgId)}`, () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { organisationId: orgId })));
    }
  }
  const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);
  if (item.status === 'ready' && canWrite) actions.push(actionButton('\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0446\u0438\u043a\u043b\u0443', () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, {}), 'primary'));
  if (item.status === 'attached' && canWrite) actions.push(actionButton('\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437', () => orderCancellationForm(item)));
  const details = [
    `${money(item.totalAmount)} ${item.currency}`,
    `${item.terms?.incoterm || ''}, \u043e\u043f\u043b\u0430\u0442\u0430 ${item.terms?.paymentDays ?? 0} \u0434\u043d.`,
    `\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043e: ${(item.acceptedOrganisationIds || []).map(orgName).join(', ') || '\u043d\u0435\u0442'}`,
  ];
  if (item.status === 'cancelled') details.push(`\u041f\u0440\u0438\u0447\u0438\u043d\u0430: ${item.cancellationReason}`, `\u041e\u0442\u043c\u0435\u043d\u0451\u043d: ${formatDate(item.cancelledAt)}`);
  return entity(item.id, item.status, details, actions);
}
function dealEntity(item) { return entity(item.id, item.status, [`\u0417\u0430\u043a\u0430\u0437: ${item.orderId}`, pairName(item.brandId,item.shopId), money(item.totalAmount)], []); }
function calendarEntity(item) { return entity(item.title || item.type, item.visibility || item.type, [formatDate(item.startsAt), `\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f: ${orgName(item.ownerOrganisationId)}`], []); }
function notificationEntity(item) {
  const actions = item.status !== 'read' ? [notificationReadButton(item)] : [];
  return entity(item.title || item.type, item.status, [item.body || item.message || item.type, formatDate(item.createdAt)], actions);
}
function notificationReadButton(item) {
  const button = el('button', { className: 'button small', text: '\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e', type: 'button' });
  button.addEventListener('click', () => runAction(async () => {
    const updated = await mutate(`/v2/notifications/${encodeURIComponent(item.id)}/read`, {});
    window.SynthaNotificationController.applyUpdated(updated);
    toast(I18N.t('common.operationComplete'), 'success');
  }, button));
  return button;
}
