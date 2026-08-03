function renderShowrooms() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canCreateShowroom = caps.hasAny(state.workspace, caps.CAPABILITIES.SHOWROOM_MANAGE, 'brand') && state.workspace.collections.some(item => item.status === 'published' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE));
  const canCreateCycle = caps.hasAny(state.workspace, caps.CAPABILITIES.COMMERCIAL_CYCLE_CREATE) && window.SynthaWorkflowContexts.buildCycleContexts(state.workspace, ownIds()).length > 0;
  box.append(toolbar('\u0428\u043e\u0443\u0440\u0443\u043c\u044b', canCreateShowroom ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0448\u043e\u0443\u0440\u0443\u043c' : undefined, canCreateShowroom ? showroomForm : undefined));
  box.append(
    sectionCard(
      'Showroom workspace',
      state.workspace.showrooms.length ? state.workspace.showrooms.map(showroomEntity) : [empty('\u0428\u043e\u0443\u0440\u0443\u043c\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
      undefined,
      undefined,
      'showrooms',
    ),
    sectionCard(
      '\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0446\u0438\u043a\u043b\u044b',
      state.workspace.cycles.length ? state.workspace.cycles.map(cycleEntity) : [empty('\u0426\u0438\u043a\u043b\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.')],
      canCreateCycle ? '\u041d\u0430\u0447\u0430\u0442\u044c \u0446\u0438\u043a\u043b' : undefined,
      canCreateCycle ? cycleForm : undefined,
      'cycles',
    ),
  );
  return box;
}
