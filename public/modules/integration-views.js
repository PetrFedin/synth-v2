function renderOrders() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCreate = caps.hasAny(state.workspace, caps.CAPABILITIES.ORDER_WRITE, 'shop') && state.workspace.selections.some(selection => selection.status === 'submitted' && caps.hasForOrganisation(state.workspace, selection.shopId, caps.CAPABILITIES.ORDER_WRITE) && !state.workspace.orders.some(order => order.selectionId === selection.id));
  box.append(toolbar('Order Builder & DealSpace', canCreate ? localText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437','Create order') : undefined, canCreate ? orderForm : undefined));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard(localText('\u0417\u0430\u043a\u0430\u0437\u044b','Orders'), state.workspace.orders.length ? state.workspace.orders.map(orderEntity) : [empty(localText('\u0417\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No orders yet.'))], undefined, undefined, 'orders'),
    sectionCard('DealSpace', state.workspace.deals.length ? state.workspace.deals.map(dealEntity) : [empty(localText('\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u0445 \u0441\u0434\u0435\u043b\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No confirmed deals yet.'))], undefined, undefined, 'deals'),
  );
  box.append(grid);
  const threads = state.workspace.collaborationThreads || [];
  const canCreateThread = caps.hasAny(state.workspace, caps.CAPABILITIES.COLLABORATION_WRITE);
  box.append(sectionCard(localText('\u0420\u0430\u0431\u043e\u0447\u0438\u0435 \u043a\u043e\u043c\u043c\u0443\u043d\u0438\u043a\u0430\u0446\u0438\u0438','Collaboration'), threads.length ? threads.map(collaborationThreadEntity) : [empty(localText('\u041e\u0431\u0441\u0443\u0436\u0434\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No discussions yet.'))], canCreateThread ? localText('\u041d\u043e\u0432\u0430\u044f \u0442\u0435\u043c\u0430','New thread') : undefined, canCreateThread ? collaborationThreadForm : undefined));
  return box;
}

function renderCalendar() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCreateEvent = caps.hasAny(state.workspace, caps.CAPABILITIES.CALENDAR_WRITE);
  box.append(toolbar(localText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c','Operational calendar'), canCreateEvent ? localText('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u043e\u0431\u044b\u0442\u0438\u0435','Add event') : undefined, canCreateEvent ? calendarEventForm : undefined));
  const events = [...(state.workspace.calendarEvents || [])].sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  const milestones = [...(state.workspace.calendar || [])].sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard(localText('\u0420\u0430\u0431\u043e\u0447\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f','Operational events'), events.length ? events.map(calendarEventEntity) : [empty(localText('\u0420\u0430\u0431\u043e\u0447\u0438\u0445 \u0441\u043e\u0431\u044b\u0442\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No operational events yet.'))]),
    sectionCard(localText('\u0421\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0435 \u044d\u0442\u0430\u043f\u044b \u0441\u0434\u0435\u043b\u043e\u043a','Deal milestones'), milestones.length ? milestones.map(calendarEntity) : [empty(localText('\u0421\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0445 \u044d\u0442\u0430\u043f\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.','No deal milestones yet.'))], undefined, undefined, 'calendar'),
  );
  box.append(grid);
  return box;
}
