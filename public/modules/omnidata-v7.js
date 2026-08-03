const OD_V7 = window.SynthaOmnidataV7 || (window.SynthaOmnidataV7 = {
  applied: 0,
});

const OD_V7_GROUPS = Object.freeze([
  {
    label: null,
    items: [
      { view: 'overview', icon: 'overview', ru: '\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b', en: 'Workspace' },
    ],
  },
  {
    label: { ru: '\u0420\u0410\u0417\u0420\u0410\u0411\u041e\u0422\u041a\u0410 \u041f\u0420\u041e\u0414\u0423\u041a\u0422\u0410', en: 'PRODUCT DEVELOPMENT' },
    items: [
      { icon: 'calendar', ru: '\u041f\u043b\u0430\u043d \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', en: 'Line plan', planned: true },
      { view: 'catalog', icon: 'catalog', ru: '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', en: 'Collections' },
      { icon: 'catalog', ru: '\u041c\u043e\u0434\u0435\u043b\u0438 \u0438 \u0446\u0432\u0435\u0442\u043e\u0432\u044b\u0435 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b', en: 'Styles and colourways', planned: true },
      { icon: 'catalog', ru: '\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0438 \u0444\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430', en: 'Materials and trims', planned: true },
      { icon: 'selections', ru: '\u0421\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u0438 \u0438 \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c', en: 'BOM and costing', planned: true },
      { icon: 'selections', ru: '\u0422\u0430\u0431\u043b\u0438\u0446\u044b \u0438\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u0439', en: 'Measurement charts', planned: true },
      { icon: 'catalog', ru: '\u041e\u0431\u0440\u0430\u0437\u0446\u044b', en: 'Samples', planned: true },
      { icon: 'orders', ru: '\u0422\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u043f\u0430\u043a\u0435\u0442\u044b', en: 'Tech packs', planned: true },
    ],
  },
  {
    label: { ru: '\u0417\u0410\u041a\u0423\u041f\u041a\u0418 \u0418 \u041f\u0420\u041e\u0418\u0417\u0412\u041e\u0414\u0421\u0422\u0412\u041e', en: 'SOURCING AND PRODUCTION' },
    items: [
      { view: 'partners', icon: 'partners', ru: '\u041f\u0430\u0440\u0442\u043d\u0451\u0440\u044b \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0438', en: 'Partners and suppliers' },
      { icon: 'selections', ru: '\u0417\u0430\u043f\u0440\u043e\u0441\u044b \u0446\u0435\u043d', en: 'Requests for quotation', planned: true },
      { icon: 'selections', ru: '\u041a\u043e\u0442\u0438\u0440\u043e\u0432\u043a\u0438', en: 'Quotations', planned: true },
      { icon: 'orders', ru: '\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e', en: 'Production', planned: true },
      { icon: 'selections', ru: '\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e', en: 'Quality', planned: true },
      { icon: 'showrooms', ru: '\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u0430', en: 'Logistics', planned: true },
    ],
  },
  {
    label: { ru: '\u041e\u041f\u0422\u041e\u0412\u0410\u042f \u0422\u041e\u0420\u0413\u041e\u0412\u041b\u042f', en: 'WHOLESALE COMMERCE' },
    items: [
      { view: 'showrooms', icon: 'showrooms', ru: '\u041e\u043f\u0442\u043e\u0432\u044b\u0439 \u0448\u043e\u0443\u0440\u0443\u043c', en: 'B2B showroom' },
      { icon: 'catalog', ru: '\u041b\u0438\u0441\u0442\u044b \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', en: 'Linesheets', planned: true },
      { icon: 'partners', ru: '\u0411\u0430\u0439\u0435\u0440\u044b \u0438 \u0440\u0435\u0442\u0435\u0439\u043b\u0435\u0440\u044b', en: 'Buyers and retailers', planned: true },
      { view: 'selections', icon: 'selections', ru: '\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b', en: 'Assortments' },
      { view: 'orders', icon: 'orders', ru: '\u041e\u043f\u0442\u043e\u0432\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b', en: 'Wholesale orders' },
      { icon: 'orders', ru: '\u041f\u043e\u0432\u0442\u043e\u0440\u043d\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b', en: 'Reorders', planned: true },
      { icon: 'selections', ru: '\u0426\u0435\u043d\u044b \u0438 \u0443\u0441\u043b\u043e\u0432\u0438\u044f', en: 'Prices and terms', planned: true },
      { icon: 'orders', ru: '\u041f\u043b\u0430\u0442\u0435\u0436\u0438', en: 'Payments', planned: true },
    ],
  },
  {
    label: { ru: '\u041e\u041f\u0415\u0420\u0410\u0426\u0418\u041e\u041d\u041d\u041e\u0415 \u0423\u041f\u0420\u0410\u0412\u041b\u0415\u041d\u0418\u0415', en: 'OPERATIONS' },
    items: [
      { view: 'calendar', icon: 'calendar', ru: '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', en: 'Calendar' },
      { view: 'notifications', icon: 'notifications', ru: '\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', en: 'Notifications' },
      { icon: 'overview', ru: '\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430', en: 'Analytics', planned: true },
      { icon: 'selections', ru: '\u0417\u0430\u0434\u0430\u0447\u0438', en: 'Tasks', planned: true },
    ],
  },
]);

const OD_V7_ROLE_NAMES = Object.freeze({
  owner: ['\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446', 'Owner'],
  admin: ['\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440', 'Administrator'],
  manager: ['\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440', 'Manager'],
  member: ['\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a', 'Member'],
  buyer: ['\u0411\u0430\u0439\u0435\u0440', 'Buyer'],
  brand: ['\u0411\u0440\u0435\u043d\u0434', 'Brand'],
  retailer: ['\u0420\u0435\u0442\u0435\u0439\u043b\u0435\u0440', 'Retailer'],
  supplier: ['\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier'],
  user: ['\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c', 'User'],
});

const OD_V7_UI_PAIRS = Object.freeze([
  ['Overview', '\u041e\u0431\u0437\u043e\u0440'],
  ['Products', '\u0422\u043e\u0432\u0430\u0440\u044b'],
  ['Partners', '\u041f\u0430\u0440\u0442\u043d\u0451\u0440\u044b'],
  ['Statistics', '\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430'],
  ['History', '\u0418\u0441\u0442\u043e\u0440\u0438\u044f'],
  ['Filters', '\u0424\u0438\u043b\u044c\u0442\u0440\u044b'],
  ['Actions', '\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f'],
  ['Description', '\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435'],
  ['Related data', '\u0421\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b'],
  ['No records', '\u041d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0435\u0439'],
  ['per page', '\u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435'],
  ['Shown', '\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u043e'],
  ['of', '\u0438\u0437'],
  ['Draft', '\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a'],
  ['Active', '\u0410\u043a\u0442\u0438\u0432\u043d\u043e'],
  ['Pending', '\u041e\u0436\u0438\u0434\u0430\u0435\u0442'],
  ['Published', '\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e'],
  ['Open', '\u041e\u0442\u043a\u0440\u044b\u0442\u043e'],
  ['Ready', '\u0413\u043e\u0442\u043e\u0432\u043e'],
  ['Cancelled', '\u041e\u0442\u043c\u0435\u043d\u0435\u043d\u043e'],
]);

function odV7Text(item) {
  return localText(item.ru, item.en);
}

function odV7PlannedNotice(item) {
  toast(localText(
    `\u0420\u0430\u0437\u0434\u0435\u043b \u00ab${item.ru}\u00bb \u0432\u043a\u043b\u044e\u0447\u0451\u043d \u0432 \u0446\u0435\u043b\u0435\u0432\u0443\u044e \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u0443\u0440\u0443 Syntha.`,
    `${item.en} is included in the target Syntha architecture.`,
  ));
}

function odV7RemoveLegacy() {
  document.body.classList.remove('omnidata-v3', 'omnidata-v4', 'omnidata-v5', 'omnidata-v6');
  document.querySelectorAll([
    '.od-v5-page-context',
    '.od-v5-sidebar-search',
    '.od-v5-command-title',
    '.od-v5-inspector-section-title',
    '.od-system-footer',
    '.od-v6-system-footer',
    '.od-v7-system-footer',
  ].join(',')).forEach((node) => node.remove());
}

function odV7Navigation() {
  const nav = document.querySelector('.sidebar .nav');
  if (!nav) return;
  clear(nav);
  nav.className = 'nav od-v7-nav';

  OD_V7_GROUPS.forEach((group) => {
    const groupNode = el('section', { className: 'od-v7-nav-group' });
    if (group.label) groupNode.append(el('div', {
      className: 'nav-group-label',
      rawText: odV7Text(group.label),
    }));

    group.items.forEach((item) => {
      const active = Boolean(item.view && item.view === state.view && !item.planned);
      const label = odV7Text(item);
      const button = el('button', {
        className: `nav-item ${active ? 'active' : ''} ${item.planned ? 'planned' : ''}`.trim(),
        type: 'button',
        title: label,
        ariaPressed: active ? 'true' : 'false',
      });
      button.append(icon(item.icon || 'catalog'), el('span', { className: 'nav-label', rawText: label }));
      if (item.planned) button.append(el('span', { className: 'nav-plan-dot', ariaHidden: 'true' }));
      button.addEventListener('click', () => {
        if (item.planned || !item.view) return odV7PlannedNotice(item);
        state.view = item.view;
        renderApp();
      });
      groupNode.append(button);
    });
    nav.append(groupNode);
  });
}

function odV7LanguageSwitcher() {
  document.querySelectorAll('.topbar .language-switcher').forEach((node) => node.remove());
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;
  const switcher = languageSwitcher();
  switcher.classList.add('od-v7-language-switcher');
  actions.prepend(switcher);
}

function odV7Role() {
  const roleNode = document.querySelector('.topbar-user .user-copy small');
  if (!roleNode) return;
  const membership = state.workspace?.memberships?.[0];
  const rawRole = String(membership?.role || 'user').trim().toLocaleLowerCase();
  const pair = OD_V7_ROLE_NAMES[rawRole] || OD_V7_ROLE_NAMES.user;
  roleNode.textContent = localText(pair[0], pair[1]);
}

function odV7Topbar() {
  const topbar = document.querySelector('.topbar');
  const actions = topbar?.querySelector('.topbar-actions');
  if (!topbar || !actions) return;

  const search = topbar.querySelector('.global-search input');
  if (search) {
    search.placeholder = localText(
      '\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0435: \u0444\u0443\u043d\u043a\u0446\u0438\u0438, \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b, \u0437\u0430\u043a\u0430\u0437\u044b, \u0431\u0430\u0439\u0435\u0440\u044b\u2026',
      'Search the platform: features, materials, orders, buyers...',
    );
    search.setAttribute('aria-label', search.placeholder);
  }

  actions.querySelectorAll('.od-v4-help-button, .od-v7-help-button').forEach((node) => node.remove());
  const notifications = actions.querySelector('.topbar-icon-button');
  const help = el('button', {
    className: 'od-v7-help-button',
    type: 'button',
    rawText: '?',
    ariaLabel: localText('\u041f\u043e\u043c\u043e\u0449\u044c', 'Help'),
    title: localText('\u041f\u043e\u043c\u043e\u0449\u044c', 'Help'),
  });
  help.addEventListener('click', () => toast(localText(
    '\u0426\u0435\u043d\u0442\u0440 \u043f\u043e\u043c\u043e\u0449\u0438 Syntha \u0431\u0443\u0434\u0435\u0442 \u0441\u0432\u044f\u0437\u0430\u043d \u0441 \u0442\u0435\u043a\u0443\u0449\u0438\u043c \u0440\u0430\u0437\u0434\u0435\u043b\u043e\u043c.',
    'Syntha help will be connected to the current workspace.',
  )));
  notifications?.after(help);

  for (const target of [actions.querySelector('.topbar-organisation'), actions.querySelector('.topbar-user')]) {
    target?.querySelectorAll('.od-v4-chevron, .od-v7-chevron').forEach((node) => node.remove());
    if (target) target.append(el('span', { className: 'od-v7-chevron', ariaHidden: 'true' }));
  }

  odV7LanguageSwitcher();
  odV7Role();
}

function odV7Inspector() {
  const labels = [
    ['\u041e\u0431\u0437\u043e\u0440', 'Overview'],
    ['\u0422\u043e\u0432\u0430\u0440\u044b', 'Products'],
    ['\u041f\u0430\u0440\u0442\u043d\u0451\u0440\u044b', 'Partners'],
    ['\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430', 'Statistics'],
    ['\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History'],
  ];
  document.querySelectorAll('.od-inspector').forEach((inspector) => {
    inspector.querySelectorAll('.od-v5-inspector-section-title').forEach((node) => node.remove());
    const tabs = inspector.querySelector('.od-inspector-tabs');
    if (tabs) tabs.replaceChildren(...labels.map((pair, index) => el('span', {
      className: index === 0 ? 'active' : '',
      rawText: localText(pair[0], pair[1]),
    })));
  });
}

function odV7StatusTones() {
  document.querySelectorAll('.od-status-card').forEach((card, index) => {
    card.classList.remove('success', 'warning', 'info');
    if (index === 1) card.classList.add('success');
    if (index === 2) card.classList.add('warning');
    if (index === 3) card.classList.add('info');
  });
}

function odV7TranslateChrome() {
  const locale = I18N.getLocale();
  const selectors = [
    '.od-filter-button',
    '.od-table th',
    '.od-inspector-tabs span',
    '.od-inspector-description h4',
    '.od-related-data h4',
    '.badge',
  ];
  document.querySelectorAll(selectors.join(',')).forEach((node) => {
    const value = node.textContent.trim();
    const pair = OD_V7_UI_PAIRS.find(([en, ru]) => value === en || value === ru);
    if (pair) node.textContent = locale === 'en' ? pair[0] : pair[1];
  });

  document.querySelectorAll('.od-page-size option').forEach((option) => {
    const count = String(option.value || option.textContent.match(/\d+/)?.[0] || '10');
    option.textContent = locale === 'en' ? `${count} per page` : `${count} \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435`;
  });
}

function odV7SystemFooter() {
  document.querySelectorAll('.od-v7-system-footer').forEach((node) => node.remove());
  const shell = document.querySelector('.shell');
  if (!shell) return;
  const footer = el('footer', { className: 'od-v7-system-footer' });
  footer.append(
    el('span', { rawText: localText('\u0412\u0440\u0435\u043c\u044f \u0441\u0435\u0440\u0432\u0435\u0440\u0430: UTC+3', 'Server time: UTC+3') }),
    el('strong', { rawText: localText('Syntha \u2014 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u043c\u043e\u0434\u044b', 'Syntha Fashion Operating System') }),
    el('span', { rawText: 'visual-20260804-7' }),
  );
  shell.append(footer);
}

function odV7Document() {
  const locale = I18N.getLocale();
  document.documentElement.lang = locale;
  document.body.dataset.locale = locale;
  document.title = locale === 'en'
    ? 'Syntha \u2014 Fashion Operating System'
    : 'Syntha \u2014 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u043c\u043e\u0434\u044b';
}

function applyOmnidataV7() {
  document.body.classList.add('omnidata-v7');
  odV7RemoveLegacy();
  odV7Navigation();
  odV7Topbar();
  odV7Inspector();
  odV7StatusTones();
  odV7TranslateChrome();
  odV7SystemFooter();
  odV7Document();
  OD_V7.applied += 1;
}

const odV7RenderApp = renderApp;
renderApp = (...args) => {
  const result = odV7RenderApp(...args);
  applyOmnidataV7();
  return result;
};
