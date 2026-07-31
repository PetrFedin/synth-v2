function collectionForm() {
  const campaigns = state.workspace.campaigns.filter(x => ownIds().includes(x.brandId));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e', [selectDef('campaignId','\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f',campaigns), textDef('name','\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435'), textDef('currency','\u0412\u0430\u043b\u044e\u0442\u0430','EUR')], values => {
    const campaign = campaigns.find(item => item.id === values.campaignId);
    return mutate('/v2/collections', { ...values, brandId: campaign.brandId, currency: values.currency.toUpperCase() });
  });
}
