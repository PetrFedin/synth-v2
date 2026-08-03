import { edit, replaceRegexOnce } from './order-patch-utils.mjs';

await edit('public/modules/omnidata-workspace.js', source => replaceRegexOnce(
  source,
  /function odOrderActions\(item\) \{[\s\S]*?\n\}\n\nfunction odHistory/,
`function odOrderActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  const accepted = new Set(odList(item.acceptedOrganisationIds));
  const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);
  if (['draft', 'ready'].includes(item.status) && canWrite) {
    actions.push(actionButton(odText('\\u0420\\u0435\\u0434\\u0430\\u043a\\u0442\\u0438\\u0440\\u043e\\u0432\\u0430\\u0442\\u044c \\u0443\\u0441\\u043b\\u043e\\u0432\\u0438\\u044f', 'Edit terms'), () => orderTermsEditForm(item)));
  }
  ownIds().filter(id => [item.brandId, item.shopId].includes(id)).forEach(orgId => {
    if (!accepted.has(orgId) && ['draft', 'ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, orgId, caps.CAPABILITIES.ORDER_CONFIRM)) {
      actions.push(actionButton(\`\${odText('\\u0421\\u043e\\u0433\\u043b\\u0430\\u0441\\u043e\\u0432\\u0430\\u0442\\u044c', 'Approve')}: \${orgName(orgId)}\`, () => mutate(
        \`/v2/orders/\${encodeURIComponent(item.id)}/accept\`,
        { organisationId: orgId, expectedVersion: item.version },
      ), 'primary'));
    }
  });
  if (item.status === 'ready' && canWrite) actions.push(actionButton(
    odText('\\u041f\\u0440\\u0438\\u043a\\u0440\\u0435\\u043f\\u0438\\u0442\\u044c \\u043a \\u0446\\u0438\\u043a\\u043b\\u0443', 'Attach to cycle'),
    () => mutate(\`/v2/orders/\${encodeURIComponent(item.id)}/attach\`, { expectedVersion: item.version }),
    'primary',
  ));
  if (item.status === 'attached' && canWrite) actions.push(actionButton(odText('\\u041e\\u0442\\u043c\\u0435\\u043d\\u0438\\u0442\\u044c \\u0437\\u0430\\u043a\\u0430\\u0437', 'Cancel order'), () => orderCancellationForm(item), 'danger'));
  return actions;
}

function odHistory`,
  'Omnidata order actions',
));
