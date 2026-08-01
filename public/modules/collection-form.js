function collectionForm() {
  const caps = window.SynthaUiCapabilities;
  const validation = window.SynthaUiValidation;
  const campaigns = state.workspace.campaigns.filter(item => item.status !== 'closed' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.COLLECTION_MANAGE));
  openForm('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e', [
    selectDef('campaignId','\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f',campaigns),
    textDef('name','\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435','',160),
    textDef('currency','\u0412\u0430\u043b\u044e\u0442\u0430','EUR',3),
  ], values => {
    const campaign = campaigns.find(item => item.id === values.campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_AVAILABLE');
    return mutate('/v2/collections', {
      campaignId: campaign.id,
      brandId: campaign.brandId,
      name: validation.requiredText(values.name, 'Collection name'),
      currency: validation.currency(values.currency),
    });
  });
}
