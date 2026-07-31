function renderShowrooms() {
  const box = el('div');
  box.append(toolbar('\u0428\u043e\u0443\u0440\u0443\u043c\u044b', '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0448\u043e\u0443\u0440\u0443\u043c', showroomForm));
  box.append(sectionCard('Showroom workspace', state.workspace.showrooms.length ? state.workspace.showrooms.map(showroomEntity) : [empty('\u0428\u043e\u0443\u0440\u0443\u043c\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')]),
    sectionCard('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0446\u0438\u043a\u043b\u044b', state.workspace.cycles.length ? state.workspace.cycles.map(cycleEntity) : [empty('\u0426\u0438\u043a\u043b\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')], '\u041d\u0430\u0447\u0430\u0442\u044c \u0446\u0438\u043a\u043b', cycleForm));
  return box;
}

