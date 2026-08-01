function campaignForm() {
  const caps = window.SynthaUiCapabilities;
  const validation = window.SynthaUiValidation;
  const brandIds = new Set(caps.organisationIds(state.workspace, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand'));
  const brands = ownOrganisations('brand').filter(item => brandIds.has(item.id));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', [
    selectDef('brandId','\u0411\u0440\u0435\u043d\u0434',brands),
    textDef('name','\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435','',160),
    textDef('season','\u0421\u0435\u0437\u043e\u043d','FW27',40),
    dateTimeDef('startsAt','\u041d\u0430\u0447\u0430\u043b\u043e'),
    dateTimeDef('endsAt','\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435'),
  ], values => {
    const name = validation.requiredText(values.name, 'Campaign name');
    const season = validation.requiredText(values.season, 'Season', { maxLength: 40 });
    validation.dateRange(values.startsAt, values.endsAt, 'Campaign dates');
    return mutate('/v2/campaigns', isoDates({ ...values, name, season },['startsAt','endsAt']));
  });
}
