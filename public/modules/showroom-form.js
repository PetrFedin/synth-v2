function showroomForm() {
  const caps = window.SynthaUiCapabilities;
  const validation = window.SynthaUiValidation;
  const collections = state.workspace.collections.filter(item => item.status === 'published' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0448\u043e\u0443\u0440\u0443\u043c', [
    selectDef('collectionId','\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f',collections),
    textDef('name','\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435','',160),
    dateTimeDef('opensAt','\u041e\u0442\u043a\u0440\u044b\u0442\u0438\u0435'),
    dateTimeDef('closesAt','\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435'),
  ], values => {
    const collection = collections.find(item => item.id === values.collectionId);
    if (!collection) throw new Error('COLLECTION_NOT_AVAILABLE');
    validation.dateRange(values.opensAt, values.closesAt, 'Showroom dates');
    return mutate('/v2/showrooms', {
      ...isoDates(values,['opensAt','closesAt']),
      name: validation.requiredText(values.name, 'Showroom name'),
      brandId: collection.brandId,
    });
  });
}
