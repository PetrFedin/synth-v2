(function installBomWorkspace() {
  'use strict';

  const core = window.SynthaBomCore;
  if (!core) throw new Error('SynthaBomCore must load before bom.js');

  const ui = window.SynthaBomUi || (window.SynthaBomUi = {
    items: [], nextCursor: null, loaded: false, loading: false, error: null,
    tab: 'registry', selectedSku: null, requestSequence: 0,
  });

  const nav = typeof OD_V6_GROUPS === 'undefined' ? null : OD_V6_GROUPS
    .flatMap((group) => group.items)
    .find((item) => String(item.en || '').includes('BOM'));
  if (nav) {
    nav.view = 'boms';
    nav.ru = 'BOM и себестоимость';
    nav.en = 'BOM and Costing';
    nav.planned = false;
  }

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function h(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') element.className = value;
      else if (key === 'text') element.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'disabled') element.disabled = Boolean(value);
      else element.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === undefined || child === null) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }

  function brandOrganisationIds() {
    const brands = new Set((state.workspace.organisations || []).filter((item) => item.type === 'brand').map((item) => item.id));
    return new Set((state.workspace.memberships || [])
      .filter((item) => item.status === 'active' && brands.has(item.organisationId))
      .map((item) => item.organisationId));
  }
  function canReadBrand(brandId) {
    return (state.workspace.memberships || []).some((item) => item.status === 'active' && item.organisationId === brandId && ['owner', 'admin', 'finance'].includes(item.role));
  }
  function canManageBrand(brandId) {
    return (state.workspace.memberships || []).some((item) => item.status === 'active' && item.organisationId === brandId && ['owner', 'admin'].includes(item.role));
  }
  function canManageAnyBrand() {
    const brandIds = brandOrganisationIds();
    return (state.workspace.memberships || []).some((item) => item.status === 'active' && brandIds.has(item.organisationId) && ['owner', 'admin'].includes(item.role));
  }

  async function loadBoms({ reset = true } = {}) {
    if (ui.loading) return;
    ui.loading = true;
    ui.error = null;
    const sequence = ++ui.requestSequence;
    if (reset) { ui.items = []; ui.nextCursor = null; }
    try {
      const query = new URLSearchParams({ limit: '200' });
      if (!reset && ui.nextCursor) query.set('cursor', ui.nextCursor);
      const page = await api(`/v2/boms?${query.toString()}`);
      if (sequence !== ui.requestSequence) return;
      const current = new Map(ui.items.map((item) => [item.sku, item]));
      for (const item of page.items || []) current.set(item.sku, item);
      ui.items = [...current.values()];
      ui.nextCursor = page.nextCursor || null;
      ui.loaded = true;
    } catch (error) {
      if (sequence === ui.requestSequence) ui.error = error?.message || String(error);
    } finally {
      if (sequence === ui.requestSequence) {
        ui.loading = false;
        renderApp();
      }
    }
  }

  function nextLineId(lines) {
    const used = new Set((lines || []).map((line) => line?.lineId));
    let index = used.size + 1;
    while (used.has(`LINE-${index}`)) index += 1;
    return `LINE-${index}`;
  }

  // Two kinds of number wear the same currency sign and should not be printed the same way. A cost
  // total is money — «43,58 €» — and printing it as «43,5808 €» makes a correct figure look like a
  // rounding error nobody caught. A line's rate is not money but a price per metre or per piece, and
  // its trailing digits are the reason the total is what it is, so it keeps them.
  //
  // The locale was also read through `I18N.locale()`, which does not exist: the call returned
  // undefined, never matched 'en', and every amount in this section stayed Russian-formatted in the
  // English interface.
  function moneyValue(value, currency, { rate = false } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    const digits = rate ? 4 : 2;
    try {
      return new Intl.NumberFormat(I18N.localeTag(), {
        style: 'currency', currency: currency || 'EUR',
        minimumFractionDigits: 2, maximumFractionDigits: digits,
      }).format(number);
    } catch { return `${number.toFixed(digits)} ${currency || ''}`.trim(); }
  }
  function riskLabel(code) {
    const labels = {
      SKU_NOT_IN_WORKSPACE: ['SKU отсутствует в рабочем контуре', 'SKU is outside the workspace'],
      SKU_BRAND_MISMATCH: ['Бренд BOM не совпадает с SKU', 'BOM brand differs from SKU'],
      NO_BOM_LINES: ['Нет строк материалов', 'No material lines'],
      TOO_MANY_LINES: ['Превышен лимит строк', 'Line limit exceeded'],
      INVALID_MATERIAL_COST: ['Некорректная стоимость материалов', 'Invalid material cost'],
      INVALID_TOTAL_COST: ['Некорректная полная себестоимость', 'Invalid total cost'],
      INVALID_DIRECT_COST: ['Некорректные прямые расходы', 'Invalid direct cost'],
      TOTAL_BELOW_MATERIAL: ['Итог ниже стоимости материалов', 'Total below material cost'],
      DUPLICATE_LINE_ID: ['Дубли строк BOM', 'Duplicate BOM lines'],
      INVALID_LINE_QUANTITY: ['Некорректное количество', 'Invalid line quantity'],
      INVALID_COST_SNAPSHOT: ['Некорректный cost snapshot', 'Invalid cost snapshot'],
      BOM_NOT_PUBLISHED: ['BOM не опубликован', 'BOM is not published'],
      SKU_NOT_PUBLISHED: ['SKU не опубликован', 'SKU is not published'],
    };
    const pair = labels[code] || [code, code];
    return text(pair[0], pair[1]);
  }
  function badge(value, tone) { return h('span', { className: `bom-badge bom-${tone}`, text: value }); }
  function progress(value) {
    const normalized = Math.max(0, Math.min(100, Number(value) || 0));
    const bar = h('progress', { className: 'bom-progress-track', max: '100', value: String(normalized), 'aria-label': text('Готовность', 'Readiness') });
    return h('div', { className: 'bom-readiness' }, [bar, h('strong', { text: `${value}%` })]);
  }

  function header(summary) {
    const actions = [];
    if (canManageAnyBrand()) actions.push(h('button', { className: 'primary', type: 'button', text: text('Создать BOM', 'Create BOM'), onclick: () => openEditorReporting(null) }));
    actions.push(h('button', { className: 'secondary', type: 'button', text: text('Обновить', 'Refresh'), disabled: ui.loading, onclick: () => { loadBoms({ reset: true }).then(() => toast(text('\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b.', 'Data refreshed.'))).catch((error) => toast(error?.message || text('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435.', 'The data could not be refreshed.'), 'error')); } }));
    return h('header', { className: 'bom-header' }, [
      h('div', {}, [h('p', { className: 'eyebrow', text: 'PLM / COSTING' }), h('h1', { text: text('BOM и производственная себестоимость', 'BOM and production costing') }), h('p', { className: 'muted', text: text('Версионируемые спецификации материалов, snapshot цен, FX и полная воспроизводимая себестоимость изделия.', 'Versioned material specifications, price snapshots, FX and reproducible product cost.') })]),
      h('div', { className: 'bom-header-actions' }, actions),
      h('div', { className: 'bom-kpis' }, [
        metric(text('Всего BOM', 'Total BOMs'), summary.total), metric(text('Черновики', 'Drafts'), summary.draft), metric(text('Опубликовано', 'Published'), summary.published), metric(text('Критические', 'Critical'), summary.critical), metric(text('Средняя готовность', 'Average readiness'), `${summary.averageReadiness}%`), metric(text('Средняя себестоимость', 'Average total cost'), moneyValue(summary.averageTotalCost, ui.items[0]?.currency || 'EUR')),
      ]),
    ]);
  }
  function metric(label, value) { return h('div', { className: 'bom-kpi' }, [h('span', { text: label }), h('strong', { text: value })]); }
  function tabs() {
    const entries = [['registry', text('Реестр', 'Registry')], ['costing', text('Структура затрат', 'Cost structure')], ['exceptions', text('Исключения', 'Exceptions')]];
    return h('div', { className: 'bom-tabs', role: 'tablist' }, entries.map(([id, label]) => h('button', { type: 'button', role: 'tab', className: ui.tab === id ? 'active' : '', 'aria-selected': ui.tab === id, text: label, onclick: () => { ui.tab = id; renderApp(); } })));
  }

  function table(registry) {
    let items = registry.items;
    if (ui.tab === 'exceptions') items = items.filter((item) => item.risks.length);
    const body = items.map((item) => {
      const selected = ui.selectedSku === item.bom.sku;
      const row = h('tr', { className: selected ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: item.bom.sku }), h('small', { text: item.sku?.name || '' })]),
        h('td', {}, [badge(item.bom.status, item.bom.status === 'published' ? 'ok' : 'neutral')]),
        h('td', {}, [progress(item.readiness)]),
        h('td', { text: item.bom.lines.length }),
        h('td', { text: moneyValue(item.bom.materialCost, item.bom.currency) }),
        h('td', { text: moneyValue(item.bom.totalCost, item.bom.currency) }),
        h('td', {}, [badge(item.risks.length ? riskLabel(item.risks[0].code) : text('Готово', 'Ready'), item.highestRisk)]),
      ]);
      row.addEventListener('click', () => { ui.selectedSku = item.bom.sku; renderApp(); });
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ui.selectedSku = item.bom.sku; renderApp(); } });
      return row;
    });
    if (!body.length) body.push(h('tr', {}, [h('td', { colspan: '7', className: 'bom-empty', text: ui.loading ? text('Загрузка…', 'Loading…') : text('Нет данных для выбранного режима.', 'No data for this view.') })]));
    return h('div', { className: 'bom-table-wrap' }, [h('table', { className: 'bom-table' }, [
      h('thead', {}, [h('tr', {}, [text('SKU / модель', 'SKU / style'), text('Статус', 'Status'), text('Готовность', 'Readiness'), text('Строки', 'Lines'), text('Материалы', 'Materials'), text('Итого', 'Total'), text('Риск', 'Risk')].map((label) => h('th', { text: label })))]),
      h('tbody', {}, body),
    ])]);
  }

  function costing(registry) {
    return h('div', { className: 'bom-cost-grid' }, registry.items.map((item) => h('article', { className: 'bom-cost-card' }, [
      h('div', { className: 'bom-cost-card-head' }, [h('strong', { text: item.bom.sku }), badge(item.bom.status, item.bom.status === 'published' ? 'ok' : 'neutral')]),
      h('dl', {}, [
        pair(text('Материалы', 'Materials'), moneyValue(item.bom.materialCost, item.bom.currency)), pair(text('Труд', 'Labor'), moneyValue(item.bom.laborCost, item.bom.currency)), pair(text('Накладные', 'Overhead'), moneyValue(item.bom.overheadCost, item.bom.currency)), pair(text('Логистика', 'Logistics'), moneyValue(item.bom.logisticsCost, item.bom.currency)), pair(text('Прочее', 'Other'), moneyValue(item.bom.otherCost, item.bom.currency)), pair(text('Итого', 'Total'), moneyValue(item.bom.totalCost, item.bom.currency)),
      ]),
    ])));
  }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value })]); }

  // A bill read the way a factory reads it: by kind, with the count of each, the principal material
  // of its kind called out, and every line saying where on the garment it goes.
  //
  // A flat list of eleven lines is a list of eleven lines. Omnidata groups them — Fabric : 3,
  // Trims : 1, Labels : 1, Packaging : 2 — and the count is the thing a person checks first,
  // because "three fabrics" is either right or obviously wrong at a glance.
  const MATERIAL_GROUPS = [
    ['fabric', ['Ткани', 'Fabric']],
    ['trim', ['Фурнитура', 'Trims']],
    ['packaging', ['Упаковка', 'Packaging']],
    ['other', ['Прочее', 'Other']],
  ];
  function materialGroupLabel(type) {
    const found = MATERIAL_GROUPS.find(([key]) => key === type);
    return found ? text(found[1][0], found[1][1]) : type;
  }
  function lineGroups(item) {
    const lines = Array.isArray(item.bom.lines) ? item.bom.lines : [];
    const known = MATERIAL_GROUPS.map(([key]) => key);
    const order = [...known, ...[...new Set(lines.map((line) => line.materialType))].filter((type) => !known.includes(type))];
    const root = h('div', { className: 'bom-line-list' });
    order.forEach((type) => {
      const group = lines.filter((line) => line.materialType === type);
      if (!group.length) return;
      root.append(h('div', { className: 'bom-line-group' }, [
        h('span', { className: 'bom-line-group-name', text: materialGroupLabel(type) }),
        h('span', { className: 'bom-line-group-count', text: String(group.length) }),
      ]));
      group.forEach((line) => root.append(lineView(line, item.bom.currency)));
    });
    if (!lines.length) root.append(h('p', { className: 'muted', text: text('В спецификации нет строк.', 'This bill has no lines.') }));
    return root;
  }
  function efficiencyText(line) {
    const efficiency = core.efficiencyBasisPoints(line);
    if (efficiency === null) return '';
    // \u0412\u0441\u0435 \u0442\u0440\u0438 \u0447\u0438\u0441\u043b\u0430 \u043f\u0440\u043e\u0445\u043e\u0434\u044f\u0442 \u0447\u0435\u0440\u0435\u0437 \u043e\u0434\u0438\u043d \u0444\u043e\u0440\u043c\u0430\u0442\u0442\u0435\u0440: \u0441\u044b\u0440\u043e\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442 \u0442\u043e\u0447\u043a\u0443, \u0438 \u00ab2.1 m\u00bb
    // \u0432\u0441\u0442\u0430\u0432\u0430\u043b\u043e \u0440\u044f\u0434\u043e\u043c \u0441 \u00ab93,5 %\u00bb \u043d\u0430 \u043e\u0434\u043d\u043e\u043c \u044d\u043a\u0440\u0430\u043d\u0435.
    const number = (value, digits) => I18N.formatNumber(value, { maximumFractionDigits: digits });
    return text(
      `\u043d\u0435\u0442\u0442\u043e ${number(line.quantity, 4)} ${line.unit} \u00b7 \u043e\u0442\u0445\u043e\u0434\u044b ${number(line.wastePercent, 2)} % \u00b7 \u0432\u044b\u0445\u043e\u0434 ${I18N.formatNumber(efficiency / 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
      `net ${number(line.quantity, 4)} ${line.unit} \u00b7 waste ${number(line.wastePercent, 2)} % \u00b7 yield ${I18N.formatNumber(efficiency / 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
  }

  function lineView(line, currency) {
    const head = h('div', { className: 'bom-line-head' }, [h('strong', { text: line.component })]);
    // The principal material of its kind, which is what a care label, a customs declaration and a
    // composition statement each name. At most one per kind, and the database holds that rule.
    if (line.isMain) head.append(h('span', { className: 'bom-line-main', text: text('основной', 'main') }));
    const view = h('div', { className: 'bom-line-view' }, [
      head,
      h('span', { text: `${line.materialCode} \u00b7 ${I18N.formatNumber(line.grossQuantity, { maximumFractionDigits: 4 })} ${line.unit}` }),
      // \u041d\u0435\u0442\u0442\u043e, \u0431\u0440\u0443\u0442\u0442\u043e \u0438 \u0432\u044b\u0445\u043e\u0434 \u0440\u044f\u0434\u043e\u043c: \u043e\u0434\u043d\u0430 \u0446\u0438\u0444\u0440\u0430 \u0431\u0440\u0443\u0442\u0442\u043e \u043d\u0435 \u0433\u043e\u0432\u043e\u0440\u0438\u0442, \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0438\u0437 \u043d\u0435\u0451 \u0441\u0442\u0430\u043d\u0435\u0442 \u0438\u0437\u0434\u0435\u043b\u0438\u0435\u043c,
      // \u0430 \u0438\u043c\u0435\u043d\u043d\u043e \u044d\u0442\u043e \u0447\u0438\u0441\u043b\u043e \u0437\u0430\u043a\u0443\u043f\u043a\u0430 \u0438 \u0441\u0440\u0430\u0432\u043d\u0438\u0432\u0430\u0435\u0442 \u0441 \u0444\u0430\u043a\u0442\u043e\u043c \u0440\u0430\u0441\u043a\u0440\u043e\u044f.
      efficiencyText(line) ? h('small', { className: 'bom-line-efficiency', text: efficiencyText(line) }) : null,
      h('span', { text: moneyValue(line.lineCost, currency, { rate: true }) }),
    ]);
    // Where it goes on the garment. Without it a bill is a shopping list: it says a shell and a
    // lining are needed and leaves the factory to guess which goes where.
    if (line.placement) view.append(h('small', { className: 'bom-line-placement', text: line.placement }));
    return view;
  }

  function inspector(registry) {
    const item = registry.items.find((candidate) => candidate.bom.sku === ui.selectedSku) || registry.items[0];
    if (!item) return h('aside', { className: 'bom-inspector' }, [h('p', { className: 'muted', text: text('Выберите BOM для просмотра деталей.', 'Select a BOM to inspect.') })]);
    const actions = [];
    if (canManageBrand(item.bom.brandId) && item.bom.status === 'draft') {
      actions.push(h('button', { type: 'button', className: 'secondary', text: text('Редактировать', 'Edit'), onclick: () => openEditorReporting(item.bom) }));
      actions.push(h('button', { type: 'button', className: 'primary', text: text('Опубликовать', 'Publish'), disabled: !item.publishReady, onclick: () => publish(item.bom) }));
    }
    return h('aside', { className: 'bom-inspector' }, [
      h('div', { className: 'bom-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: item.bom.sku }), h('h2', { text: item.sku?.name || item.bom.sku })]), h('div', { className: 'bom-inspector-actions' }, actions)]),
      h('div', { className: 'bom-summary' }, [pair(text('Версия', 'Version'), item.bom.version), pair(text('Валюта', 'Currency'), item.bom.currency), pair(text('Строки', 'Lines'), item.bom.lines.length), pair(text('Полная себестоимость', 'Total cost'), moneyValue(item.bom.totalCost, item.bom.currency))]),
      h('h3', { text: text('Материалы и компоненты', 'Materials and components') }),
      lineGroups(item),
      h('h3', { text: text('Контрольные исключения', 'Control exceptions') }),
      h('div', { className: 'bom-risk-list' }, item.risks.length ? item.risks.map((entry) => h('div', { className: `bom-risk bom-${entry.severity}` }, [badge(entry.severity, entry.severity), h('span', { text: riskLabel(entry.code) })])) : [h('p', { className: 'muted', text: text('Критических исключений нет.', 'No critical exceptions.') })]),
    ]);
  }

  function renderBoms() {
    // See materials.js: retrying a failed load from render starves the event loop.
    if (!ui.loaded && !ui.loading && !ui.error) queueMicrotask(() => loadBoms({ reset: true }));
    const registry = core.buildRegistry(ui.items, state.workspace.catalogSkus || []);
    return h('section', { className: 'bom-page' }, [
      header(registry.summary),
      ui.error ? h('div', { className: 'bom-error', role: 'alert', text: ui.error }) : null,
      tabs(),
      h('div', { className: 'bom-layout' }, [h('main', {}, [ui.tab === 'costing' ? costing(registry) : table(registry), ui.nextCursor ? h('button', { className: 'secondary bom-load-more', type: 'button', disabled: ui.loading, text: text('Загрузить ещё', 'Load more'), onclick: () => loadBoms({ reset: false }) }) : null]), inspector(registry)]),
    ]);
  }

  function errorText(error) {
    const code = error && error.code ? riskLabel(error.code) : '';
    return (error && error.message) || code || text('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435.', 'The action failed.');
  }

  async function publish(bom) {
    const accepted = await confirmAction({
      title: text('Опубликовать спецификацию', 'Publish BOM'),
      question: text(`${bom.sku}: после публикации редактирование будет закрыто.`, `${bom.sku}: editing is locked once it is published.`),
      confirmLabel: text('Опубликовать', 'Publish'),
    });
    if (!accepted) return;
    // \u041f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u044f \u2014 \u0441\u0430\u043c\u043e\u0435 \u043d\u0435\u043e\u0431\u0440\u0430\u0442\u0438\u043c\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0432 \u043c\u043e\u0434\u0443\u043b\u0435, \u0438 \u0434\u043e \u044d\u0442\u043e\u0439 \u043f\u0440\u0430\u0432\u043a\u0438 \u0435\u0451 \u043e\u0442\u043a\u0430\u0437 \u0443\u0445\u043e\u0434\u0438\u043b \u0432
    // \u043d\u0435\u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u043d\u043e\u0435 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0435 \u043f\u0440\u043e\u043c\u0438\u0441\u0430: \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u0443\u0437\u043d\u0430\u0432\u0430\u043b \u043d\u0438 \u043e\u0431 \u0443\u0441\u043f\u0435\u0445\u0435, \u043d\u0438 \u043e \u043f\u0440\u043e\u0432\u0430\u043b\u0435.
    try {
      await mutate(`/v2/boms/${encodeURIComponent(bom.sku)}/publish`, { expectedVersion: bom.version });
    } catch (error) {
      toast(errorText(error), 'error');
      return;
    }
    await loadBoms({ reset: true });
    // Publishing closes the BOM for editing. Doing that silently leaves the reader unsure whether it
    // happened at all, while the revision action next to it does say so.
    toast(text(`\u0421\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f ${bom.sku} \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u0430.`, `BOM ${bom.sku} published.`));
  }

  async function fetchPublishedMaterials() {
    const materials = new Map();
    const seenCursors = new Set();
    let cursor = null;
    let pageCount = 0;
    do {
      pageCount += 1;
      if (pageCount > 500) throw new Error(text('Справочник материалов превысил безопасный предел загрузки.', 'Material Master exceeded the safe page limit.'));
      const query = new URLSearchParams({ limit: '200', status: 'published' });
      if (cursor) query.set('cursor', cursor);
      const page = await api(`/v2/materials?${query.toString()}`);
      for (const item of page.items || []) materials.set(item.code, item);
      const nextCursor = page.nextCursor || null;
      if (nextCursor && seenCursors.has(nextCursor)) throw new Error(text('Справочник материалов вернул циклический курсор.', 'Material Master returned a cyclic cursor.'));
      if (nextCursor) seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
    return [...materials.values()];
  }
  async function openEditor(existing) {
    const materials = await fetchPublishedMaterials();
    const brandId = existing?.brandId || [...brandOrganisationIds()].find((id) => canManageBrand(id));
    const published = (state.workspace.catalogSkus || []).filter((item) => item.brandId === brandId && item.status === 'published');
    // Every SKU in the register already had a bill of materials, so every choice this dialog offered
    // ended at «BOM already exists for SKU» — a form that can only fail. It offers the SKUs that can
    // actually take one, and says so plainly when there are none left.
    const taken = new Set((ui.items || []).map((entry) => entry?.bom?.sku ?? entry?.sku).filter(Boolean));
    const skus = existing ? published : published.filter((item) => !taken.has(item.sku));
    if (!existing && !skus.length) {
      // Two different situations end with nothing to choose from, and sending the reader to the same
      // place for both wastes their time: one needs a SKU published, the other needs a SKU.
      const drafts = (state.workspace.catalogSkus || []).filter((item) => item.brandId === brandId && item.status !== 'published').length;
      toast(published.length
        ? text(
          'У каждого опубликованного артикула уже есть спецификация. Откройте существующую или опубликуйте новый артикул.',
          'Every published SKU already has a bill of materials. Open an existing one, or publish another SKU.',
        )
        : drafts
          ? text(
            'Спецификация заводится на опубликованный артикул. Опубликуйте его в разделе «Коллекции».',
            'A bill of materials is written against a published SKU. Publish one in Collections first.',
          )
          : text(
            'Сначала создайте артикул в разделе «Коллекции».',
            'Create a SKU in Collections first.',
          ), 'error');
      return;
    }
    const model = {
      sku: existing?.sku || skus[0]?.sku || '', currency: existing?.currency || skus[0]?.currency || 'EUR',
      laborCost: existing?.laborCost ?? 0, overheadCost: existing?.overheadCost ?? 0, logisticsCost: existing?.logisticsCost ?? 0, otherCost: existing?.otherCost ?? 0,
      notes: existing?.notes || '',
      lines: (existing?.lines || [{ lineId: 'LINE-1', component: '', materialCode: materials[0]?.code || '', quantity: 1, wastePercent: 0, exchangeRate: 1 }]).map((line) => ({ lineId: line.lineId, component: line.component, materialCode: line.materialCode, quantity: line.quantity, wastePercent: line.wastePercent, exchangeRate: line.exchangeRate ?? 1 })),
    };
    showEditor({ existing, materials, skus, model });
  }

  // Открытие редактора читает справочник материалов и каталог, и обе загрузки могут отказать.
  // Обработчик `onclick` возвращённый промис не ждёт, поэтому отказ уходил в необработанное
  // отклонение: кнопка нажата, не происходит ничего, причина не названа.
  function openEditorReporting(existing) {
    return openEditor(existing).catch((error) => toast(
      error?.message || text('Не удалось открыть редактор.', 'The editor could not be opened.'), 'error'));
  }

  const BOM_ERRORS = {
    BOM_ALREADY_EXISTS: ['У этого артикула уже есть спецификация — откройте её и отредактируйте.', 'This SKU already has a bill of materials — open it and edit instead.'],
    BOM_NOT_EDITABLE: ['Опубликованную спецификацию нельзя изменить. Заведите новую версию.', 'A published bill of materials cannot be changed. Start a new version.'],
    BOM_LINE_ID_DUPLICATE: ['Два номера строки совпадают.', 'Two line numbers are the same.'],
    MATERIAL_NOT_PUBLISHED: ['Материал не опубликован и не может войти в спецификацию.', 'That material is not published and cannot go into a bill of materials.'],
    CATALOG_SKU_NOT_FOUND: ['Артикул не найден.', 'The SKU was not found.'],
    BOM_CONCURRENCY_CONFLICT: ['Спецификацию изменил кто-то ещё — обновите раздел и повторите.', 'Someone else changed this bill of materials — refresh and try again.'],
  };
  function bomErrorMessage(error) {
    const pair = BOM_ERRORS[String(error?.code || '')];
    return pair ? text(pair[0], pair[1]) : (error?.message || text('Не удалось сохранить спецификацию.', 'The bill of materials could not be saved.'));
  }

  function showEditor({ existing, materials, skus, model }) {
    const overlay = h('div', { className: 'bom-modal-overlay' });
    // Оверлей закрывается четырьмя путями: крестик, «Отмена», щелчок мимо и успешное сохранение, а
    // обработчик Escape снимал себя только на пятом — на самом Escape. Каждое закрытие любым из остальных
    // оставляло на `document` ещё один слушатель, держащий ссылку на весь оторванный диалог. Закрытие теперь
    // одно для всех путей.
    function onEscape(event) { if (event.key === 'Escape') closeEditor(); }
    function closeEditor() { overlay.remove(); document.removeEventListener('keydown', onEscape); }

    const problem = h('p', { className: 'bom-modal-error', hidden: true });
    const dialog = h('form', { className: 'bom-modal', role: 'dialog', 'aria-modal': 'true' });
    const linesRoot = h('div', { className: 'bom-editor-lines' });
    // Naming the principal material is a choice between the lines of one kind, so the control
    // clears the others of that kind rather than letting a person set two and be refused on save.
    // The rule is the database's; this only keeps the form from being able to break it.
    function materialTypeOf(line) {
      const found = materials.find((item) => item.code === line.materialCode);
      return found?.type || null;
    }
    function mainToggle(line, material, redraw) {
      const wrap = h('label', { className: 'bom-main-toggle' });
      const box = h('input', { type: 'checkbox' });
      box.checked = line.isMain === true;
      box.addEventListener('change', () => {
        const type = material?.type || null;
        if (box.checked && type) model.lines.forEach((other) => { if (other !== line && materialTypeOf(other) === type) other.isMain = false; });
        line.isMain = box.checked;
        redraw();
      });
      wrap.append(box, h('span', { text: text('Основной', 'Main') }));
      return wrap;
    }
    function renderLines() {
      linesRoot.replaceChildren();
      model.lines.forEach((line, index) => {
        const material = materials.find((item) => item.code === line.materialCode);
        const row = h('div', { className: 'bom-editor-line' }, [
          field(text('ID строки', 'Line ID'), input('text', line.lineId, (value) => { line.lineId = value.toUpperCase(); }, { required: true, maxlength: '32', pattern: '[A-Za-z0-9._-]{1,32}' })),
          field(text('Компонент', 'Component'), input('text', line.component, (value) => { line.component = value; }, { required: true, minlength: '2', maxlength: '120' })),
          field(text('Материал', 'Material'), select(materials.map((item) => [item.code, `${item.code} · ${item.name}`]), line.materialCode, (value) => { line.materialCode = value; renderLines(); })),
          field(text('Количество', 'Quantity'), input('number', line.quantity, (value) => { line.quantity = value; }, { step: '0.0001', min: '0.0001', required: true })),
          field(text('Отход, %', 'Waste, %'), input('number', line.wastePercent, (value) => { line.wastePercent = value; }, { step: '0.0001', min: '0', max: '1000' })),
          field(text('FX', 'FX'), input('number', line.exchangeRate, (value) => { line.exchangeRate = value; }, { step: '0.0001', min: '0.0001', disabled: material?.currency === model.currency })),
          field(text('Где применён', 'Placement'), input('text', line.placement || '', (value) => { line.placement = value; }, { maxlength: '400', placeholder: text('Рукава, планка, воротник', 'Sleeves, placket, collar') })),
          mainToggle(line, material, renderLines),
          h('button', { type: 'button', className: 'danger-link', text: text('Удалить', 'Remove'), disabled: model.lines.length === 1, onclick: () => { model.lines.splice(index, 1); renderLines(); } }),
        ]);
        linesRoot.append(row);
      });
    }
    renderLines();
    dialog.append(
      h('div', { className: 'bom-modal-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: 'BOM / COSTING' }), h('h2', { text: existing ? text(`Редактировать ${existing.sku}`, `Edit ${existing.sku}`) : text('Создать BOM', 'Create BOM') })]), h('button', { type: 'button', className: 'icon-button', 'aria-label': text('Закрыть', 'Close'), text: '×', onclick: () => closeEditor() })]),
      h('div', { className: 'bom-editor-grid' }, [
        field('SKU', select(skus.map((item) => [item.sku, `${item.sku} · ${item.name}`]), model.sku, (value) => { model.sku = value; }, { disabled: Boolean(existing), required: true })),
        field(text('Валюта', 'Currency'), input('text', model.currency, (value) => { model.currency = value.toUpperCase(); renderLines(); }, { maxlength: '3', minlength: '3', required: true, pattern: '[A-Za-z]{3}' })),
        field(text('Труд', 'Labor'), input('number', model.laborCost, (value) => { model.laborCost = value; }, { step: '0.0001', min: '0', required: true })),
        field(text('Накладные', 'Overhead'), input('number', model.overheadCost, (value) => { model.overheadCost = value; }, { step: '0.0001', min: '0', required: true })),
        field(text('Логистика', 'Logistics'), input('number', model.logisticsCost, (value) => { model.logisticsCost = value; }, { step: '0.0001', min: '0', required: true })),
        field(text('Прочее', 'Other'), input('number', model.otherCost, (value) => { model.otherCost = value; }, { step: '0.0001', min: '0', required: true })),
      ]),
      h('div', { className: 'bom-editor-section-head' }, [h('h3', { text: text('Строки материалов', 'Material lines') }), h('button', { type: 'button', className: 'secondary', text: text('Добавить строку', 'Add line'), onclick: () => { model.lines.push({ lineId: nextLineId(model.lines), component: '', materialCode: materials[0]?.code || '', quantity: 1, wastePercent: 0, exchangeRate: 1, placement: '', isMain: false }); renderLines(); } })]),
      linesRoot,
      field(text('Примечания', 'Notes'), textarea(model.notes, (value) => { model.notes = value; })),
      problem,
      h('div', { className: 'bom-modal-actions' }, [h('button', { type: 'button', className: 'secondary', text: text('Отмена', 'Cancel'), onclick: () => closeEditor() }), h('button', { type: 'submit', className: 'primary', text: text('Сохранить', 'Save') })]),
    );
    dialog.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        currency: model.currency,
        lines: model.lines.map((line) => ({ lineId: String(line.lineId).trim().toUpperCase(), component: String(line.component).trim(), materialCode: line.materialCode, quantity: Number(line.quantity), wastePercent: Number(line.wastePercent), exchangeRate: Number(line.exchangeRate) })),
        laborCost: Number(model.laborCost), overheadCost: Number(model.overheadCost), logisticsCost: Number(model.logisticsCost), otherCost: Number(model.otherCost), notes: model.notes.trim() || null,
      };
      // Without this the save failed as an unhandled rejection: the dialog stayed open, nothing was
      // written, and the person was told nothing at all.
      try {
        if (existing) await mutate(`/v2/boms/${encodeURIComponent(existing.sku)}`, { expectedVersion: existing.version, ...payload }, 'PATCH');
        else await mutate('/v2/boms', { sku: model.sku, ...payload });
      } catch (error) {
        problem.textContent = bomErrorMessage(error);
        problem.hidden = false;
        problem.scrollIntoView({ block: 'nearest' });
        return;
      }
      closeEditor();
      // Saving said nothing at all here, while every other create action in the application
      // confirms itself. A form that closes in silence leaves the reader checking the table to find
      // out whether anything happened.
      toast(existing
        ? text('Спецификация сохранена.', 'The bill of materials is saved.')
        : text('Спецификация создана.', 'The bill of materials is created.'), 'success');
      await loadBoms({ reset: true });
    });
    overlay.append(dialog);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) closeEditor(); });
    // A hand-rolled overlay gets none of a <dialog>'s behaviour for free, and Escape is the one a
    // person reaches for without thinking.
    document.addEventListener('keydown', onEscape);
    document.body.append(overlay);
    dialog.querySelector('input,select,button')?.focus();
  }
  function field(label, control) { return h('label', { className: 'bom-field' }, [h('span', { text: label }), control]); }
  function input(type, value, setter, extra = {}) {
    const control = h('input', { type, value: value ?? '', ...extra });
    control.value = value ?? '';
    control.addEventListener('input', () => setter(control.value));
    return control;
  }
  function textarea(value, setter) {
    const control = h('textarea', { rows: '3', maxlength: '2000' });
    control.value = value || '';
    control.addEventListener('input', () => setter(control.value));
    return control;
  }
  function select(options, value, setter, extra = {}) {
    const control = h('select', extra, options.map(([optionValue, label]) => h('option', { value: optionValue, text: label })));
    control.value = value || '';
    control.addEventListener('change', () => setter(control.value));
    return control;
  }

  const previousRenderView = renderView;
  renderView = (...args) => state.view === 'boms' ? renderBoms() : previousRenderView(...args);
  const previousViewTitle = viewTitle;
  viewTitle = (view) => view === 'boms' ? text('BOM и себестоимость', 'BOM and Costing') : previousViewTitle(view);
  const previousViewSectionName = viewSectionName;
  viewSectionName = (view) => view === 'boms' ? 'PLM / COSTING' : previousViewSectionName(view);
})();