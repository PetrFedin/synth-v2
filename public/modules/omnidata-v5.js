const OD_V5 = window.SynthaOmnidataV5 || (window.SynthaOmnidataV5 = {
  navQuery: '',
  applied: 0,
});

const OD_V5_VIEWS = Object.freeze({
  overview: {
    section: ['\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440', 'Operations'],
    title: ['\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b Syntha', 'Syntha workspace'],
    description: ['\u0421\u0432\u043e\u0434\u043a\u0430 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439, \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u043e\u0432, \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0438 \u043a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0445 \u0441\u0440\u043e\u043a\u043e\u0432.', 'A single view of collections, partners, orders and critical deadlines.'],
  },
  catalog: {
    section: ['PLM / \u041f\u0440\u043e\u0434\u0443\u043a\u0442', 'PLM / Product'],
    title: ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u0438 \u043c\u043e\u0434\u0435\u043b\u0438', 'Collections and styles'],
    description: ['\u0415\u0434\u0438\u043d\u044b\u0439 \u0440\u0435\u0435\u0441\u0442\u0440 \u043c\u043e\u0434\u0435\u043b\u0435\u0439, \u0446\u0432\u0435\u0442\u043e\u043c\u043e\u0434\u0435\u043b\u0435\u0439, \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u043e\u0432 \u0438 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0445 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u043e\u0432.', 'The governed record of styles, colourways, materials and commercial attributes.'],
  },
  partners: {
    section: ['SRM / \u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'SRM / Partners'],
    title: ['\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0438', 'Partners and suppliers'],
    description: ['\u041e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f, \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0443\u0441\u043b\u043e\u0432\u0438\u044f, \u0434\u043e\u0441\u0442\u0443\u043f\u044b \u0438 \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u0432\u0437\u0430\u0438\u043c\u043e\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f.', 'Relationships, commercial terms, access and interaction history.'],
  },
  showrooms: {
    section: ['B2B Commerce', 'B2B Commerce'],
    title: ['B2B Showroom', 'B2B Showroom'],
    description: ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438, linesheets, \u0434\u043e\u0441\u0442\u0443\u043f \u0431\u0430\u0439\u0435\u0440\u043e\u0432 \u0438 \u043f\u0435\u0440\u0438\u043e\u0434\u044b \u043e\u043f\u0442\u043e\u0432\u044b\u0445 \u0437\u0430\u043a\u0443\u043f\u043e\u043a.', 'Collections, linesheets, buyer access and wholesale buying windows.'],
  },
  selections: {
    section: ['B2B Commerce', 'B2B Commerce'],
    title: ['\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b \u0438 \u043e\u0442\u0431\u043e\u0440', 'Assortments and selections'],
    description: ['\u0412\u044b\u0431\u043e\u0440 SKU, \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u0430, \u0440\u0430\u0437\u043c\u0435\u0440\u043d\u044b\u0435 \u0440\u044f\u0434\u044b \u0438 \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430 \u043a \u0437\u0430\u043a\u0430\u0437\u0443.', 'SKU selection, quantities, size runs and order preparation.'],
  },
  orders: {
    section: ['Commerce / Execution', 'Commerce / Execution'],
    title: ['\u0417\u0430\u043a\u0430\u0437\u044b \u0438 \u0438\u0441\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435', 'Orders and execution'],
    description: ['\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u0435 \u0443\u0441\u043b\u043e\u0432\u0438\u0439, \u0432\u0435\u0440\u0441\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430, \u0441\u0442\u0430\u0442\u0443\u0441\u044b \u0438 \u043f\u0435\u0440\u0435\u0445\u043e\u0434 \u0432 Deal Space.', 'Terms approval, order versions, statuses and Deal Space handoff.'],
  },
  calendar: {
    section: ['Operations / Calendar', 'Operations / Calendar'],
    title: ['\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0438 critical path', 'Calendar and critical path'],
    description: ['\u0421\u0440\u043e\u043a\u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0438, \u0437\u0430\u043a\u0443\u043f\u043e\u043a, \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0430, \u043e\u0442\u0433\u0440\u0443\u0437\u043e\u043a \u0438 \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447.', 'Development, buying, production, shipment and team deadlines.'],
  },
  notifications: {
    section: ['Operations / Inbox', 'Operations / Inbox'],
    title: ['\u0426\u0435\u043d\u0442\u0440 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439', 'Notification centre'],
    description: ['\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f, \u0441\u0440\u043e\u043a\u0438, \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u044f \u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f, \u0442\u0440\u0435\u0431\u0443\u044e\u0449\u0438\u0435 \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f.', 'Changes, deadlines, approvals and actions requiring attention.'],
  },
});

const OD_V5_GROUPS = Object.freeze([
  {
    label: null,
    items: [
      { view: 'overview', icon: 'overview', ru: '\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b', en: 'Workspace' },
    ],
  },
  {
    label: ['PRODUCT DEVELOPMENT', 'PRODUCT DEVELOPMENT'],
    items: [
      { icon: 'calendar', ru: 'Line Plan', en: 'Line Plan', planned: true },
      { view: 'catalog', icon: 'catalog', ru: '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', en: 'Collections' },
      { icon: 'catalog', ru: '\u041c\u043e\u0434\u0435\u043b\u0438 \u0438 colorways', en: 'Styles and colourways', planned: true },
      { icon: 'catalog', ru: '\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0438 trims', en: 'Materials and trims', planned: true },
      { icon: 'selections', ru: 'BOM \u0438 Costing', en: 'BOM and Costing', planned: true },
      { icon: 'selections', ru: 'Measurement Charts', en: 'Measurement Charts', planned: true },
      { icon: 'catalog', ru: '\u041e\u0431\u0440\u0430\u0437\u0446\u044b', en: 'Samples', planned: true },
      { icon: 'orders', ru: '\u0422\u0435\u0445\u043f\u0430\u043a\u0438', en: 'Tech packs', planned: true },
    ],
  },
  {
    label: ['SOURCING & PRODUCTION', 'SOURCING & PRODUCTION'],
    items: [
      { view: 'partners', icon: 'partners', ru: '\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0438', en: 'Partners and suppliers' },
      { icon: 'selections', ru: 'RFQ', en: 'RFQ', planned: true },
      { icon: 'selections', ru: '\u041a\u043e\u0442\u0438\u0440\u043e\u0432\u043a\u0438', en: 'Quotations', planned: true },
      { icon: 'orders', ru: '\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e', en: 'Production', planned: true },
      { icon: 'selections', ru: '\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e', en: 'Quality', planned: true },
      { icon: 'showrooms', ru: '\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u0430', en: 'Logistics', planned: true },
    ],
  },
  {
    label: ['WHOLESALE COMMERCE', 'WHOLESALE COMMERCE'],
    items: [
      { view: 'showrooms', icon: 'showrooms', ru: 'B2B Showroom', en: 'B2B Showroom' },
      { icon: 'catalog', ru: 'Linesheets', en: 'Linesheets', planned: true },
      { icon: 'partners', ru: '\u0411\u0430\u0439\u0435\u0440\u044b \u0438 \u0440\u0435\u0442\u0435\u0439\u043b\u0435\u0440\u044b', en: 'Buyers and retailers', planned: true },
      { view: 'selections', icon: 'selections', ru: '\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b', en: 'Assortments' },
      { view: 'orders', icon: 'orders', ru: 'Wholesale Orders', en: 'Wholesale Orders' },
      { icon: 'orders', ru: 'Reorders', en: 'Reorders', planned: true },
      { icon: 'selections', ru: '\u0426\u0435\u043d\u044b \u0438 \u0443\u0441\u043b\u043e\u0432\u0438\u044f', en: 'Prices and terms', planned: true },
      { icon: 'orders', ru: 'Payments', en: 'Payments', planned: true },
    ],
  },
  {
    label: ['OPERATIONS', 'OPERATIONS'],
    items: [
      { view: 'calendar', icon: 'calendar', ru: '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', en: 'Calendar' },
      { view: 'notifications', icon: 'notifications', ru: '\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', en: 'Notifications' },
      { icon: 'overview', ru: '\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430', en: 'Analytics', planned: true },
      { icon: 'selections', ru: '\u0417\u0430\u0434\u0430\u0447\u0438', en: 'Tasks', planned: true },
    ],
  },
]);

function odV5Text(item) {
  return localText(item.ru, item.en);
}

function odV5PlannedNotice(item) {
  toast(localText(
    `\u0420\u0430\u0437\u0434\u0435\u043b \u00ab${item.ru}\u00bb \u0432\u043a\u043b\u044e\u0447\u0451\u043d \u0432 \u0446\u0435\u043b\u0435\u0432\u0443\u044e \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u0443\u0440\u0443 Syntha.`,
    `${item.en} is included in the target Syntha architecture.`,
  ));
}

function odV5FilterNavigation(nav) {
  const query = OD_V5.navQuery.trim().toLocaleLowerCase();
  const groups = [...nav.querySelectorAll('.od-v5-nav-group')];
  groups.forEach((group) => {
    let visible = 0;
    group.querySelectorAll('.nav-item').forEach((item) => {
      const matches = !query || item.textContent.toLocaleLowerCase().includes(query);
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    group.hidden = visible === 0;
  });
}

function odV5SidebarSearch(sidebar, nav) {
  const field = el('label', { className: 'od-v5-sidebar-search' });
  field.append(icon('search'));
  const input = el('input', {
    type: 'search',
    value: OD_V5.navQuery,
    placeholder: localText('\u041d\u0430\u0439\u0442\u0438 \u043c\u043e\u0434\u0443\u043b\u044c', 'Find a module'),
    ariaLabel: localText('\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043c\u043e\u0434\u0443\u043b\u044f\u043c', 'Search modules'),
  });
  input.addEventListener('input', () => {
    OD_V5.navQuery = input.value;
    odV5FilterNavigation(nav);
  });
  field.append(input);
  sidebar.querySelector('.brand')?.after(field);
}

function odV5Navigation() {
  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('.nav');
  if (!sidebar || !nav) return;
  clear(nav);
  nav.classList.add('od-v5-nav');

  OD_V5_GROUPS.forEach((group) => {
    const groupNode = el('section', { className: 'od-v5-nav-group' });
    if (group.label) groupNode.append(el('div', {
      className: 'nav-group-label',
      rawText: localText(group.label[0], group.label[1]),
    }));
    group.items.forEach((item) => {
      const active = Boolean(item.view && item.view === state.view && !item.planned);
      const button = el('button', {
        className: `nav-item ${active ? 'active' : ''} ${item.planned ? 'planned' : ''}`.trim(),
        type: 'button',
        title: odV5Text(item),
        ariaPressed: active ? 'true' : 'false',
      });
      button.append(icon(item.icon || 'catalog'), el('span', { className: 'nav-label', rawText: odV5Text(item) }));
      if (item.planned) button.append(el('span', { className: 'nav-plan-dot', ariaHidden: 'true' }));
      button.addEventListener('click', () => {
        if (item.planned || !item.view) return odV5PlannedNotice(item);
        state.view = item.view;
        renderApp();
      });
      groupNode.append(button);
    });
    nav.append(groupNode);
  });

  sidebar.querySelector('.od-v5-sidebar-search')?.remove();
  odV5SidebarSearch(sidebar, nav);
  odV5FilterNavigation(nav);
}

function odV5ObjectCount(view) {
  const workspace = state.workspace || {};
  const map = {
    overview: ['collections', 'catalogSkus', 'orders', 'relationships'],
    catalog: ['collections', 'catalogSkus', 'campaigns'],
    partners: ['relationships', 'organisations'],
    showrooms: ['showrooms', 'invitations'],
    selections: ['selections'],
    orders: ['orders', 'deals'],
    calendar: ['calendar'],
    notifications: [],
  };
  const keys = map[view] || [];
  if (view === 'notifications') return state.notifications.length;
  return keys.reduce((total, key) => total + odList(workspace[key]).length, 0);
}

function odV5Context() {
  const view = document.querySelector('.od-view');
  if (!view || view.querySelector(':scope > .od-v5-page-context')) return;
  const copy = OD_V5_VIEWS[state.view] || OD_V5_VIEWS.overview;
  const context = el('section', { className: 'od-v5-page-context' });
  const text = el('div', { className: 'od-v5-context-copy' });
  text.append(
    el('span', { className: 'od-v5-context-kicker', rawText: localText(copy.section[0], copy.section[1]) }),
    el('h2', { rawText: localText(copy.title[0], copy.title[1]) }),
    el('p', { rawText: localText(copy.description[0], copy.description[1]) }),
  );

  const side = el('div', { className: 'od-v5-context-side' });
  side.append(
    el('span', { className: 'od-v5-context-chip live', rawText: localText('\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b', 'Live data') }),
    el('span', { className: 'od-v5-context-chip', rawText: `${localText('\u041e\u0431\u044a\u0435\u043a\u0442\u043e\u0432', 'Objects')}: ${odV5ObjectCount(state.view)}` }),
  );
  const refresh = el('button', {
    className: 'od-v5-context-refresh',
    type: 'button',
    rawText: localText('\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c', 'Refresh'),
  });
  refresh.prepend(icon('refresh'));
  refresh.addEventListener('click', () => runAction(async () => {
    await reload();
    renderApp();
  }, refresh));
  side.append(refresh);
  context.append(text, side);
  view.prepend(context);
}

function odV5Commandbars() {
  document.querySelectorAll('.od-commandbar').forEach((bar) => {
    if (bar.querySelector(':scope > .od-v5-command-title')) return;
    const title = el('div', { className: 'od-v5-command-title' });
    title.append(
      el('strong', { rawText: localText('\u0420\u0435\u0435\u0441\u0442\u0440', 'Registry') }),
      el('span', { rawText: localText('\u041f\u043e\u0438\u0441\u043a \u0438 \u0444\u0438\u043b\u044c\u0442\u0440\u044b', 'Search and filters') }),
    );
    bar.prepend(title);
  });
}

function odV5Tables() {
  document.querySelectorAll('.od-table').forEach((table) => {
    const labels = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((row) => {
      row.querySelectorAll('td').forEach((cell, index) => {
        const label = labels[index];
        if (label) cell.setAttribute('data-label', label);
      });
    });
    const wrap = table.closest('.od-table-wrap');
    if (wrap) {
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', localText('\u0420\u0435\u0435\u0441\u0442\u0440 \u0434\u0430\u043d\u043d\u044b\u0445', 'Data registry'));
      wrap.setAttribute('tabindex', '0');
    }
  });
}

function odV5Inspectors() {
  document.querySelectorAll('.od-inspector').forEach((inspector) => {
    const grid = inspector.querySelector(':scope > .od-definition-grid');
    if (grid && !grid.previousElementSibling?.classList.contains('od-v5-inspector-section-title')) {
      grid.before(el('h4', {
        className: 'od-v5-inspector-section-title',
        rawText: localText('\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b', 'Core data'),
      }));
    }
  });
}

function odV5Topbar() {
  const search = document.querySelector('.global-search input');
  if (search) search.placeholder = localText(
    '\u041f\u043e\u0438\u0441\u043a: \u043c\u043e\u0434\u0435\u043b\u0438, SKU, \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b, \u0437\u0430\u043a\u0430\u0437\u044b, \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u044b\u2026',
    'Search styles, SKUs, materials, orders and partners...',
  );
}

function applyOmnidataV5() {
  document.body.classList.add('omnidata-v5');
  odV5Navigation();
  odV5Topbar();
  odV5Context();
  odV5Commandbars();
  odV5Tables();
  odV5Inspectors();
  OD_V5.applied += 1;
}

const odV5RenderApp = renderApp;
renderApp = (...args) => {
  const result = odV5RenderApp(...args);
  applyOmnidataV5();
  return result;
};
