function renderPartners() {
  const box = el('div');
  const caps = window.SynthaUiCapabilities;
  const canManage = caps.hasAny(state.workspace, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE);
  box.append(toolbar(
    'Торговые отношения и доступы',
    canManage ? 'Запросить связь' : undefined,
    canManage ? relationshipForm : undefined,
  ));
  const grid = el('div', { className: 'grid two' });
  grid.append(
    sectionCard(
      'Отношения',
      state.workspace.relationships.length ? state.workspace.relationships.map(relationshipEntity) : [empty('Нет отношений с контрагентами.')],
      undefined,
      undefined,
      'relationships',
    ),
    sectionCard(
      'Приглашения в шоурумы',
      state.workspace.invitations.length ? state.workspace.invitations.map(invitationEntity) : [empty('Нет приглашений.')],
      undefined,
      undefined,
      'invitations',
    ),
  );
  box.append(grid, renderRetailDoorWorkspace());
  return box;
}