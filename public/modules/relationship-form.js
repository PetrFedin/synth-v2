function relationshipForm() {
  const caps = window.SynthaUiCapabilities;
  const validation = window.SynthaUiValidation;
  const allowedIds = new Set(caps.organisationIds(state.workspace, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE));
  const owned = ownOrganisations().filter(item => ['brand','shop'].includes(item.type) && allowedIds.has(item.id));
  openForm('\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0442\u043e\u0440\u0433\u043e\u0432\u043e\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0435', [
    selectDef('ownOrganisationId','\u0412\u0430\u0448\u0430 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f',owned),
    textDef('counterpartyId','ID \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430','',120),
  ], values => {
    const own = owned.find(item => item.id === values.ownOrganisationId);
    if (!own) throw new Error('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430');
    const counterpartyId = validation.requiredText(values.counterpartyId, 'Counterparty ID', { minLength: 1, maxLength: 120 });
    validation.different(counterpartyId, own.id, 'Trade parties');
    return mutate('/v2/relationships', own.type === 'brand'
      ? { brandId: own.id, shopId: counterpartyId }
      : { brandId: counterpartyId, shopId: own.id });
  });
}
