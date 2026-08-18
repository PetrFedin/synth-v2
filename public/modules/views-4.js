function cycleEntity(item) {
  const index = STAGES.indexOf(item.stage);
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const canAdvance = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE);
  const canConfirm = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_CONFIRM);
  if (canAdvance && index >= 0 && index < STAGES.indexOf('showroom')) actions.push(actionButton(`${localText('Перейти', 'Advance')}: ${stageLabel(STAGES[index+1])}`, () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/advance`, { cycleId: item.id, targetStage: STAGES[index+1] })));
  if (canConfirm && item.stage === 'order' && item.order?.status === 'attached' && Number(item.order.totalAmount) > 0) actions.push(actionButton(localText('Открыть DealSpace', 'Open DealSpace'), () => mutate(`/v2/cycles/${encodeURIComponent(item.id)}/confirm`, {}), 'primary'));
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
      actions.push(actionButton(`Согласовать: ${orgName(orgId)}`, () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { orderId: item.id, organisationId: orgId, expectedVersion: item.version })));
    }
  }
  const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);
  const canReadMargin = caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.MARGIN_READ);
  if (item.status === 'ready' && canWrite) actions.push(actionButton('Прикрепить к циклу', () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, { expectedVersion: item.version }), 'primary'));
  if (item.orderCommitSnapshotId && canReadMargin) actions.push(formActionButton(economicsText('Экономика', 'Economics'), () => orderEconomicsDialog(item)));
  if (item.status === 'attached' && canWrite) actions.push(actionButton('Отменить заказ', () => orderCancellationForm(item)));
  const details = [
    `${money(item.totalAmount)} ${item.currency}`,
    `${item.terms?.incoterm || ''}, оплата ${item.terms?.paymentDays ?? 0} дн.`,
    `Согласовано: ${(item.acceptedOrganisationIds || []).map(orgName).join(', ') || 'нет'}`,
  ];
  if (item.status === 'cancelled') details.push(`Причина: ${item.cancellationReason}`, `Отменён: ${formatDate(item.cancelledAt)}`);
  return entity(item.id, item.status, details, actions);
}
async function orderEconomicsDialog(order) {
  const position = await api(`/v2/orders/${encodeURIComponent(order.id)}/economics-position`);
  if (!position || position.orderId !== order.id || position.orderCommitSnapshotId !== order.orderCommitSnapshotId) throw new Error(I18N.t('common.requestError'));

  const rows = [
    economicsRow('Статус экономики', 'Economics status', economicsStatus(position.status)),
    economicsRow('Фиксация заказа', 'Order commit', position.orderCommitSnapshotId),
    economicsRow('Фактическая себестоимость', 'Effective landed cost', economicsMoney(position.effectiveTotalLandedCost, position.currency)),
    economicsRow('Маржа', 'Contribution margin', economicsMoney(position.effectiveContributionMarginAmount, position.currency)),
    economicsRow('Маржа, %', 'Contribution margin, %', economicsPercent(position.effectiveContributionMarginPercent)),
  ];
  if (position.blockingReasons?.length) rows.push(economicsRow('Блокирует закрытие', 'Close blockers', position.blockingReasons.map(economicsBlockingReason).join(', ')));
  if (position.costCloseSnapshotId) rows.push(economicsRow('Закрытие себестоимости', 'Cost close', position.costCloseSnapshotId));
  if (position.latestPostCloseAdjustmentId) rows.push(economicsRow('Последняя корректировка', 'Latest adjustment', position.latestPostCloseAdjustmentId));
  if (position.cumulativePostCloseCostDelta !== null && position.cumulativePostCloseCostDelta !== undefined) rows.push(economicsRow('Изменение себестоимости после закрытия', 'Post-close cost delta', economicsMoney(position.cumulativePostCloseCostDelta, position.currency)));
  if (position.cumulativePostCloseMarginDelta !== null && position.cumulativePostCloseMarginDelta !== undefined) rows.push(economicsRow('Изменение маржи после закрытия', 'Post-close margin delta', economicsMoney(position.cumulativePostCloseMarginDelta, position.currency)));

  openDetails(economicsText('Экономика заказа', 'Order economics'), rows);
}
function economicsRow(ruLabel, enLabel, value) { return Object.freeze({ label: economicsText(ruLabel, enLabel), value }); }
function economicsText(ru, en) { return I18N.getLocale() === 'en' ? en : ru; }
function economicsMoney(value, currency) { return value === null || value === undefined ? '—' : `${I18N.formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency}`; }
function economicsPercent(value) { return value === null || value === undefined ? '—' : `${I18N.formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`; }
function economicsStatus(status) {
  const labels = {
    OPEN: ['Открыта', 'Open'],
    WAITING_FOR_FREIGHT: ['Ожидает фрахт', 'Waiting for freight'],
    WAITING_FOR_DUTY: ['Ожидает пошлину', 'Waiting for duty'],
    WAITING_FOR_CREDITS: ['Ожидает кредитные корректировки', 'Waiting for credits'],
    READY_TO_CLOSE: ['Готова к закрытию', 'Ready to close'],
    STALE: ['Требует пересчёта', 'Needs recalculation'],
    CLOSED: ['Закрыта', 'Closed'],
    ADJUSTED: ['Закрыта с корректировками', 'Closed with adjustments'],
  };
  const label = labels[status];
  return label ? economicsText(label[0], label[1]) : economicsText('Неизвестно', 'Unknown');
}
function economicsBlockingReason(reason) {
  const labels = {
    readiness_not_evaluated: ['готовность не оценена', 'readiness not evaluated'],
    ledger_changed: ['реестр затрат изменён', 'cost ledger changed'],
    factory: ['фабричные затраты', 'factory costs'],
    freight: ['фрахт', 'freight'],
    duty: ['пошлина', 'duty'],
    credits: ['кредитные корректировки', 'credits'],
  };
  const label = labels[reason];
  return label ? economicsText(label[0], label[1]) : economicsText('неизвестная причина', 'unknown reason');
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
