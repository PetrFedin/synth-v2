(function installSynthaWorkspaceHub(global) {
  'use strict';

  const descriptions = Object.freeze({
    planning: ['Сезоны, сроки и план коллекции', 'Seasons, milestones and collection plan'],
    catalog: ['Коллекции и связанные продукты', 'Collections and connected products'],
    styles: ['Изделия, версии, варианты, технический анализ', 'Styles, versions, variants and technical analysis'],
    'season-palette': ['Цветовые решения сезона', 'Season colour direction'],
    materials: ['Ткани, фурнитура, характеристики', 'Fabrics, trims and specifications'],
    boms: ['Спецификации и калькуляция', 'Bills of materials and costing'],
    measurements: ['Таблицы мер, размеры, градация', 'Measurement charts, sizes and grading'],
    samples: ['Образцы, примерки и согласования', 'Samples, fittings and approvals'],
    'tech-packs': ['Версии техпаков, документы, фабрика', 'Tech Pack versions, documents and factory'],
    suppliers: ['Поставщики и их документы', 'Suppliers and documentation'],
    rfqs: ['Запросы цен и условия закупки', 'Requests for quotes and sourcing terms'],
    quotations: ['Котировки и сравнение предложений', 'Quotes and offer comparisons'],
    production: ['План производства и распределение', 'Production planning and allocation'],
    'material-rfqs': ['Запросы на материалы', 'Material purchase enquiries'],
    'material-purchase-orders': ['Заказы материалов', 'Material purchase orders'],
    'production-orders': ['Фабричные заказы и подтверждения', 'Factory orders and confirmations'],
    'production-executions': ['Этапы выполнения и прогресс', 'Manufacturing execution and progress'],
    'final-quality': ['Проверки качества и выпуск', 'Quality inspections and releases'],
    showrooms: ['Коллекции и презентация байеру', 'Buyer-facing collections and presentation'],
    linesheets: ['Листы коллекций и позиции', 'Merchandised linesheets and styles'],
    partners: ['Контрагенты, команды и доступы', 'Partners, teams and access'],
    selections: ['Выборка ассортимента и количества', 'Assortment selections and quantities'],
    orders: ['Заказы, подтверждения и поставки', 'Orders, confirmations and deliveries'],
    calendar: ['Встречи и производственные события', 'Meetings and production milestones'],
    notifications: ['Системные уведомления', 'System notifications'],
    libraries: ['Справочники и атрибуты', 'Reference libraries and attributes'],
  });
  const journeyViews = Object.freeze(['planning', 'styles', 'materials', 'boms', 'measurements', 'samples', 'tech-packs', 'production-orders', 'showrooms', 'selections', 'orders']);
  const searchState = { query: '' };

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function node(tag, className, label) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (label !== undefined) el.textContent = String(label);
    return el;
  }
  function pair(value) { return text(value.ru, value.en); }

  // The same mutable navigation model is updated as actual PLM workspaces install.
  // Never maintain a second list of invented or planned routes in this dashboard.
  function availableSections(groups, workspace, canOpen) {
    const seen = new Set();
    return (groups || []).map((group, index) => ({
      id: index,
      title: group.label ? pair(group.label) : text('Рабочее пространство', 'Workspace'),
      entries: (group.items || []).filter((item) => {
        if (!item || typeof item.view !== 'string' || !item.view || item.planned || seen.has(item.view)) return false;
        if (typeof canOpen === 'function' && !canOpen(workspace, item.view)) return false;
        if (typeof odV7ItemApplies === 'function' && !odV7ItemApplies(item)) return false;
        seen.add(item.view);
        return true;
      }).map((item) => ({
        view: item.view,
        title: pair(item),
        description: descriptions[item.view] ? text(...descriptions[item.view]) : text('Открыть рабочий раздел', 'Open workspace'),
        icon: item.icon || 'catalog',
      })),
    })).filter((group) => group.entries.length);
  }

  function navigate(view, workspace = state.workspace) {
    const canOpen = global.SynthaUiCapabilities?.canOpenView;
    if (canOpen && !canOpen(workspace, view)) return false;
    const groups = typeof OD_V7_GROUPS !== 'undefined' ? OD_V7_GROUPS : [];
    if (view === 'awaiting-action') {
      if (!global.SynthaAwaitingAction) return false;
    } else if (!availableSections(groups, workspace, canOpen).some((group) => group.entries.some((item) => item.view === view))) return false;
    state.view = view;
    renderApp();
    return true;
  }

  function card(item) {
    const button = node('button', 'syntha-hub-card');
    button.type = 'button';
    button.dataset.view = item.view;
    button.dataset.odsPart = 'navigation-card';
    button.setAttribute('aria-label', text('Открыть: ', 'Open: ') + item.title);
    const lead = node('span', 'syntha-hub-card-lead');
    const symbol = node('span', 'syntha-hub-card-symbol');
    try { symbol.append(icon(item.icon)); } catch { symbol.textContent = '◆'; }
    lead.append(symbol, node('span', 'syntha-hub-card-cue', text('Рабочий раздел', 'Workspace')));
    const name = node('strong', 'syntha-hub-card-name', item.title);
    const explanation = node('span', 'syntha-hub-card-description', item.description);
    const tail = node('span', 'syntha-hub-card-tail', text('Открыть раздел →', 'Open workspace →'));
    button.append(lead, name, explanation, tail);
    button.addEventListener('click', () => navigate(item.view));
    return button;
  }

  function summaryMetric(value, label, hint) {
    const element = node('div', 'syntha-hub-metric');
    element.append(node('span', 'syntha-hub-metric-label', label),
      node('strong', 'syntha-hub-metric-value', value),
      node('span', 'syntha-hub-metric-hint', hint));
    return element;
  }

  function render() {
    const shell = node('div', 'syntha-hub');
    shell.dataset.odsPart = 'workspace-hub';
    const groups = availableSections(typeof OD_V7_GROUPS !== 'undefined' ? OD_V7_GROUPS : [], state.workspace, global.SynthaUiCapabilities?.canOpenView);
    const entries = groups.flatMap((group) => group.entries);
    const rootHero = node('section', 'syntha-hub-hero');
    const heroCopy = node('div', 'syntha-hub-hero-copy');
    heroCopy.append(node('span', 'syntha-hub-eyebrow', 'SYNTHA / FASHION OPERATING SYSTEM'),
      node('h2', 'syntha-hub-headline', text('От модели до заказа. В одном пространстве.', 'From style to order. One connected workspace.')),
      node('p', 'syntha-hub-intro', text(
        'Начните с изделия, продолжите работу с материалами или откройте заказ. Разделы ниже ведут в действующие рабочие кабинеты, а не в макеты.',
        'Start with a style, continue with materials or open an order. Each section below leads to an existing workspace, not a mockup.',
      )));
    const heroActions = node('div', 'syntha-hub-hero-actions');
    const next = entries.find((item) => item.view === 'styles') || entries.find((item) => item.view === 'showrooms') || entries[0];
    if (next) {
      const button = node('button', 'syntha-hub-primary', text('Продолжить работу', 'Continue working') + ' →');
      button.type = 'button';
      button.addEventListener('click', () => navigate(next.view));
      heroActions.append(button);
    }
    if (global.SynthaAwaitingAction) {
      const action = node('button', 'syntha-hub-secondary', text('Ждёт вашего решения', 'Awaiting your action'));
      action.type = 'button';
      action.addEventListener('click', () => navigate('awaiting-action'));
      heroActions.append(action);
    }
    heroCopy.append(heroActions);
    rootHero.append(heroCopy);
    const metrics = node('div', 'syntha-hub-metrics');
    const records = state.workspace || {};
    const metricCount = (key) => {
      const values = Array.isArray(records[key]) ? records[key] : [];
      return `${values.length}${records.pageInfo?.truncatedSections?.includes(key) ? '+' : ''}`;
    };
    metrics.append(
      summaryMetric(entries.length, text('Рабочих разделов', 'Accessible workspaces'), text('По вашим полномочиям', 'Based on your access')),
      summaryMetric(metricCount('orders'), text('Заказов в рабочем наборе', 'Orders in workspace'), text('Из загруженных данных', 'Loaded records only')),
      summaryMetric(state.notificationUnreadCount || 0, text('Новых уведомлений', 'Unread notifications'), text('Требуют внимания', 'For your attention')),
    );
    rootHero.append(metrics);
    shell.append(rootHero);

    const accessible = new Map(entries.map((item) => [item.view, item]));
    const journeyItems = journeyViews.filter((view) => accessible.has(view)).map((view) => accessible.get(view));
    if (journeyItems.length > 1) {
      const section = node('section', 'syntha-hub-journey');
      section.append(node('span', 'syntha-hub-overline', text('ЕДИНЫЙ ПРОЦЕСС', 'ONE CONNECTED JOURNEY')),
        node('h3', 'syntha-hub-subtitle', text('Куда движется продукт', 'How a product moves forward')));
      const rail = node('div', 'syntha-hub-journey-rail');
      rail.setAttribute('aria-label', text('Этапы рабочего процесса', 'Workflow steps'));
      journeyItems.forEach((item, index) => {
        const button = node('button', 'syntha-hub-journey-stop');
        button.type = 'button';
        button.append(node('span', 'syntha-hub-journey-index', String(index + 1).padStart(2, '0')),
          node('span', 'syntha-hub-journey-label', item.title));
        button.addEventListener('click', () => navigate(item.view));
        rail.append(button);
      });
      section.append(rail);
      shell.append(section);
    }

    const directory = node('section', 'syntha-hub-directory');
    const top = node('div', 'syntha-hub-directory-top');
    const heading = node('div');
    heading.append(node('span', 'syntha-hub-overline', text('ВАШИ РАЗДЕЛЫ', 'YOUR WORKSPACES')),
      node('h3', 'syntha-hub-subtitle', text('Откройте нужную задачу', 'Choose where to work')));
    const search = node('input', 'syntha-hub-search');
    search.type = 'search';
    search.value = searchState.query;
    search.placeholder = text('Найти раздел или действие…', 'Find a workspace or action…');
    search.setAttribute('aria-label', text('Поиск по рабочим разделам', 'Search workspaces'));
    top.append(heading, search);
    directory.append(top);
    const sections = node('div', 'syntha-hub-sections');
    const emptyMessage = node('p', 'syntha-hub-no-matches', text('Нет разделов по этому запросу.', 'No matching workspaces.'));
    emptyMessage.hidden = true;
    for (const group of groups) {
      const groupNode = node('section', 'syntha-hub-group');
      groupNode.append(node('h4', 'syntha-hub-group-heading', group.title));
      const grid = node('div', 'syntha-hub-card-grid');
      group.entries.forEach((item) => grid.append(card(item)));
      groupNode.append(grid);
      sections.append(groupNode);
    }
    function applySearch(value) {
      searchState.query = value;
      const q = value.trim().toLocaleLowerCase();
      let shown = 0;
      sections.querySelectorAll('.syntha-hub-group').forEach((group) => {
        let matches = 0;
        group.querySelectorAll('.syntha-hub-card').forEach((button) => {
          const visible = !q || button.textContent.toLocaleLowerCase().includes(q);
          button.hidden = !visible;
          if (visible) matches += 1;
        });
        group.hidden = matches === 0;
        shown += matches;
      });
      emptyMessage.hidden = shown > 0;
    }
    search.addEventListener('input', () => applySearch(search.value));
    directory.append(sections, emptyMessage);
    shell.append(directory);
    const recent = node('section', 'syntha-hub-recent');
    recent.append(node('h3', 'syntha-hub-subtitle', text('Операционные показатели и последние события', 'Operational metrics and latest activity')));
    // Keep established live data panels instead of replacing them with fake dashboard data.
    recent.append(previousRenderOverview());
    shell.append(recent);
    applySearch(searchState.query);
    return shell;
  }
  const previousRenderOverview = renderOverview;
  renderOverview = render;
  global.SynthaWorkspaceHub = Object.freeze({ availableSections, navigate });
})(window);
