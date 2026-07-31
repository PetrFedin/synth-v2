function relationshipEntity(item) {
  const actions = [];
  if (item.status === 'pending' && ownIds().includes(counterpartyResponder(item))) actions.push(actionButton('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/accept`, {})));
  return entity(item.id, item.status, [pairName(item.brandId,item.shopId), `\u0417\u0430\u043f\u0440\u043e\u0441: ${orgName(item.requestedByOrganisationId)}`], actions);
}
function invitationEntity(item) {
  const actions = [];
  if (item.status === 'pending' && ownIds().includes(item.shopId)) actions.push(actionButton('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/accept`, {})));
  return entity(orgName(item.shopId), item.status, [`\u0428\u043e\u0443\u0440\u0443\u043c: ${nameById('showrooms',item.showroomId)}`, `\u0414\u043e: ${formatDate(item.expiresAt)}`], actions);
}
function campaignEntity(item) {
  const actions = item.status === 'draft' ? [actionButton('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', () => mutate(`/v2/campaigns/${encodeURIComponent(item.id)}/open`, {}))] : [];
  return entity(item.name, item.status, [item.season, `${formatDate(item.startsAt)} \u2014 ${formatDate(item.endsAt)}`, item.id], actions);
}
function collectionEntity(item) {
  const actions = item.status === 'draft' ? [actionButton('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', () => mutate(`/v2/collections/${encodeURIComponent(item.id)}/publish`, {}))] : [];
  return entity(item.name, item.status, [item.currency, `\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f: ${nameById('campaigns',item.campaignId)}`, item.id], actions);
}
function showroomEntity(item) {
  const actions = [];
  if (item.status === 'draft') actions.push(actionButton('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', () => mutate(`/v2/showrooms/${encodeURIComponent(item.id)}/open`, {})));
  if (item.status === 'open') actions.push(actionButton('\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d', () => invitationForm(item)));
  return entity(item.name, item.status, [`\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: ${nameById('collections',item.collectionId)}`, `${formatDate(item.opensAt)} \u2014 ${formatDate(item.closesAt)}`, item.id], actions);
}
