function campaignForm() {
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', [selectDef('brandId','\u0411\u0440\u0435\u043d\u0434',ownOrganisations('brand')), textDef('name','\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435'), textDef('season','\u0421\u0435\u0437\u043e\u043d','FW27'), dateTimeDef('startsAt','\u041d\u0430\u0447\u0430\u043b\u043e'), dateTimeDef('endsAt','\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435')], values => mutate('/v2/campaigns', isoDates(values,['startsAt','endsAt'])));
}
