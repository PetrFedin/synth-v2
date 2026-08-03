function renderSelections() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCreate = caps.hasAny(state.workspace, caps.CAPABILITIES.SELECTION_WRITE, 'shop') && window.SynthaWorkflowContexts.buildSelectionContexts(state.workspace, ownIds(), new Date().toISOString()).length > 0;
  box.append(toolbar('Buyer Selection', canCreate ? 'Создать Selection' : undefined, canCreate ? selectionForm : undefined));
  box.append(sectionCard(
    'Selections',
    state.workspace.selections.length ? state.workspace.selections.map(selectionEntity) : [empty('Selections пока нет.')],
    undefined,
    undefined,
    'selections',
  ));
  return box;
}

function renderOrders() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCreate = caps.hasAny(state.workspace, caps.CAPABILITIES.ORDER_WRITE, 'shop') && state.workspace.selections.some(selection => selection.status === 'submitted' && caps.hasForOrganisation(state.workspace, selection.shopId, caps.CAPABILITIES.ORDER_WRITE) && !state.workspace.orders.some(order => order.selectionId === selection.id));
  box.append(toolbar('Order Builder и DealSpace', canCreate ? 'Создать заказ' : undefined, canCreate ? orderForm : undefined));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard(
      'Заказы',
      state.workspace.orders.length ? state.workspace.orders.map(orderEntity) : [empty('Заказов пока нет.')],
      undefined,
      undefined,
      'orders',
    ),
    sectionCard(
      'DealSpace',
      state.workspace.deals.length ? state.workspace.deals.map(dealEntity) : [empty('Подтверждённых сделок пока нет.')],
      undefined,
      undefined,
      'deals',
    ),
  );
  box.append(grid);
  const canCreateThread = caps.hasAny(state.workspace, caps.CAPABILITIES.COLLABORATION_WRITE);
  box.append(sectionCard(
    localText('Рабочие коммуникации','Collaboration'),
    state.workspace.collaborationThreads.length
      ? state.workspace.collaborationThreads.map(collaborationThreadEntity)
      : [empty(localText('Обсуждений по заказам и сделкам пока нет.','No order or deal discussions yet.'))],
    canCreateThread ? localText('Новая тема','New thread') : undefined,
    canCreateThread ? collaborationThreadForm : undefined,
  ));
  return box;
}

function renderCalendar() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCreateEvent = caps.hasAny(state.workspace, caps.CAPABILITIES.CALENDAR_WRITE);
  box.append(toolbar(
    localText('Операционный календарь','Operational calendar'),
    canCreateEvent ? localText('Добавить событие','Add event') : undefined,
    canCreateEvent ? calendarEventForm : undefined,
  ));
  const events = [...state.workspace.calendarEvents].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
  const milestones = [...state.workspace.calendar].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard(
      localText('Рабочие события','Operational events'),
      events.length ? events.map(calendarEventEntity) : [empty(localText('Рабочих событий пока нет.','No operational events yet.'))],
    ),
    sectionCard(
      localText('Системные этапы сделок','Deal milestones'),
      milestones.length ? milestones.map(calendarEntity) : [empty(localText('Системных этапов пока нет.','No deal milestones yet.'))],
      undefined,
      undefined,
      'calendar',
    ),
  );
  box.append(grid);
  return box;
}

function renderNotifications() {
  return sectionCard('Notification Center', state.notifications.length ? state.notifications.map(notificationEntity) : [empty('Уведомлений пока нет.')]);
}
