const OMNI_UI = window.SynthaOmnidataUiState || (window.SynthaOmnidataUiState = {
  selected: Object.create(null),
  tabs: Object.create(null),
  filters: Object.create(null),
  viewModes: Object.create(null),
});

function omniText(ru, en) {
  return localText(ru, en);
}

function omniLabel(value) {
  return String(value ?? '').trim();
}

function omniArray(value) {
  return Array.isArray(value) ? value : [];
}

function omniSetTab(scope, tab) {
  OMNI_UI.tabs[scope] = tab;
  renderApp();
}

function omniSetFilter(scope, key, value) {
  OMNI_UI.filters[scope] = { ...(OMNI_UI.filters[scope] || {}), [key]: value };
  renderApp();
}

function omniSetViewMode(scope, mode) {
  OMNI_UI.viewModes[scope] = mode;
  renderApp();
}

function omniTabs(scope, items, fallback) {
  const active = OMNI_UI.tabs[scope] || fallback || items[0]?.id;
  const nav = el('nav', { className: 'omni-tabs', ariaLabel: omniText('\u0412\u043a\u043b\u0430\u0434\u043a\u0438 \u0440\u0430\u0437\u0434\u0435\u043b\u0430', 'Section tabs') });
  items.forEach(item => {
    const button = el('button', {
      className: `omni-tab ${active === item.id ? 'active' : ''}`.trim(),
      type: 'button',
      rawText: item.label,
      ariaPressed: active === item.id ? 'true' : 'false',
    });
    button.addEventListener('click', () => omniSetTab(scope, item.id));
    nav.append(button);
  });
  return { node: nav, active };
}

function omniMetric(label, value, detail = '', tone = '') {
  const card = el('article', { className: `omni-metric ${tone}`.trim() });
  card.append(
    el('span', { className: 'omni-metric-label', rawText: label }),
    el('strong', { className: 'omni-metric-value', rawText: String(value) }),
    el('span', { className: 'omni-metric-detail', rawText: detail }),
  );
  return card;
}

function omniMetrics(items) {
  const row = el('section', { className: 'omni-metrics' });
  items.forEach(item => row.append(omniMetric(item.label, item.value, item.detail, item.tone)));
  return row;
}

function omniViewHeader({ scope, tabs, fallbackTab, metrics = [], controls = [] }) {
  const fragment = document.createDocumentFragment();
  const tabState = omniTabs(scope, tabs, fallbackTab);
  fragment.append(tabState.node);
  if (metrics.length) fragment.append(omniMetrics(metrics));
  if (controls.length) {
    const bar = el('section', { className: 'omni-commandbar' });
    controls.forEach(control => bar.append(control));
    fragment.append(bar);
  }
  return { fragment, activeTab: tabState.active };
}

function omniSearchControl(scope, placeholder) {
  const value = OMNI_UI.filters[scope]?.query || '';
  const label = el('label', { className: 'omni-filter omni-filter-search' });
  label.append(icon('search'));
  const input = el('input', { type: 'search', value, placeholder, ariaLabel: placeholder });
  input.addEventListener('change', () => omniSetFilter(scope, 'query', input.value.trim()));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') omniSetFilter(scope, 'query', input.value.trim());
  });
  label.append(input);
  return label;
}

function omniSelectControl(scope, key, labelText, options, fallback = 'all') {
  const wrap = el('label', { className: 'omni-filter' });
  wrap.append(el('span', { className: 'omni-filter-label', rawText: labelText }));
  const select = el('select');
  const current = OMNI_UI.filters[scope]?.[key] || fallback;
  options.forEach(option => {
    const node = el('option', { value: option.value, rawText: option.label });
    if (option.value === current) node.selected = true;
    select.append(node);
  });
  select.addEventListener('change', () => omniSetFilter(scope, key, select.value));
  wrap.append(select);
  return wrap;
}

function omniViewToggle(scope, options, fallback = 'table') {
  const current = OMNI_UI.viewModes[scope] || fallback;
  const group = el('div', { className: 'omni-segmented', role: 'group', ariaLabel: omniText('\u0420\u0435\u0436\u0438\u043c \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f', 'View mode') });
  options.forEach(option => {
    const button = el('button', {
      className: `omni-segmented-button ${current === option.value ? 'active' : ''}`.trim(),
      type: 'button',
      rawText: option.label,
      ariaPressed: current === option.value ? 'true' : 'false',
    });
    button.addEventListener('click', () => omniSetViewMode(scope, option.value));
    group.append(button);
  });
  return group;
}

function omniPrimaryAction(label, handler) {
  if (!label || typeof handler !== 'function') return null;
  const button = el('button', { className: 'button primary', type: 'button', rawText: label });
  button.addEventListener('click', handler);
  return button;
}

function omniFilterRows(rows, scope, statusAccessor = item => item.status) {
  const query = String(OMNI_UI.filters[scope]?.query || '').toLocaleLowerCase();
  const status = OMNI_UI.filters[scope]?.status || 'all';
  return rows.filter(item => {
    if (status !== 'all' && omniLabel(statusAccessor(item)) !== status) return false;
    if (!query) return true;
    return JSON.stringify(item).toLocaleLowerCase().includes(query);
  });
}

function omniCell(value, className = '') {
  if (value instanceof Node) return value;
  return el('span', { className, rawText: omniLabel(value) || '\u2014' });
}

function omniStatusCell(status) {
  return statusBadge(status || 'draft');
}

function omniTable({ scope, rows, columns, rowKey = item => item.id, emptyText }) {
  const selectedId = OMNI_UI.selected[scope] || (rows[0] ? rowKey(rows[0]) : '');
  if (selectedId && !OMNI_UI.selected[scope]) OMNI_UI.selected[scope] = selectedId;
  const wrap = el('div', { className: 'omni-table-wrap' });
  const table = el('table', { className: 'omni-table' });
  const head = el('thead');
  const headRow = el('tr');
  columns.forEach(column => headRow.append(el('th', { rawText: column.label })));
  head.append(headRow);
  const body = el('tbody');
  rows.forEach(item => {
    const key = rowKey(item);
    const row = el('tr', {
      className: `omni-table-row ${key === selectedId ? 'selected' : ''}`.trim(),
      tabindex: '0',
      ariaSelected: key === selectedId ? 'true' : 'false',
    });
    const select = () => {
      OMNI_UI.selected[scope] = key;
      renderApp();
    };
    row.addEventListener('click', select);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
    columns.forEach(column => {
      const td = el('td', { className: column.className || '' });
      const value = column.render ? column.render(item) : column.value(item);
      td.append(omniCell(value));
      row.append(td);
    });
    body.append(row);
  });
  table.append(head, body);
  wrap.append(table);
  if (!rows.length) wrap.append(el('div', { className: 'omni-empty', rawText: emptyText }));
  return { node: wrap, selected: rows.find(item => rowKey(item) === selectedId) || rows[0] || null };
}

function omniGallery({ scope, rows, rowKey = item => item.id, title, subtitle, status, emptyText }) {
  const selectedId = OMNI_UI.selected[scope] || (rows[0] ? rowKey(rows[0]) : '');
  if (selectedId && !OMNI_UI.selected[scope]) OMNI_UI.selected[scope] = selectedId;
  const grid = el('div', { className: 'omni-gallery' });
  rows.forEach(item => {
    const key = rowKey(item);
    const button = el('button', {
      className: `omni-gallery-card ${key === selectedId ? 'selected' : ''}`.trim(),
      type: 'button',
      ariaPressed: key === selectedId ? 'true' : 'false',
    });
    button.append(
      omniPreview(title(item), subtitle(item)),
      el('strong', { rawText: title(item) }),
      el('span', { rawText: subtitle(item) }),
      omniStatusCell(status(item)),
    );
    button.addEventListener('click', () => {
      OMNI_UI.selected[scope] = key;
      renderApp();
    });
    grid.append(button);
  });
  if (!rows.length) grid.append(el('div', { className: 'omni-empty', rawText: emptyText }));
  return { node: grid, selected: rows.find(item => rowKey(item) === selectedId) || rows[0] || null };
}

function omniPreview(title, subtitle = '') {
  const preview = el('div', { className: 'omni-preview', ariaHidden: 'true' });
  preview.append(
    el('span', { className: 'omni-preview-mark', rawText: initials(title || 'S') }),
    el('span', { className: 'omni-preview-caption', rawText: subtitle || omniText('\u041f\u0440\u0435\u0432\u044c\u044e', 'Preview') }),
  );
  return preview;
}

function omniInspector({ title, subtitle = '', status = '', preview = true, tabs = [], fields = [], actions = [], content = [] }) {
  const aside = el('aside', { className: 'omni-inspector' });
  const head = el('div', { className: 'omni-inspector-head' });
  const copy = el('div', { className: 'omni-inspector-title' });
  copy.append(el('span', { className: 'omni-inspector-kicker', rawText: omniText('\u0414\u0435\u0442\u0430\u043b\u0438 \u043e\u0431\u044a\u0435\u043a\u0442\u0430', 'Object details') }), el('h3', { rawText: title || '\u2014' }), el('p', { rawText: subtitle || '' }));
  head.append(copy);
  if (status) head.append(omniStatusCell(status));
  aside.append(head);
  if (preview) aside.append(omniPreview(title, subtitle));
  if (tabs.length) {
    const tabRow = el('div', { className: 'omni-inspector-tabs' });
    tabs.forEach((tab, index) => tabRow.append(el('span', { className: index === 0 ? 'active' : '', rawText: tab })));
    aside.append(tabRow);
  }
  if (fields.length) {
    const grid = el('dl', { className: 'omni-definition-grid' });
    fields.filter(field => field && field.label).forEach(field => {
      grid.append(el('div', { className: 'omni-definition-item' }));
      const item = grid.lastElementChild;
      item.append(el('dt', { rawText: field.label }), el('dd', { rawText: omniLabel(field.value) || '\u2014' }));
    });
    aside.append(grid);
  }
  content.filter(Boolean).forEach(node => aside.append(node));
  if (actions.filter(Boolean).length) {
    const footer = el('div', { className: 'omni-inspector-actions' });
    actions.filter(Boolean).forEach(action => footer.append(action));
    aside.append(footer);
  }
  return aside;
}

function omniMasterDetail({ scope, master, selected, inspector }) {
  const layout = el('section', { className: 'omni-master-detail' });
  const main = el('div', { className: 'omni-master' });
  main.append(master);
  layout.append(main, selected ? inspector(selected) : omniInspector({ title: omniText('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043f\u0438\u0441\u044c', 'Select a record'), preview: false }));
  return layout;
}

function omniInlineSection(title, children, count = null) {
  const section = el('section', { className: 'omni-inline-section' });
  const head = el('div', { className: 'omni-inline-section-head' });
  head.append(el('h3', { rawText: title }));
  if (count !== null) head.append(el('span', { className: 'section-count', rawText: String(count) }));
  section.append(head);
  children.forEach(child => section.append(child));
  return section;
}

function omniMiniTable(headers, rows) {
  const wrap = el('div', { className: 'omni-mini-table-wrap' });
  const table = el('table', { className: 'omni-mini-table' });
  const thead = el('thead');
  const tr = el('tr');
  headers.forEach(header => tr.append(el('th', { rawText: header })));
  thead.append(tr);
  const tbody = el('tbody');
  rows.forEach(values => {
    const row = el('tr');
    values.forEach(value => {
      const cell = el('td');
      cell.append(value instanceof Node ? value : omniCell(value));
      row.append(cell);
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function omniProgress(stage) {
  const index = Math.max(0, STAGES.indexOf(stage));
  const wrap = el('div', { className: 'omni-progress' });
  STAGES.forEach((item, position) => {
    wrap.append(el('span', { className: position < index ? 'done' : position === index ? 'current' : '', title: stageLabel(item), rawText: String(position + 1) }));
  });
  return wrap;
}

function omniActionForCampaign(item) {
  const caps = window.SynthaUiCapabilities;
  if (item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CAMPAIGN_MANAGE)) {
    return actionButton(omniText('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', 'Open'), () => mutate(`/v2/campaigns/${encodeURIComponent(item.id)}/open`, {}), 'primary');
  }
  return null;
}

function omniActionForCollection(item) {
  const caps = window.SynthaUiCapabilities;
  const campaign = state.workspace.campaigns.find(candidate => candidate.id === item.campaignId);
  if (item.status === 'draft' && campaign?.status === 'open' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.COLLECTION_MANAGE)) {
    return actionButton(omniText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'), () => mutate(`/v2/collections/${encodeURIComponent(item.id)}/publish`, {}), 'primary');
  }
  return null;
}

function omniActionForSku(item) {
  const caps = window.SynthaUiCapabilities;
  const collection = state.workspace.collections.find(candidate => candidate.id === item.collectionId);
  if (item.status === 'draft' && collection?.status === 'published' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE)) {
    return actionButton(omniText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'), () => mutate(`/v2/catalog/skus/${encodeURIComponent(item.sku)}/publish`, {}), 'primary');
  }
  return null;
}

function omniShowroomActions(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  if (item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE)) {
    actions.push(actionButton(omniText('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', 'Open'), () => mutate(`/v2/showrooms/${encodeURIComponent(item.id)}/open`, {}), 'primary'));
  }
  if (item.status === 'open' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) {
    actions.push(actionButton(omniText('\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c', 'Invite'), () => invitationForm(item)));
  }
  return actions;
}

function omniRelationshipActions(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const responderId = counterpartyResponder(item);
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, responderId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) {
    actions.push(
      actionButton(omniText('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', 'Accept'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
      actionButton(omniText('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', 'Reject'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/reject`, {}), 'danger'),
    );
  }
  if (item.status === 'active' && caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) {
    actions.push(actionButton(omniText('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', 'Revoke'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/revoke`, {}), 'danger'));
  }
  return actions;
}

function omniInvitationActions(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SHOWROOM_INVITATION_ACCEPT)) {
    actions.push(
      actionButton(omniText('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', 'Accept'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
      actionButton(omniText('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', 'Decline'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/decline`, {}), 'danger'),
    );
  }
  if (['pending', 'accepted'].includes(item.status) && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) {
    actions.push(actionButton(omniText('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', 'Revoke'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/revoke`, {}), 'danger'));
  }
  return actions;
}

function omniSelectionActions(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const lines = omniArray(item.lines);
  const canWrite = caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SELECTION_WRITE);
  if (item.status === 'draft' && canWrite) {
    actions.push(actionButton(omniText('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c SKU', 'Add SKU'), () => selectionLineForm(item)));
    if (lines.length) actions.push(actionButton(omniText('\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c', 'Submit'), () => mutate(`/v2/selections/${encodeURIComponent(item.id)}/submit`, {}), 'primary'));
  }
  return actions;
}

function omniOrderActions(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const accepted = new Set(omniArray(item.acceptedOrganisationIds));
  ownIds().filter(id => [item.brandId, item.shopId].includes(id)).forEach(orgId => {
    if (!accepted.has(orgId) && ['draft', 'ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, orgId, caps.CAPABILITIES.ORDER_CONFIRM)) {
      actions.push(actionButton(`${omniText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c', 'Approve')}: ${orgName(orgId)}`, () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { organisationId: orgId }), 'primary'));
    }
  });
  const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);
  if (item.status === 'ready' && canWrite) actions.push(actionButton(omniText('\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0446\u0438\u043a\u043b\u0443', 'Attach to cycle'), () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, {}), 'primary'));
  if (item.status === 'attached' && canWrite) actions.push(actionButton(omniText('\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Cancel order'), () => orderCancellationForm(item), 'danger'));
  return actions;
}

function omniCalendarActions(item) {
  const actions = [];
  const caps = window.SynthaUiCapabilities;
  const canWrite = caps.hasForOrganisation(state.workspace, item.ownerOrganisationId, caps.CAPABILITIES.CALENDAR_WRITE);
  if (canWrite && item.status === 'scheduled') {
    actions.push(actionButton(omniText('\u041d\u0430\u0447\u0430\u0442\u044c', 'Start'), () => mutate(`/v2/calendar/events/${encodeURIComponent(item.id)}/status`, { status: 'in_progress' }), 'primary'));
    actions.push(actionButton(omniText('\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c', 'Cancel'), () => mutate(`/v2/calendar/events/${encodeURIComponent(item.id)}/status`, { status: 'cancelled' }), 'danger'));
  }
  if (canWrite && item.status === 'in_progress') actions.push(actionButton(omniText('\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c', 'Complete'), () => mutate(`/v2/calendar/events/${encodeURIComponent(item.id)}/status`, { status: 'completed' }), 'primary'));
  return actions;
}

function omniPage(title, header, body) {
  const page = el('div', { className: 'omni-view' });
  page.append(toolbar(title));
  page.append(header.fragment, body);
  return page;
}
