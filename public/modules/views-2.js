function renderSelections() {
  const box = el('div');
  box.append(toolbar('Buyer Selection', '\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection', selectionForm));
  box.append(sectionCard('Selections', state.workspace.selections.length ? state.workspace.selections.map(selectionEntity) : [empty('Selections \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')]));
  return box;
}

function renderOrders() {
  const box = el('div');
  box.append(toolbar('Order Builder \u0438 DealSpace', '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437', orderForm));
  const grid = el('div', { className: 'grid two' });
  grid.append(sectionCard('\u0417\u0430\u043a\u0430\u0437\u044b', state.workspace.orders.length ? state.workspace.orders.map(orderEntity) : [empty('\u0417\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')]),
    sectionCard('DealSpace', state.workspace.deals.length ? state.workspace.deals.map(dealEntity) : [empty('\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0445 \u0441\u0434\u0435\u043b\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')]))
  box.append(grid); return box;
}

function renderCalendar() {
  const items = [...state.workspace.calendar].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
  return sectionCard('\u041e\u0431\u0449\u0438\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', items.length ? items.map(calendarEntity) : [empty('\u0421\u043e\u0431\u044b\u0442\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')]);
}

function renderNotifications() {
  return sectionCard('Notification Center', state.notifications.length ? state.notifications.map(notificationEntity) : [empty('\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')]);
}

