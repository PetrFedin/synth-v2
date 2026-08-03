const OD_V4 = window.SynthaOmnidataV4 || (window.SynthaOmnidataV4 = {
  applied: 0,
  activeNav: '',
});

const OD_V4_GROUPS = Object.freeze([
  {
    label: null,
    items: [
      { id: 'overview', icon: 'overview', ru: '\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b', en: 'Workspace' },
    ],
  },
  {
    label: ['\u0420\u0410\u0417\u0420\u0410\u0411\u041e\u0422\u041a\u0410', 'DEVELOPMENT'],
    items: [
      { id: 'catalog', icon: 'catalog', ru: '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', en: 'Collections' },
      { icon: 'calendar', ru: '\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435', en: 'Planning', planned: true },
      { icon: 'catalog', ru: '\u041c\u043e\u0434\u0435\u043b\u0438', en: 'Styles', planned: true },
      { icon: 'catalog', ru: '\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b', en: 'Materials', planned: true },
      { icon: 'selections', ru: 'BOM', en: 'BOM', planned: true },
      { icon: 'selections', ru: 'BOL', en: 'BOL', planned: true },
      { icon: 'selections', ru: 'Measurement Chart', en: 'Measurement Chart', planned: true },
      { icon: 'catalog', ru: '\u041e\u0431\u0440\u0430\u0437\u0446\u044b', en: 'Samples', planned: true },
      { icon: 'orders', ru: '\u0422\u0435\u0445\u043f\u0430\u043a\u0438', en: 'Tech packs', planned: true },
    ],
  },
  {
    label: ['\u041f\u0420\u041e\u0418\u0417\u0412\u041e\u0414\u0421\u0422\u0412\u041e', 'PRODUCTION'],
    items: [
      { icon: 'partners', ru: '\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0438', en: 'Suppliers', planned: true },
      { icon: 'selections', ru: 'RFQ \u0438 \u043a\u043e\u0442\u0438\u0440\u043e\u0432\u043a\u0438', en: 'RFQ and quotes', planned: true },
      { icon: 'catalog', ru: '\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e', en: 'Production', planned: true },
      { icon: 'orders', ru: '\u0417\u0430\u043a\u0430\u0437\u044b', en: 'Orders', planned: true },
      { icon: 'selections', ru: '\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e', en: 'Quality', planned: true },
      { icon: 'showrooms', ru: '\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u0430', en: 'Logistics', planned: true },
    ],
  },
  {
    label: ['WHOLESALE COMMERCE', 'WHOLESALE COMMERCE'],
    items: [
      { id: 'showrooms', icon: 'showrooms', ru: 'B2B Showroom', en: 'B2B Showroom' },
      { id: 'catalog', icon: 'catalog', ru: '\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0438', en: 'Catalogs' },
      { id: 'showrooms', icon: 'selections', ru: 'Linesheets', en: 'Linesheets' },
      { id: 'partners', icon: 'partners', ru: '\u0411\u0430\u0439\u0435\u0440\u044b', en: 'Buyers' },
      { id: 'partners', icon: 'partners', ru: '\u0420\u0435\u0442\u0435\u0439\u043b\u0435\u0440\u044b', en: 'Retailers' },
      { id: 'selections', icon: 'selections', ru: '\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b', en: 'Assortments' },
      { id: 'orders', icon: 'orders', ru: 'Wholesale Orders', en: 'Wholesale Orders' },
      { icon: 'orders', ru: 'Reorders', en: 'Reorders', planned: true },
      { icon: 'selections', ru: '\u0426\u0435\u043d\u044b \u0438 \u0443\u0441\u043b\u043e\u0432\u0438\u044f', en: 'Prices and terms', planned: true },
      { icon: 'orders', ru: 'Payments', en: 'Payments', planned: true },
    ],
  },
  {
    label: ['\u0423\u041f\u0420\u0410\u0412\u041b\u0415\u041d\u0418\u0415', 'MANAGEMENT'],
    items: [
      { id: 'calendar', icon: 'calendar', ru: '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', en: 'Calendar' },
      { id: 'notifications', icon: 'notifications', ru: '\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', en: 'Notifications' },
    ],
  },
]);

function odV4Text(item) {
  return localText(item.ru, item.en);
}

function odV4ItemKey(group, item) {
  return `${group.label?.[1] || 'ROOT'}:${item.en}`;
}

function odV4PlannedNotice(item) {
  toast(localText(
    `\u0420\u0430\u0437\u0434\u0435\u043b \u00ab${item.ru}\u00bb \u0432\u043a\u043b\u044e\u0447\u0435\u043d \u0432 \u0446\u0435\u043b\u0435\u0432\u0443\u044e \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u0443\u0440\u0443 Syntha.`,
    `${item.en} is included in the target Syntha architecture.`,
  ));
}

function odV4Navigation() {
  const nav = document.querySelector('.sidebar .nav');
  if (!nav) return;
  clear(nav);
  nav.classList.add('od-v4-nav');

  const selected = OD_V4_GROUPS.flatMap((group) => group.items.map((item) => ({ group, item })))
    .find(({ group, item }) => odV4ItemKey(group, item) === OD_V4.activeNav);
  if (!selected || selected.item.id !== state.view) OD_V4.activeNav = '';

  let matchedDefault = false;
  for (const group of OD_V4_GROUPS) {
    if (group.label) nav.append(el('div', {
      className: 'nav-group-label',
      rawText: localText(group.label[0], group.label[1]),
    }));

    for (const item of group.items) {
      const key = odV4ItemKey(group, item);
      const eligible = Boolean(item.id && state.view === item.id && !item.planned);
      const active = eligible && (OD_V4.activeNav ? OD_V4.activeNav === key : !matchedDefault);
      if (active) matchedDefault = true;
      const button = el('button', {
        className: `nav-item ${active ? 'active' : ''} ${item.planned ? 'planned' : ''}`.trim(),
        type: 'button',
        title: odV4Text(item),
        ariaPressed: active ? 'true' : 'false',
      });
      button.append(icon(item.icon || 'catalog'), el('span', { className: 'nav-label', rawText: odV4Text(item) }));
      if (item.planned) button.append(el('span', { className: 'nav-plan-dot', ariaHidden: 'true' }));
      button.addEventListener('click', () => {
        if (item.planned || !item.id) return odV4PlannedNotice(item);
        OD_V4.activeNav = key;
        state.view = item.id;
        renderApp();
      });
      nav.append(button);
    }
  }
}

function odV4Topbar() {
  const topbar = document.querySelector('.topbar');
  const actions = topbar?.querySelector('.topbar-actions');
  if (!topbar || !actions) return;
  topbar.classList.add('od-v4-topbar');

  const search = topbar.querySelector('.global-search input');
  if (search) search.placeholder = localText(
    '\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0435 (\u0444\u0443\u043d\u043a\u0446\u0438\u0438, \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b, \u0437\u0430\u043a\u0430\u0437\u044b, \u0431\u0430\u0439\u0435\u0440\u044b\u2026)',
    'Search the platform (functions, materials, orders, buyers...)',
  );

  if (!actions.querySelector('.od-v4-help-button')) {
    const notifications = actions.querySelector('.topbar-icon-button');
    const help = el('button', {
      className: 'od-v4-help-button',
      type: 'button',
      rawText: '?',
      ariaLabel: localText('\u041f\u043e\u043c\u043e\u0449\u044c', 'Help'),
    });
    help.addEventListener('click', () => toast(localText(
      '\u0426\u0435\u043d\u0442\u0440 \u043f\u043e\u043c\u043e\u0449\u0438 Syntha \u0431\u0443\u0434\u0435\u0442 \u0441\u0432\u044f\u0437\u0430\u043d \u0441 \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442\u043e\u043c \u0442\u0435\u043a\u0443\u0449\u0435\u0433\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0430.',
      'Syntha help will be connected to the current workspace context.',
    )));
    notifications?.after(help);
  }

  for (const target of [actions.querySelector('.topbar-organisation'), actions.querySelector('.topbar-user')]) {
    if (target && !target.querySelector('.od-v4-chevron')) target.append(el('span', { className: 'od-v4-chevron', ariaHidden: 'true' }));
  }
}

function odV4Workspace() {
  document.querySelector('.od-system-footer')?.remove();
  document.querySelectorAll('.od-view').forEach((view) => view.classList.add('od-v4-view'));
  document.querySelectorAll('.od-master').forEach((master) => master.classList.add('od-v4-master'));
  document.querySelectorAll('.od-inspector').forEach((inspector) => inspector.classList.add('od-v4-inspector'));
}

function applyOmnidataV4() {
  document.body.classList.add('omnidata-v4');
  document.body.classList.remove('omnidata-v3');
  odV4Navigation();
  odV4Topbar();
  odV4Workspace();
  OD_V4.applied += 1;
}

const odV4RenderApp = renderApp;
renderApp = (...args) => {
  const result = odV4RenderApp(...args);
  applyOmnidataV4();
  return result;
};
