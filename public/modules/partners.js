function renderPartners() {
  const box = el('div');
  const controls = toolbar('\u0422\u043e\u0440\u0433\u043e\u0432\u044b\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', '\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c', () => relationshipForm());
  box.append(controls);
  const grid = el('div', { className: 'grid two' });
  grid.append(sectionCard('\u041e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f', state.workspace.relationships.length ? state.workspace.relationships.map(relationshipEntity) : [empty('\u041d\u0435\u0442 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0439 \u0441 \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430\u043c\u0438.')]),
    sectionCard('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f \u0432 \u0448\u043e\u0443\u0440\u0443\u043c\u044b', state.workspace.invitations.length ? state.workspace.invitations.map(invitationEntity) : [empty('\u041d\u0435\u0442 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0439.')])
  );
  box.append(grid); return box;
}

