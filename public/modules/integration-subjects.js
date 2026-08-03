function integrationSubjectOptions() {
  const options = [];
  const append = (subjectType, items, label) => (items || []).forEach(item => options.push({
    id: `${subjectType}:${item.id}`,
    subjectType,
    subjectId: item.id,
    item,
    label: `${label}: ${item.name || item.title || item.id}`,
  }));
  append('order', state.workspace.orders, localText('\u0417\u0430\u043a\u0430\u0437','Order'));
  append('deal', state.workspace.deals, 'DealSpace');
  append('selection', state.workspace.selections, 'Selection');
  append('showroom', state.workspace.showrooms, localText('\u0428\u043e\u0443\u0440\u0443\u043c','Showroom'));
  append('collection', state.workspace.collections, localText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f','Collection'));
  append('campaign', state.workspace.campaigns, localText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f','Campaign'));
  append('organisation', state.workspace.organisations, localText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f','Organisation'));
  return options;
}

function integrationParticipantsForSubject(ownerOrganisationId, subject) {
  const values = new Set([ownerOrganisationId]);
  const item = subject.item || {};
  if (item.brandId) values.add(item.brandId);
  if (item.shopId) values.add(item.shopId);
  if (subject.subjectType === 'organisation') values.add(subject.subjectId);
  return [...values];
}
