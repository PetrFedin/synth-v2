const OD_UI = window.SynthaOmnidataUi || (window.SynthaOmnidataUi = {
  tabs: Object.create(null),
  selected: Object.create(null),
  filters: Object.create(null),
});

function odText(ru, en) { return localText(ru, en); }
function odList(value) { return Array.isArray(value) ? value : []; }
function odValue(value) { return String(value ?? '').trim(); }
function odSetTab(scope, value) { OD_UI.tabs[scope] = value; renderApp(); }
function odSetFilter(scope, key, value) {
  OD_UI.filters[scope] = { ...(OD_UI.filters[scope] || {}), [key]: value };
  renderApp();
}

function odTabs(scope, items) {
  const active = OD_UI.tabs[scope] || items[0].id;
  const node = el('nav', { className: 'od-tabs', ariaLabel: odText('\u0412\u043a\u043b\u0430\u0434\u043a\u0438 \u0440\u0430\u0437\u0434\u0435\u043b\u0430', 'Section tabs') });
  items.forEach(item => {
    const button = el('button', {
      className: `od-tab ${active === item.id ? 'active' : ''}`.trim(),
      type: 'button',
      rawText: item.label,
      ariaPressed: active === item.id ? 'true' : 'false',
    });
    button.addEventListener('click', () => odSetTab(scope, item.id));
    node.append(button);
  });
  return { node, active };
}

function odMetric(label, value, detail = '', tone = '') {
  const card = el('article', { className: `od-metric ${tone}`.trim() });
  card.append(
    el('span', { className: 'od-metric-label', rawText: label }),
    el('strong', { className: 'od-metric-value', rawText: String(value) }),
    el('span', { className: 'od-metric-detail', rawText: detail }),
  );
  return card;
}

function odMetrics(items) {
  const node = el('section', { className: 'od-metrics' });
  items.forEach(item => node.append(odMetric(item.label, item.value, item.detail, item.tone)));
  return node;
}

function odSearch(scope, placeholder) {
  const field = el('label', { className: 'od-filter od-search' });
  field.append(icon('search'));
  const input = el('input', {
    type: 'search',
    value: OD_UI.filters[scope]?.query || '',
    placeholder,
    ariaLabel: placeholder,
  });
  input.addEventListener('change', () => odSetFilter(scope, 'query', input.value.trim()));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') odSetFilter(scope, 'query', input.value.trim());
  });
  field.append(input);
  return field;
}

function odStatusFilter(scope, values) {
  const field = el('label', { className: 'od-filter' });
  field.append(el('span', { className: 'od-filter-label', rawText: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status') }));
  const select = el('select');
  const current = OD_UI.filters[scope]?.status || 'all';
  [{ value: 'all', label: odText('\u0412\u0441\u0435', 'All') }, ...values.map(value => ({ value, label: statusLabel(value) }))].forEach(option => {
    const node = el('option', { value: option.value, rawText: option.label });
    if (option.value === current) node.selected = true;
    select.append(node);
  });
  select.addEventListener('change', () => odSetFilter(scope, 'status', select.value));
  field.append(select);
  return field;
}

function odAction(label, handler) {
  if (!label || typeof handler !== 'function') return null;
  const button = el('button', { className: 'button primary', type: 'button', rawText: label });
  button.addEventListener('click', handler);
  return button;
}

function odHeader(scope, tabs, metrics, statuses, placeholder, action) {
  const tabState = odTabs(scope, tabs);
  const fragment = document.createDocumentFragment();
  fragment.append(tabState.node, odMetrics(metrics));
  const bar = el('section', { className: 'od-commandbar' });
  bar.append(odSearch(scope, placeholder));
  if (statuses.length) bar.append(odStatusFilter(scope, statuses));
  if (action) bar.append(action);
  fragment.append(bar);
  return { fragment, active: tabState.active };
}

function odFilter(items, scope, statusAccessor = item => item.status) {
  const query = String(OD_UI.filters[scope]?.query || '').trim().toLocaleLowerCase();
  const status = OD_UI.filters[scope]?.status || 'all';
  return items.filter(item => {
    if (status !== 'all' && String(statusAccessor(item) || '') !== status) return false;
    return !query || JSON.stringify(item).toLocaleLowerCase().includes(query);
  });
}

function odCell(value) {
  if (value instanceof Node) return value;
  return el('span', { rawText: odValue(value) || '\u2014' });
}

function odPreview(title, subtitle = '') {
  const node = el('div', { className: 'od-preview', ariaHidden: 'true' });
  node.append(
    el('span', { className: 'od-preview-mark', rawText: initials(title || 'S') }),
    el('span', { className: 'od-preview-caption', rawText: subtitle || odText('\u041f\u0440\u0435\u0432\u044c\u044e', 'Preview') }),
  );
  return node;
}

function odTable(scope, rows, columns, rowKey = item => item.id) {
  const selectedKey = OD_UI.selected[scope] || (rows[0] ? rowKey(rows[0]) : '');
  if (selectedKey && !OD_UI.selected[scope]) OD_UI.selected[scope] = selectedKey;
  const wrap = el('div', { className: 'od-table-wrap' });
  const table = el('table', { className: 'od-table' });
  const thead = el('thead');
  const head = el('tr');
  columns.forEach(column => head.append(el('th', { rawText: column.label })));
  thead.append(head);
  const tbody = el('tbody');
  rows.forEach(item => {
    const key = rowKey(item);
    const row = el('tr', { className: `od-table-row ${key === selectedKey ? 'selected' : ''}`.trim(), tabindex: '0' });
    const select = () => { OD_UI.selected[scope] = key; renderApp(); };
    row.addEventListener('click', select);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
    });
    columns.forEach(column => {
      const cell = el('td', { className: column.className || '' });
      cell.append(odCell(column.render ? column.render(item) : column.value(item)));
      row.append(cell);
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  if (!rows.length) wrap.append(el('div', { className: 'od-empty', rawText: odText('\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u043e \u0437\u0430\u0434\u0430\u043d\u043d\u044b\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c', 'No data matches the filters') }));
  return { node: wrap, selected: rows.find(item => rowKey(item) === selectedKey) || rows[0] || null };
}

function odInspector({ title, subtitle = '', status = '', preview = false, tabs = [], fields = [], content = [], actions = [] }) {
  const node = el('aside', { className: 'od-inspector' });
  const head = el('div', { className: 'od-inspector-head' });
  const copy = el('div', { className: 'od-inspector-title' });
  copy.append(
    el('span', { className: 'od-inspector-kicker', rawText: odText('\u0414\u0435\u0442\u0430\u043b\u0438 \u043e\u0431\u044a\u0435\u043a\u0442\u0430', 'Object details') }),
    el('h3', { rawText: title || '\u2014' }),
    el('p', { rawText: subtitle || '' }),
  );
  head.append(copy);
  if (status) head.append(statusBadge(status));
  node.append(head);
  if (preview) node.append(odPreview(title, subtitle));
  if (tabs.length) {
    const nav = el('div', { className: 'od-inspector-tabs' });
    tabs.forEach((tab, index) => nav.append(el('span', { className: index === 0 ? 'active' : '', rawText: tab })));
    node.append(nav);
  }
  const grid = el('dl', { className: 'od-definition-grid' });
  fields.filter(field => field && field.label).forEach(field => {
    const item = el('div', { className: 'od-definition-item' });
    item.append(el('dt', { rawText: field.label }), el('dd', { rawText: odValue(field.value) || '\u2014' }));
    grid.append(item);
  });
  if (fields.length) node.append(grid);
  content.filter(Boolean).forEach(item => node.append(item));
  if (actions.filter(Boolean).length) {
    const footer = el('div', { className: 'od-inspector-actions' });
    actions.filter(Boolean).forEach(action => footer.append(action));
    node.append(footer);
  }
  return node;
}

function odRegistry({ scope, rows, columns, inspector, filterScope = scope, rowKey, statusAccessor }) {
  const filtered = odFilter(rows, filterScope, statusAccessor);
  const table = odTable(scope, filtered, columns, rowKey);
  const layout = el('section', { className: 'od-master-detail' });
  const master = el('div', { className: 'od-master' });
  master.append(table.node);
  layout.append(master, table.selected ? inspector(table.selected) : odInspector({ title: odText('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043f\u0438\u0441\u044c', 'Select a record') }));
  return layout;
}

function odMiniTable(headers, rows) {
  const wrap = el('div', { className: 'od-mini-table-wrap' });
  const table = el('table', { className: 'od-mini-table' });
  const thead = el('thead');
  const head = el('tr');
  headers.forEach(header => head.append(el('th', { rawText: header })));
  thead.append(head);
  const tbody = el('tbody');
  rows.forEach(values => {
    const row = el('tr');
    values.forEach(value => { const cell = el('td'); cell.append(odCell(value)); row.append(cell); });
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function odSection(title, child, count) {
  const node = el('section', { className: 'od-section' });
  const head = el('div', { className: 'od-section-head' });
  head.append(el('h3', { rawText: title }));
  if (count !== undefined) head.append(el('span', { className: 'section-count', rawText: String(count) }));
  node.append(head, child);
  return node;
}

function odPage(title, header, content) {
  const node = el('div', { className: 'od-view' });
  node.append(toolbar(title), header.fragment, content);
  return node;
}

function odProgress(stage) {
  const index = Math.max(0, STAGES.indexOf(stage));
  const node = el('div', { className: 'od-progress' });
  STAGES.forEach((item, position) => node.append(el('span', {
    className: position < index ? 'done' : position === index ? 'current' : '',
    title: stageLabel(item),
    rawText: String(position + 1),
  })));
  return node;
}

function odCampaignAction(item) {
  const caps = window.SynthaUiCapabilities;
  return item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CAMPAIGN_MANAGE)
    ? actionButton(odText('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', 'Open'), () => mutate(`/v2/campaigns/${encodeURIComponent(item.id)}/open`, {}), 'primary')
    : null;
}

function odCollectionAction(item) {
  const caps = window.SynthaUiCapabilities;
  const campaign = state.workspace.campaigns.find(candidate => candidate.id === item.campaignId);
  return item.status === 'draft' && campaign?.status === 'open' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.COLLECTION_MANAGE)
    ? actionButton(odText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'), () => mutate(`/v2/collections/${encodeURIComponent(item.id)}/publish`, {}), 'primary')
    : null;
}

function odSkuActions(item) {
  const caps = window.SynthaUiCapabilities;
  const collection = state.workspace.collections.find(candidate => candidate.id === item.collectionId);
  const canManage = item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE);
  const actions = [];
  if (canManage && typeof catalogEditActionButton === 'function') actions.push(catalogEditActionButton(item));
  if (canManage && collection?.status === 'published') actions.push(actionButton(
    odText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'),
    () => mutate(`/v2/catalog/skus/${encodeURIComponent(item.sku)}/publish`, { expectedVersion: item.version }),
    'primary',
  ));
  return actions;
}

function odShowroomActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  if (item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE)) actions.push(actionButton(odText('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', 'Open'), () => mutate(`/v2/showrooms/${encodeURIComponent(item.id)}/open`, {}), 'primary'));
  if (item.status === 'open' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) actions.push(actionButton(odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c', 'Invite'), () => invitationForm(item)));
  return actions;
}

function odRelationshipActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  const responderId = counterpartyResponder(item);
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, responderId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) actions.push(
    actionButton(odText('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', 'Accept'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
    actionButton(odText('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', 'Reject'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/reject`, {}), 'danger'),
  );
  if (item.status === 'active' && caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) actions.push(actionButton(odText('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', 'Revoke'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/revoke`, {}), 'danger'));
  return actions;
}

function odInvitationActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SHOWROOM_INVITATION_ACCEPT)) actions.push(
    actionButton(odText('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', 'Accept'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
    actionButton(odText('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', 'Decline'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/decline`, {}), 'danger'),
  );
  if (['pending', 'accepted'].includes(item.status) && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) actions.push(actionButton(odText('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', 'Revoke'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/revoke`, {}), 'danger'));
  return actions;
}

function odSelectionActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  const lines = odList(item.lines);
  const canWrite = caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SELECTION_WRITE);
  if (item.status === 'draft' && canWrite) {
    actions.push(actionButton(odText('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c SKU', 'Add SKU'), () => selectionLineForm(item)));
    if (lines.length) actions.push(actionButton(odText('\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c', 'Submit'), () => mutate(`/v2/selections/${encodeURIComponent(item.id)}/submit`, {}), 'primary'));
  }
  return actions;
}

function odOrderActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  const accepted = new Set(odList(item.acceptedOrganisationIds));
  ownIds().filter(id => [item.brandId, item.shopId].includes(id)).forEach(orgId => {
    if (!accepted.has(orgId) && ['draft', 'ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, orgId, caps.CAPABILITIES.ORDER_CONFIRM)) actions.push(actionButton(`${odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c', 'Approve')}: ${orgName(orgId)}`, () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { organisationId: orgId }), 'primary'));
  });
  const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);
  if (item.status === 'ready' && canWrite) actions.push(actionButton(odText('\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0446\u0438\u043a\u043b\u0443', 'Attach to cycle'), () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, {}), 'primary'));
  if (item.status === 'attached' && canWrite) actions.push(actionButton(odText('\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Cancel order'), () => orderCancellationForm(item), 'danger'));
  return actions;
}

function odHistory(title, rows) {
  return odSection(title, odMiniTable([
    odText('\u041e\u0431\u044a\u0435\u043a\u0442', 'Object'),
    odText('\u0422\u0438\u043f', 'Type'),
    odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'),
    odText('\u0414\u0430\u0442\u0430', 'Date'),
  ], rows), rows.length);
}

function renderOverview() {
  const w = state.workspace;
  const header = odHeader('overview', [
    { id: 'workspace', label: odText('\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b', 'Workspace') },
    { id: 'processes', label: odText('\u041a\u0430\u0440\u0442\u0430 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0432', 'Process map') },
    { id: 'risks', label: odText('\u0420\u0438\u0441\u043a\u0438 \u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c', 'Risks and control') },
    { id: 'activity', label: odText('\u0410\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c', 'Activity') },
  ], [
    { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: w.collections.length, detail: `${w.campaigns.length} ${odText('\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439', 'campaigns')}` },
    { label: 'SKU', value: w.catalogSkus.length, detail: `${w.catalogSkus.filter(item => item.status === 'published').length} ${odText('\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e', 'published')}` },
    { label: 'Linesheets', value: w.showrooms.length, detail: `${w.showrooms.filter(item => item.status === 'open').length} ${odText('\u043e\u0442\u043a\u0440\u044b\u0442\u043e', 'open')}` },
    { label: odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: w.orders.length, detail: `${w.orders.filter(item => ['draft', 'ready'].includes(item.status)).length} ${odText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'need action')}` },
    { label: 'DealSpace', value: w.deals.length, detail: odText('\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u0435 \u0441\u0434\u0435\u043b\u043a\u0438', 'confirmed deals') },
  ], [], odText('\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0440\u0430\u0431\u043e\u0447\u0435\u043c\u0443 \u0441\u0442\u043e\u043b\u0443', 'Search workspace'));
  if (header.active === 'risks') {
    const grid = el('section', { className: 'od-risk-grid' });
    [[odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438 SKU', 'Draft SKUs'), w.catalogSkus.filter(item => item.status === 'draft').length], [odText('\u041d\u0438\u0437\u043a\u0438\u0439 ATS', 'Low ATS'), w.catalogSkus.filter(item => Number(item.availableToSell ?? item.availableQuantity ?? 0) <= Number(item.minimumOrderQuantity || 1)).length], [odText('\u041d\u0435\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b', 'Unconfirmed orders'), w.orders.filter(item => ['draft', 'ready'].includes(item.status)).length], [odText('\u041e\u0436\u0438\u0434\u0430\u044e\u0449\u0438\u0435 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Pending invitations'), w.invitations.filter(item => item.status === 'pending').length]].forEach(([label, value]) => grid.append(odMetric(label, value, value ? odText('\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044f', 'needs control') : odText('\u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0439 \u043d\u0435\u0442', 'no exceptions'), value ? 'warning' : 'success')));
    return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, grid);
  }
  if (header.active === 'activity') {
    const rows = [...w.orders.map(item => [item.id, odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.showrooms.map(item => [item.name, 'Linesheet', statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.relationships.map(item => [pairName(item.brandId, item.shopId), odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u0441\u0442\u0432\u043e', 'Partnership'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])].slice(0, 30);
    return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, odSection(odText('\u041b\u0435\u043d\u0442\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438', 'Activity feed'), odMiniTable([odText('\u041e\u0431\u044a\u0435\u043a\u0442', 'Object'), odText('\u0422\u0438\u043f', 'Type'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), odText('\u0414\u0430\u0442\u0430', 'Date')], rows), rows.length));
  }
  const board = el('section', { className: `od-process-board ${header.active === 'processes' ? 'expanded' : ''}`.trim() });
  const process = (number, title, subtitle, values, tone) => { const card = el('article', { className: `od-process-card ${tone}`.trim() }); card.append(el('span', { className: 'od-process-number', rawText: number }), el('h3', { rawText: title }), el('p', { rawText: subtitle })); const list = el('div', { className: 'od-process-list' }); values.forEach(([label, value]) => { const row = el('div'); row.append(el('span', { rawText: label }), el('strong', { rawText: String(value) })); list.append(row); }); card.append(list); return card; };
  board.append(process('1', odText('\u0420\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Product development'), odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f \u2192 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f \u2192 SKU', 'Campaign to collection to SKU'), [[odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Campaigns'), w.campaigns.length], [odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), w.collections.length], ['SKU', w.catalogSkus.length]], 'product'), process('2', odText('\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'Production and supply'), odText('\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0441\u0440\u043e\u043a\u043e\u0432 \u0438 \u044d\u0442\u0430\u043f\u043e\u0432', 'Deadlines and milestones'), [[odText('\u0421\u043e\u0431\u044b\u0442\u0438\u044f', 'Events'), w.calendar.length], [odText('\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435 \u0446\u0438\u043a\u043b\u044b', 'Open cycles'), w.cycles.filter(item => item.stage !== 'deal-space').length], [odText('\u0421\u0434\u0435\u043b\u043a\u0438', 'Deals'), w.deals.length]], 'supply'), process('3', odText('\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u043a\u043e\u043c\u043c\u0435\u0440\u0446\u0438\u044f', 'Wholesale commerce'), 'Linesheet \u2192 Selection \u2192 Order \u2192 DealSpace', [['Linesheets', w.showrooms.length], ['Selections', w.selections.length], [odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), w.orders.length], ['DealSpace', w.deals.length]], 'wholesale'));
  if (header.active === 'processes') return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, board);
  const lower = el('section', { className: 'od-dashboard-grid' });
  lower.append(odSection(odText('\u0411\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f', 'Upcoming events'), odMiniTable([odText('\u0421\u043e\u0431\u044b\u0442\u0438\u0435', 'Event'), odText('\u0414\u0430\u0442\u0430', 'Date'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status')], [...w.calendar].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))).slice(0, 6).map(item => [item.title || item.type, formatDate(item.startsAt), statusBadge(item.visibility || item.type)])), w.calendar.length), odSection(odText('\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', 'Recent notifications'), odMiniTable([odText('\u0422\u0435\u043c\u0430', 'Subject'), odText('\u0414\u0430\u0442\u0430', 'Date'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status')], state.notifications.slice(0, 6).map(item => [item.title || item.type, formatDate(item.createdAt), statusBadge(item.status)])), state.notifications.length));
  const content = el('div'); content.append(board, lower);
  return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, content);
}

function renderCatalog() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.catalog || 'sku';
  let action = null;
  if (tab === 'sku' && caps.hasAny(w, caps.CAPABILITIES.CATALOG_MANAGE, 'brand') && w.collections.length) action = odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU', 'Create SKU'), catalogSkuForm);
  if (tab === 'campaigns' && caps.hasAny(w, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand')) action = odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', 'Create campaign'), campaignForm);
  if (tab === 'collections' && caps.hasAny(w, caps.CAPABILITIES.COLLECTION_MANAGE, 'brand') && w.campaigns.length) action = odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e', 'Create collection'), collectionForm);
  const header = odHeader('catalog', [{ id: 'sku', label: odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442', 'Assortment') }, { id: 'campaigns', label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Campaigns') }, { id: 'collections', label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439', 'Change history') }], [{ label: 'SKU', value: w.catalogSkus.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e', 'Published'), value: w.catalogSkus.filter(item => item.status === 'published').length, detail: odText('\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u0430\u043c', 'available to partners') }, { label: odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: w.catalogSkus.filter(item => item.status === 'draft').length, detail: odText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438', 'need publication') }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: w.collections.length, detail: `${w.campaigns.length} ${odText('\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439', 'campaigns')}` }, { label: odText('\u041d\u0438\u0437\u043a\u0438\u0439 ATS', 'Low ATS'), value: w.catalogSkus.filter(item => Number(item.availableToSell ?? item.availableQuantity ?? 0) <= Number(item.minimumOrderQuantity || 1)).length, detail: odText('\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u043e\u0441\u0442\u0430\u0442\u043a\u043e\u0432', 'stock control') }], ['draft', 'published', 'open', 'closed'], odText('\u041f\u043e\u0438\u0441\u043a SKU, \u043c\u043e\u0434\u0435\u043b\u0438 \u0438\u043b\u0438 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Search SKU, model or collection'), action);
  if (header.active === 'history') return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439', 'Change history'), [...w.catalogSkus.map(item => [item.name, 'SKU', statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.collections.map(item => [item.name, odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.campaigns.map(item => [item.name, odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  if (header.active === 'campaigns') return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odRegistry({ scope: 'od-campaigns', filterScope: 'catalog', rows: w.campaigns, columns: [{ label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: item => item.name }, { label: odText('\u0421\u0435\u0437\u043e\u043d', 'Season'), value: item => item.season }, { label: odText('\u041f\u0435\u0440\u0438\u043e\u0434', 'Period'), value: item => `${formatDate(item.startsAt)} - ${formatDate(item.endsAt)}` }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: item => w.collections.filter(candidate => candidate.campaignId === item.id).length }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.name, subtitle: item.season, status: item.status, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0421\u0435\u0437\u043e\u043d', 'Season'), value: item.season }, { label: odText('\u041d\u0430\u0447\u0430\u043b\u043e', 'Starts'), value: formatDate(item.startsAt) }, { label: odText('\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435', 'Ends'), value: formatDate(item.endsAt) }], actions: [odCampaignAction(item)] }) }));
  if (header.active === 'collections') return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odRegistry({ scope: 'od-collections', filterScope: 'catalog', rows: w.collections, columns: [{ label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item => item.name }, { label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: item => nameById('campaigns', item.campaignId) }, { label: odText('\u0412\u0430\u043b\u044e\u0442\u0430', 'Currency'), value: item => item.currency }, { label: 'SKU', value: item => w.catalogSkus.filter(candidate => candidate.collectionId === item.id).length }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.name, subtitle: nameById('campaigns', item.campaignId), status: item.status, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), 'SKU', odText('\u0426\u0435\u043d\u044b', 'Pricing')], fields: [{ label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: nameById('campaigns', item.campaignId) }, { label: odText('\u0412\u0430\u043b\u044e\u0442\u0430', 'Currency'), value: item.currency }, { label: 'SKU', value: w.catalogSkus.filter(candidate => candidate.collectionId === item.id).length }], actions: [odCollectionAction(item)] }) }));
  return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odRegistry({ scope: 'od-sku', filterScope: 'catalog', rows: w.catalogSkus, rowKey: item => item.sku, columns: [{ label: '', className: 'od-thumb-cell', render: item => odPreview(item.name, item.sku) }, { label: 'SKU', value: item => item.sku }, { label: odText('\u041c\u043e\u0434\u0435\u043b\u044c', 'Model'), value: item => item.name }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item => nameById('collections', item.collectionId) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }, { label: odText('\u041e\u043f\u0442. \u0446\u0435\u043d\u0430', 'Wholesale'), value: item => `${money(item.wholesalePrice)} ${item.currency}` }, { label: 'MOQ', value: item => item.minimumOrderQuantity || 1 }, { label: 'ATS', value: item => Number.isInteger(item.availableToSell) ? item.availableToSell : Math.max(0, Number(item.availableQuantity || 0) - Number(item.reservedQuantity || 0)) }], inspector: item => odInspector({ title: item.name, subtitle: item.sku, status: item.status, preview: true, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), odText('\u0426\u0435\u043d\u044b', 'Prices'), odText('\u041e\u0441\u0442\u0430\u0442\u043a\u0438', 'Availability'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: 'SKU', value: item.sku }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: nameById('collections', item.collectionId) }, { label: odText('\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u0446\u0435\u043d\u0430', 'Wholesale price'), value: `${money(item.wholesalePrice)} ${item.currency}` }, { label: 'MOQ', value: item.minimumOrderQuantity || 1 }, { label: odText('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e', 'Available'), value: item.availableQuantity || 0 }, { label: odText('\u0417\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043e\u0432\u0430\u043d\u043e', 'Reserved'), value: item.reservedQuantity || 0 }, { label: odText('\u0412\u0435\u0440\u0441\u0438\u044f', 'Version'), value: item.version || 1 }], actions: odSkuActions(item) }) }));
}

function renderShowrooms() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.showrooms || 'linesheets';
  const canCreate = tab === 'linesheets' && caps.hasAny(w, caps.CAPABILITIES.SHOWROOM_MANAGE, 'brand') && w.collections.some(item => item.status === 'published');
  const header = odHeader('showrooms', [{ id: 'linesheets', label: 'Linesheets' }, { id: 'invitations', label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations') }, { id: 'cycles', label: odText('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0446\u0438\u043a\u043b\u044b', 'Commercial cycles') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: 'Linesheets', value: w.showrooms.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041e\u0442\u043a\u0440\u044b\u0442\u043e', 'Open'), value: w.showrooms.filter(item => item.status === 'open').length, detail: odText('\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0431\u0430\u0439\u0435\u0440\u0430\u043c', 'available to buyers') }, { label: odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: w.showrooms.filter(item => item.status === 'draft').length, detail: odText('\u043d\u0435 \u043e\u0442\u043a\u0440\u044b\u0442\u044b', 'not open') }, { label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations'), value: w.invitations.length, detail: `${w.invitations.filter(item => item.status === 'pending').length} ${odText('\u043e\u0436\u0438\u0434\u0430\u044e\u0442', 'pending')}` }, { label: odText('\u0426\u0438\u043a\u043b\u044b', 'Cycles'), value: w.cycles.length, detail: `${w.cycles.filter(item => item.stage !== 'deal-space').length} ${odText('\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445', 'active')}` }], ['draft', 'open', 'pending', 'accepted'], odText('\u041f\u043e\u0438\u0441\u043a linesheet, \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 \u0438\u043b\u0438 \u0446\u0438\u043a\u043b\u0430', 'Search linesheet, shop or cycle'), canCreate ? odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c linesheet', 'Create linesheet'), showroomForm) : null);
  if (header.active === 'history') return odPage('Linesheets & Showrooms', header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043e\u043f\u0442\u043e\u0432\u043e\u0439 \u0440\u0430\u0431\u043e\u0442\u044b', 'Wholesale history'), [...w.showrooms.map(item => [item.name, 'Linesheet', statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.invitations.map(item => [orgName(item.shopId), odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435', 'Invitation'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  if (header.active === 'invitations') return odPage('Linesheets & Showrooms', header, odRegistry({ scope: 'od-invitations', filterScope: 'showrooms', rows: w.invitations, columns: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: 'Linesheet', value: item => nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: item => formatDate(item.expiresAt) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: orgName(item.shopId), subtitle: nameById('showrooms', item.showroomId), status: item.status, tabs: [odText('\u0414\u043e\u0441\u0442\u0443\u043f', 'Access'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: 'Linesheet', value: nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: formatDate(item.expiresAt) }], actions: odInvitationActions(item) }) }));
  if (header.active === 'cycles') return odPage('Linesheets & Showrooms', header, odRegistry({ scope: 'od-cycles', filterScope: 'showrooms', statusAccessor: item => item.stage, rows: w.cycles, columns: [{ label: odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'Partners'), value: item => pairName(item.brandId, item.shopId) }, { label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: item => nameById('campaigns', item.campaignId) }, { label: odText('\u042d\u0442\u0430\u043f', 'Stage'), render: item => statusBadge(item.stage) }, { label: odText('\u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441', 'Progress'), render: item => odProgress(item.stage) }], inspector: item => odInspector({ title: pairName(item.brandId, item.shopId), subtitle: nameById('campaigns', item.campaignId), status: item.stage, tabs: [odText('\u0426\u0438\u043a\u043b', 'Cycle'), odText('\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', 'Documents'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: nameById('campaigns', item.campaignId) }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: nameById('collections', item.collectionId) }], content: [odProgress(item.stage)] }) }));
  return odPage('Linesheets & Showrooms', header, odRegistry({ scope: 'od-linesheets', filterScope: 'showrooms', rows: w.showrooms, columns: [{ label: '', className: 'od-thumb-cell', render: item => odPreview(item.name, nameById('collections', item.collectionId)) }, { label: 'Linesheet', value: item => item.name }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item => nameById('collections', item.collectionId) }, { label: odText('\u041f\u0435\u0440\u0438\u043e\u0434', 'Period'), value: item => `${formatDate(item.opensAt)} - ${formatDate(item.closesAt)}` }, { label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations'), value: item => w.invitations.filter(candidate => candidate.showroomId === item.id).length }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.name, subtitle: nameById('collections', item.collectionId), status: item.status, preview: true, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), odText('\u0422\u043e\u0432\u0430\u0440\u044b', 'Products'), odText('\u0414\u043e\u0441\u0442\u0443\u043f\u044b', 'Access'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: nameById('collections', item.collectionId) }, { label: odText('\u041e\u0442\u043a\u0440\u044b\u0442\u0438\u0435', 'Opens'), value: formatDate(item.opensAt) }, { label: odText('\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435', 'Closes'), value: formatDate(item.closesAt) }, { label: 'SKU', value: w.catalogSkus.filter(candidate => candidate.collectionId === item.collectionId).length }], actions: odShowroomActions(item) }) }));
}

function renderPartners() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.partners || 'relationships';
  const header = odHeader('partners', [{ id: 'relationships', label: odText('\u041a\u0430\u0440\u0442\u0430 \u0441\u0432\u044f\u0437\u0435\u0439', 'Relationship map') }, { id: 'invitations', label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations') }, { id: 'roles', label: odText('\u041c\u0430\u0442\u0440\u0438\u0446\u0430 \u0440\u043e\u043b\u0435\u0439', 'Role matrix') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439', 'Change history') }], [{ label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0438', 'Organisations'), value: w.organisations.length, detail: odText('\u0432 \u043a\u043e\u043d\u0442\u0443\u0440\u0435', 'in scope') }, { label: odText('\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0432\u044f\u0437\u0438', 'Active relationships'), value: w.relationships.filter(item => item.status === 'active').length, detail: odText('\u0431\u0440\u0435\u043d\u0434 \u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d', 'brand and shop') }, { label: odText('\u041e\u0436\u0438\u0434\u0430\u044e\u0442', 'Pending'), value: w.relationships.filter(item => item.status === 'pending').length, detail: odText('\u0437\u0430\u043f\u0440\u043e\u0441\u044b \u043d\u0430 \u0441\u0432\u044f\u0437\u044c', 'relationship requests') }, { label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations'), value: w.invitations.length, detail: `${w.invitations.filter(item => item.status === 'accepted').length} ${odText('\u043f\u0440\u0438\u043d\u044f\u0442\u043e', 'accepted')}` }, { label: odText('\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438', 'Members'), value: w.memberships.length, detail: odText('\u0440\u043e\u043b\u0438 \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'roles and access') }], ['active', 'pending', 'rejected', 'revoked'], odText('\u041f\u043e\u0438\u0441\u043a \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u0430, \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 \u0438\u043b\u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u0430', 'Search partner, shop or status'), tab === 'relationships' && caps.hasAny(w, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE) ? odAction(odText('\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c', 'Request relationship'), relationshipForm) : null);
  if (header.active === 'history') return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0441\u0432\u044f\u0437\u0435\u0439 \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u043e\u0432', 'Relationship and access history'), [...w.relationships.map(item => [pairName(item.brandId, item.shopId), odText('\u0421\u0432\u044f\u0437\u044c', 'Relationship'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.invitations.map(item => [orgName(item.shopId), odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435', 'Invitation'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  if (header.active === 'roles') { const rows = w.memberships.map(item => ({ ...item, organisation: w.organisations.find(org => org.id === item.organisationId) })); return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odRegistry({ scope: 'od-roles', rows, rowKey: item => `${item.userId || item.id}:${item.organisationId}`, columns: [{ label: odText('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c', 'User'), value: item => item.userId || item.id }, { label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: item => item.organisation?.name || orgName(item.organisationId) }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item => item.organisation?.type || '\u2014' }, { label: odText('\u0420\u043e\u043b\u044c', 'Role'), render: item => statusBadge(item.role || 'member') }], inspector: item => odInspector({ title: item.userId || item.id, subtitle: item.organisation?.name || orgName(item.organisationId), status: item.role || 'member', tabs: [odText('\u0420\u043e\u043b\u044c', 'Role'), odText('\u041f\u0440\u0430\u0432\u0430', 'Permissions'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: item.organisation?.name || orgName(item.organisationId) }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item.organisation?.type || '\u2014' }, { label: odText('\u0420\u043e\u043b\u044c', 'Role'), value: item.role || 'member' }] }) })); }
  if (header.active === 'invitations') return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odRegistry({ scope: 'od-partner-invitations', filterScope: 'partners', rows: w.invitations, columns: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: 'Linesheet', value: item => nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: item => formatDate(item.expiresAt) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: orgName(item.shopId), subtitle: nameById('showrooms', item.showroomId), status: item.status, tabs: [odText('\u0414\u043e\u0441\u0442\u0443\u043f', 'Access'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: 'Linesheet', value: nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: formatDate(item.expiresAt) }], actions: odInvitationActions(item) }) }));
  return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odRegistry({ scope: 'od-relationships', filterScope: 'partners', rows: w.relationships, columns: [{ label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: item => orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: odText('\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u043b', 'Requested by'), value: item => orgName(item.requestedByOrganisationId) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: pairName(item.brandId, item.shopId), subtitle: item.id, status: item.status, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), odText('\u0414\u043e\u0441\u0442\u0443\u043f\u044b', 'Access'), odText('\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', 'Documents'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u043b', 'Requested by'), value: orgName(item.requestedByOrganisationId) }], actions: odRelationshipActions(item) }) }));
}

function renderSelections() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.selections || 'selections';
  const canCreate = tab === 'selections' && caps.hasAny(w, caps.CAPABILITIES.SELECTION_WRITE, 'shop') && window.SynthaWorkflowContexts.buildSelectionContexts(w, ownIds(), new Date().toISOString()).length > 0;
  const header = odHeader('selections', [{ id: 'selections', label: 'Selections' }, { id: 'buyer', label: odText('\u0420\u0430\u0431\u043e\u0447\u0435\u0435 \u043c\u0435\u0441\u0442\u043e \u0431\u0430\u0439\u0435\u0440\u0430', 'Buyer workspace') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: 'Selections', value: w.selections.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: w.selections.filter(item => item.status === 'draft').length, detail: odText('\u0432 \u0440\u0430\u0431\u043e\u0442\u0435 \u0443 \u0431\u0430\u0439\u0435\u0440\u0430', 'in buyer work') }, { label: odText('\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e', 'Submitted'), value: w.selections.filter(item => item.status === 'submitted').length, detail: odText('\u0433\u043e\u0442\u043e\u0432\u043e \u043a \u0437\u0430\u043a\u0430\u0437\u0443', 'ready for order') }, { label: odText('\u041f\u043e\u0437\u0438\u0446\u0438\u0438', 'Lines'), value: w.selections.reduce((sum, item) => sum + odList(item.lines).length, 0), detail: odText('\u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0435 SKU', 'selected SKU') }, { label: odText('\u0415\u0434\u0438\u043d\u0438\u0446\u044b', 'Units'), value: w.selections.reduce((sum, item) => sum + odList(item.lines).reduce((inner, line) => inner + Number(line.quantity || 0), 0), 0), detail: odText('\u043e\u0431\u044a\u0435\u043c \u043e\u0442\u0431\u043e\u0440\u0430', 'selected quantity') }], ['draft', 'submitted'], odText('\u041f\u043e\u0438\u0441\u043a selection, linesheet \u0438\u043b\u0438 SKU', 'Search selection, linesheet or SKU'), canCreate ? odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection', 'Create selection'), selectionForm) : null);
  if (header.active === 'history') return odPage('Buyer Selection', header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043e\u0442\u0431\u043e\u0440\u043e\u0432', 'Selection history'), w.selections.map(item => [item.id, 'Selection', statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])));
  return odPage('Buyer Selection', header, odRegistry({ scope: 'od-selections', filterScope: 'selections', rows: w.selections, columns: [{ label: 'Selection', value: item => item.id }, { label: 'Linesheet', value: item => nameById('showrooms', item.showroomId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: odText('\u041f\u043e\u0437\u0438\u0446\u0438\u0438', 'Lines'), value: item => odList(item.lines).length }, { label: odText('\u0415\u0434\u0438\u043d\u0438\u0446\u044b', 'Units'), value: item => odList(item.lines).reduce((sum, line) => sum + Number(line.quantity || 0), 0) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.id, subtitle: nameById('showrooms', item.showroomId), status: item.status, preview: header.active === 'buyer', tabs: [odText('\u0421\u043e\u0441\u0442\u0430\u0432', 'Lines'), odText('\u0423\u0441\u043b\u043e\u0432\u0438\u044f', 'Terms'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: 'Linesheet', value: nameById('showrooms', item.showroomId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u041f\u043e\u0437\u0438\u0446\u0438\u0438', 'Lines'), value: odList(item.lines).length }, { label: odText('\u0415\u0434\u0438\u043d\u0438\u0446\u044b', 'Units'), value: odList(item.lines).reduce((sum, line) => sum + Number(line.quantity || 0), 0) }], content: [odMiniTable(['SKU', odText('\u041a\u043e\u043b-\u0432\u043e', 'Qty'), odText('\u0426\u0435\u043d\u0430', 'Price')], odList(item.lines).map(line => [line.sku, line.quantity, money(line.unitPrice)]))], actions: odSelectionActions(item) }) }));
}

function renderOrders() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.orders || 'orders';
  const canCreate = tab === 'orders' && caps.hasAny(w, caps.CAPABILITIES.ORDER_WRITE, 'shop') && w.selections.some(selection => selection.status === 'submitted' && !w.orders.some(order => order.selectionId === selection.id));
  const header = odHeader('orders', [{ id: 'orders', label: odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders') }, { id: 'deals', label: 'DealSpace' }, { id: 'confirmations', label: odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u044f', 'Confirmations') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: w.orders.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041e\u0436\u0438\u0434\u0430\u044e\u0442 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u044f', 'Awaiting approval'), value: w.orders.filter(item => ['draft', 'ready'].includes(item.status)).length, detail: odText('\u0434\u0432\u0435 \u0441\u0442\u043e\u0440\u043e\u043d\u044b', 'two-sided confirmation') }, { label: odText('\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u043e', 'Attached'), value: w.orders.filter(item => item.status === 'attached').length, detail: odText('\u0432 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u043c \u0446\u0438\u043a\u043b\u0435', 'in commercial cycle') }, { label: 'DealSpace', value: w.deals.length, detail: odText('\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u0435 \u0441\u0434\u0435\u043b\u043a\u0438', 'confirmed deals') }, { label: odText('\u041e\u0442\u043c\u0435\u043d\u0435\u043d\u043e', 'Cancelled'), value: w.orders.filter(item => item.status === 'cancelled').length, detail: odText('\u0441 \u043f\u0440\u0438\u0447\u0438\u043d\u043e\u0439 \u043e\u0442\u043c\u0435\u043d\u044b', 'with cancellation reason') }], ['draft', 'ready', 'attached', 'cancelled'], odText('\u041f\u043e\u0438\u0441\u043a \u0437\u0430\u043a\u0430\u0437\u0430, \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u0430 \u0438\u043b\u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u0430', 'Search order, partner or status'), canCreate ? odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Create order'), orderForm) : null);
  if (header.active === 'history') return odPage('Order Builder & DealSpace', header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0438 \u0441\u0434\u0435\u043b\u043e\u043a', 'Order and deal history'), [...w.orders.map(item => [item.id, odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.deals.map(item => [item.id, 'DealSpace', statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  const deals = header.active === 'deals';
  const rows = deals ? w.deals : header.active === 'confirmations' ? w.orders.filter(item => ['draft', 'ready'].includes(item.status)) : w.orders;
  return odPage('Order Builder & DealSpace', header, odRegistry({ scope: deals ? 'od-deals' : 'od-orders', filterScope: 'orders', rows, columns: deals ? [{ label: 'DealSpace', value: item => item.id }, { label: odText('\u0417\u0430\u0430\u0437', 'Order'), value: item => item.orderId }, { label: odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'Partners'), value: item => pairName(item.brandId, item.shopId) }, { label: odText('\u0421\u0443\u043c\u043c\u0430', 'Amount'), value: item => money(item.totalAmount) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }] : [{ label: odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), value: item => item.id }, { label: odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'Partners'), value: item => pairName(item.brandId, item.shopId) }, { label: odText('\u0421\u0443\u043c\u043c\u0430', 'Amount'), value: item => `${money(item.totalAmount)} ${item.currency}` }, { label: odText('\u0423\u0441\u043b\u043e\u0432\u0438\u044f', 'Terms'), value: item => `${item.terms?.incoterm || '\u2014'} / ${item.terms?.paymentDays ?? 0}` }, { label: odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043e', 'Approved'), value: item => `${odList(item.acceptedOrganisationIds).length}/2` }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.id, subtitle: pairName(item.brandId, item.shopId), status: item.status, tabs: [deals ? odText('\u0421\u0434\u0435\u043b\u043a\u0430', 'Deal') : odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), odText('\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', 'Documents'), odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u044f', 'Approvals'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u0421\u0443\u043c\u043c\u0430', 'Amount'), value: `${money(item.totalAmount)} ${item.currency || ''}` }, { label: 'Incoterm', value: item.terms?.incoterm || '\u2014' }, { label: odText('\u041e\u043f\u043b\u0430\u0442\u0430, \u0434\u043d\u0438', 'Payment, days'), value: item.terms?.paymentDays ?? '\u2014' }], actions: deals ? [] : odOrderActions(item) }) }));
}

function renderCalendar() {
  const w = state.workspace;
  const header = odHeader('calendar', [{ id: 'agenda', label: odText('\u041f\u043e\u0432\u0435\u0441\u0442\u043a\u0430', 'Agenda') }, { id: 'timeline', label: 'Timeline' }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: odText('\u0421\u043e\u0431\u044b\u0442\u0438\u044f', 'Events'), value: w.calendar.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e', 'Production'), value: w.calendar.filter(item => item.type === 'production').length, detail: odText('\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0435 \u0441\u0440\u043e\u043a\u0438', 'production dates') }, { label: odText('\u0417\u0430\u043a\u0443\u043f\u043a\u0438', 'Purchasing'), value: w.calendar.filter(item => item.type === 'purchase').length, detail: odText('\u0437\u0430\u043a\u0443\u043f\u043e\u0447\u043d\u044b\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f', 'purchasing events') }, { label: odText('\u041c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433', 'Marketing'), value: w.calendar.filter(item => item.type === 'marketing').length, detail: odText('\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0438 \u0437\u0430\u043f\u0443\u0441\u043a\u0438', 'campaigns and launches') }, { label: odText('\u041f\u0440\u0438\u0432\u0430\u0442\u043d\u044b\u0435', 'Private'), value: w.calendar.filter(item => item.visibility === 'private').length, detail: odText('\u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u043d\u0430\u044f \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c', 'restricted visibility') }], [], odText('\u041f\u043e\u0438\u0441\u043a \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u0438\u043b\u0438 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0438', 'Search event or organisation'));
  const events = odFilter([...w.calendar].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))), 'calendar');
  if (header.active === 'history') return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Operational calendar'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044f', 'Calendar history'), events.map(item => [item.title || item.type, item.type, statusBadge(item.visibility || item.type), formatDate(item.startsAt)])));
  if (header.active === 'timeline') { const timeline = el('section', { className: 'od-timeline' }); events.forEach(item => { const row = el('article', { className: 'od-timeline-row' }); const card = el('div', { className: 'od-timeline-card' }); card.append(el('strong', { rawText: item.title || item.type }), el('p', { rawText: orgName(item.ownerOrganisationId) }), statusBadge(item.visibility || item.type)); row.append(el('time', { rawText: formatDate(item.startsAt) }), el('span', { className: 'od-timeline-line' }), card); timeline.append(row); }); return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Operational calendar'), header, timeline); }
  return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Operational calendar'), header, odRegistry({ scope: 'od-calendar', rows: events, columns: [{ label: odText('\u0421\u043e\u0431\u044b\u0442\u0438\u0435', 'Event'), value: item => item.title || item.type }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item => item.type }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: item => formatDate(item.startsAt) }, { label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: item => orgName(item.ownerOrganisationId) }, { label: odText('\u0412\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c', 'Visibility'), render: item => statusBadge(item.visibility || item.type) }], inspector: item => odInspector({ title: item.title || item.type, subtitle: formatDate(item.startsAt), status: item.visibility || item.type, tabs: [odText('\u0421\u043e\u0431\u044b\u0442\u0438\u0435', 'Event'), odText('\u041e\u0431\u044a\u0435\u043a\u0442', 'Subject'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0422\u0438\u043f', 'Type'), value: item.type }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: formatDate(item.startsAt) }, { label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: orgName(item.ownerOrganisationId) }, { label: odText('\u0412\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c', 'Visibility'), value: item.visibility || '\u2014' }] }) }));
}

function renderNotifications() {
  const header = odHeader('notifications', [{ id: 'all', label: odText('\u0412\u0441\u0435', 'All') }, { id: 'unread', label: odText('\u041d\u0435\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043d\u044b\u0435', 'Unread') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: odText('\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', 'Notifications'), value: state.notifications.length, detail: odText('\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u043e', 'loaded') }, { label: odText('\u041d\u0435\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043d\u044b\u0435', 'Unread'), value: state.notificationUnreadCount, detail: odText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f', 'need attention') }, { label: odText('\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e', 'Read'), value: state.notifications.filter(item => item.status === 'read').length, detail: odText('\u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u043e', 'processed') }, { label: odText('\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 24 \u0447\u0430\u0441\u0430', 'Last 24 hours'), value: state.notifications.filter(item => item.createdAt && Date.now() - new Date(item.createdAt).getTime() < 86400000).length, detail: odText('\u043d\u043e\u0432\u0430\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c', 'new activity') }, { label: odText('\u0415\u0449\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e', 'More available'), value: window.SynthaNotificationController?.hasMore() ? '+' : '0', detail: odText('\u043a\u0443\u0440\u0441\u043e\u0440\u043d\u0430\u044f \u043f\u0430\u0433\u0438\u043d\u0430\u0446\u0438\u044f', 'cursor pagination') }], [], odText('\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0442\u0435\u043c\u0435 \u0438\u043b\u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044e', 'Search title or message'));
  let rows = state.notifications;
  if (header.active === 'unread') rows = rows.filter(item => item.status !== 'read');
  if (header.active === 'history') rows = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const body = odRegistry({ scope: 'od-notifications', filterScope: 'notifications', rows, columns: [{ label: odText('\u0422\u0435\u043c\u0430', 'Subject'), value: item => item.title || item.type }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item => item.type }, { label: odText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Message'), value: item => item.body || item.message || '\u2014' }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: item => formatDate(item.createdAt) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.title || item.type, subtitle: formatDate(item.createdAt), status: item.status, tabs: [odText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Message'), odText('\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442', 'Context'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0422\u0438\u043f', 'Type'), value: item.type }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: formatDate(item.createdAt) }, { label: odText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Message'), value: item.body || item.message || '\u2014' }], actions: item.status !== 'read' ? [notificationReadButton(item)] : [] }) });
  if (window.SynthaNotificationController?.hasMore()) { const more = el('div', { className: 'od-load-more' }); const button = el('button', { className: 'button', type: 'button', rawText: odText('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0435\u0449\u0435', 'Load more') }); button.addEventListener('click', () => { void window.SynthaNotificationController.loadNext(); }); more.append(button); body.append(more); }
  return odPage(odText('\u0426\u0435\u043d\u0442\u0440 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439', 'Notification center'), header, body);
}
