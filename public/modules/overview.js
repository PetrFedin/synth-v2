function renderOverview() {
  const box = el('div');
  const w = state.workspace;
  const kpis = el('section', { className: 'grid kpis' });
  [
    ['\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0432\u044f\u0437\u0438', w.relationships.filter(x => x.status === 'active').length],
    ['\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435 \u0446\u0438\u043a\u043b\u044b', w.cycles.filter(x => x.stage !== 'deal-space').length],
    ['\u0417\u0430\u043a\u0430\u0437\u044b', w.orders.length],
    ['DealSpace', w.deals.length],
  ].forEach(([label, value]) => kpis.append(kpi(label, value)));
  box.append(kpis);
  const activeCycles = [...w.cycles].sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,5);
  box.append(sectionCard('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 pipeline', activeCycles.length ? activeCycles.map(cycleEntity) : [empty('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0446\u0438\u043a\u043b\u044b \u0435\u0449\u0451 \u043d\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u044b.')]),
    sectionCard('\u0411\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f', w.calendar.length ? [...w.calendar].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt))).slice(0,6).map(calendarEntity) : [empty('\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442.')]),
    sectionCard('\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', state.notifications.length ? state.notifications.slice(0,6).map(notificationEntity) : [empty('\u041d\u043e\u0432\u044b\u0445 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043d\u0435\u0442.')])
  );
  return box;
}

