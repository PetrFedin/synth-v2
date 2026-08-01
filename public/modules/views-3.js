function relationshipEntity(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const responderId = counterpartyResponder(item);
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, responderId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) {
    actions.push(
      actionButton('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
      actionButton('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/reject`, {}), 'danger', '\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c \u0437\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 \u0442\u043e\u0440\u0433\u043e\u0432\u044b\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f?'),
    );
  }
  if (item.status === 'active' && caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) {
    actions.push(actionButton('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/revoke`, {}), 'danger', '\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c \u0442\u043e\u0440\u0433\u043e\u0432\u044b\u0435 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f \u0438 \u0437\u0430\u043a\u0440\u044b\u0442\u044c \u043d\u043e\u0432\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f?'));
  }
  return entity(item.id, item.status, [pairName(item.brandId,item.shopId), `\u0417\u0430\u043f\u0440\u043e\u0441: ${orgName(item.requestedByOrganisationId)}`], actions);
}
function invitationEntity(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SHOWROOM_INVITATION_ACCEPT)) {
    actions.push(
      actionButton('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
      actionButton('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/decline`, {}), 'danger', '\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435 \u0432 \u0448\u043e\u0443\u0440\u0443\u043c?'),
    );
  }
  if (['pending','accepted'].includes(item.status) && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) {
    actions.push(actionButton('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/revoke`, {}), 'danger', '\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435 \u0438 \u0437\u0430\u043a\u0440\u044b\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f?'));
  }
  return entity(orgName(item.shopId), item.status, [`\u0428\u043e\u0443\u0440\u0443\u043c: ${nameById('showrooms',item.showroomId)}`, `\u0414\u043e: ${formatDate(item.expiresAt)}`], actions);
}
function campaignEntity(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CAMPAIGN_MANAGE)
    ? [actionButton('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', () => mutate(`/v2/campaigns/${encodeURIComponent(item.id)}/open`, {}))]
    : [];
  return entity(item.name, item.status, [item.season, `${formatDate(item.startsAt)} \u2014 ${formatDate(item.endsAt)}`, item.id], actions);
}
function collectionEntity(item) {
  const caps = window.SynthaUiCapabilities;
  const campaign = state.workspace.campaigns.find(candidate => candidate.id === item.campaignId);
  const actions = item.status === 'draft' && campaign?.status === 'open' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.COLLECTION_MANAGE)
    ? [actionButton('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', () => mutate(`/v2/collections/${encodeURIComponent(item.id)}/publish`, {}))]
    : [];
  return entity(item.name, item.status, [item.currency, `\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f: ${nameById('campaigns',item.campaignId)}`, item.id], actions);
}
function showroomEntity(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  if (item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE)) actions.push(actionButton('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', () => mutate(`/v2/showrooms/${encodeURIComponent(item.id)}/open`, {})));
  if (item.status === 'open' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) actions.push(actionButton('\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d', () => invitationForm(item)));
  return entity(item.name, item.status, [`\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: ${nameById('collections',item.collectionId)}`, `${formatDate(item.opensAt)} \u2014 ${formatDate(item.closesAt)}`, item.id], actions);
}
