function renderSelections() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCreate = caps.hasAny(state.workspace, caps.CAPABILITIES.SELECTION_WRITE, 'shop') && window.SynthaWorkflowContexts.buildSelectionContexts(state.workspace, ownIds(), new Date().toISOString()).length > 0;
  box.append(toolbar('Buyer Selection', canCreate ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection' : undefined, canCreate ? selectionForm : undefined));
  box.append(sectionCard(
    'Selections',
    state.workspace.selections.length ? state.workspace.selections.map(selectionEntity) : [empty('Selections \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
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
  box.append(toolbar('Order Builder \u0438 DealSpace', canCreate ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437' : undefined, canCreate ? orderForm : undefined));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard(
      '\u0417\u0430\u043a\u0430\u0437\u044b',
      state.workspace.orders.length ? state.workspace.orders.map(orderEntity) : [empty('\u0417\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
      undefined,
      undefined,
      'orders',
    ),
    sectionCard(
      'DealSpace',
      state.workspace.deals.length ? state.workspace.deals.map(dealEntity) : [empty('\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0445 \u0441\u0434\u0435\u043b\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
      undefined,
      undefined,
      'deals',
    ),
  );
  box.append(grid); return box;
}

function renderCalendar() {
  const items = [...state.workspace.calendar].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
  return sectionCard(
    '\u041e\u0431\u0449\u0438\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c',
    items.length ? items.map(calendarEntity) : [empty('\u0421\u043e\u0431\u044b\u0442\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
    undefined,
    undefined,
    'calendar',
  );
}

function renderNotifications() {
  const card = sectionCard(
    'Notification Center',
    state.notifications.length ? state.notifications.map(notificationEntity) : [empty('\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
  );
  const paging = window.SynthaNotificationController;
  if (paging?.hasMore()) {
    const status = paging.status();
    const label = status.state === 'loading'
      ? localText('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026')
      : status.state === 'error'
        ? localText('\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c', 'Retry')
        : localText('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0435\u0449\u0451', 'Load more');
    const button = el('button', { className: 'button small', rawText: label, type: 'button' });
    button.disabled = status.state === 'loading';
    button.addEventListener('click', () => { void paging.loadNext(); });
    card.querySelector('.section-toolbar')?.append(button);
  }
  return card;
}
