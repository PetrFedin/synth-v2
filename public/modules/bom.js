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

  function moneyValue(value, currency) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    try { return new Intl.NumberFormat(currentLocale?.() === 'en' ? 'en-GB' : 'ru-RU', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 4 }).format(number); }
    catch { return `${number.toFixed(4)} ${currency || ''}`.trim(); }
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
    const bar = h('span', { className: 'bom-progress-value' });
    bar.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
    return h('div', { className: 'bom-readiness' }, [h('span', { className: 'bom-progress-track' }, [bar]), h('strong', { text: `${value}%` })]);
  }

  function header(summary) {
    const actions = [];
    if (canManageAnyBrand()) actions.push(h('button', { className: 'primary', type: 'button', text: text('Создать BOM', 'Create BOM'), onclick: () => openEditor(null) }));
    actions.push(h('button', { className: 'secondary', type: 'button', text: text('Обновить', 'Refresh'), disabled: ui.loading, onclick: () => loadBoms({ reset: true }) }));
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

  function inspector(registry) {
    const item = registry.items.find((candidate) => candidate.bom.sku === ui.selectedSku) || registry.items[0];
    if (!item) return h('aside', { className: 'bom-inspector' }, [h('p', { className: 'muted', text: text('Выберите BOM для просмотра деталей.', 'Select a BOM to inspect.') })]);
    const actions = [];
    if (canManageBrand(item.bom.brandId) && item.bom.status === 'draft') {
      actions.push(h('button', { type: 'button', className: 'secondary', text: text('Редактировать', 'Edit'), onclick: () => openEditor(item.bom) }));
      actions.push(h('button', { type: 'button', className: 'primary', text: text('Опубликовать', 'Publish'), disabled: !item.publishReady, onclick: () => publish(item.bom) }));
    }
    return h('aside', { className: 'bom-inspector' }, [
      h('div', { className: 'bom-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: item.bom.sku }), h('h2', { text: item.sku?.name || item.bom.sku })]), h('div', { className: 'bom-inspector-actions' }, actions)]),
      h('div', { className: 'bom-summary' }, [pair(text('Версия', 'Version'), item.bom.version), pair(text('Валюта', 'Currency'), item.bom.currency), pair(text('Строки', 'Lines'), item.bom.lines.length), pair(text('Полная себестоимость', 'Total cost'), moneyValue(item.bom.totalCost, item.bom.currency))]),
      h('h3', { text: text('Материалы и компоненты', 'Materials and components') }),
      h('div', { className: 'bom-line-list' }, item.bom.lines.map((line) => h('div', { className: 'bom-line-view' }, [h('strong', { text: line.component }), h('span', { text: `${line.materialCode} · ${line.grossQuantity} ${line.unit}` }), h('span', { text: moneyValue(line.lineCost, item.bom.currency) })]))),
      h('h3', { text: text('Контрольные исключения', 'Control exceptions') }),
      h('div', { className: 'bom-risk-list' }, item.risks.length ? item.risks.map((entry) => h('div', { className: `bom-risk bom-${entry.severity}` }, [badge(entry.severity, entry.severity), h('span', { text: riskLabel(entry.code) })])) : [h('p', { className: 'muted', text: text('Критических исключений нет.', 'No critical exceptions.') })]),
    ]);
  }

  function renderBoms() {
    if (!ui.loaded && !ui.loading) queueMicrotask(() => loadBoms({ reset: true }));
    const registry = core.buildRegistry(ui.items, state.workspace.catalogSkus || []);
    return h('section', { className: 'bom-page' }, [
      header(registry.summary),
      ui.error ? h('div', { className: 'bom-error', role: 'alert', text: ui.error }) : null,
      tabs(),
      h('div', { className: 'bom-layout' }, [h('main', {}, [ui.tab === 'costing' ? costing(registry) : table(registry), ui.nextCursor ? h('button', { className: 'secondary bom-load-more', type: 'button', disabled: ui.loading, text: text('Загрузить ещё', 'Load more'), onclick: () => loadBoms({ reset: false }) }) : null]), inspector(registry)]),
    ]);
  }

  async function publish(bom) {
    if (!confirm(text(`Опубликовать BOM ${bom.sku}? После публикации редактирование будет закрыто.`, `Publish BOM ${bom.sku}? Editing will be locked.`))) return;
    await mutate(`/v2/boms/${encodeURIComponent(bom.sku)}/publish`, { expectedVersion: bom.version });
    await loadBoms({ reset: true });
  }

  async function fetchPublishedMaterials() {
    const page = await api('/v2/materials?limit=200&status=published');
    return page.items || [];
  }
  async function openEditor(existing) {
    const materials = await fetchPublishedMaterials();
    const brandId = existing?.brandId || [...brandOrganisationIds()].find((id) => canManageBrand(id));
    const skus = (state.workspace.catalogSkus || []).filter((item) => item.brandId === brandId && item.status === 'published');
    const model = {
      sku: existing?.sku || skus[0]?.sku || '', currency: existing?.currency || skus[0]?.currency || 'EUR',
      laborCost: existing?.laborCost ?? 0, overheadCost: existing?.overheadCost ?? 0, logisticsCost: existing?.logisticsCost ?? 0, otherCost: existing?.otherCost ?? 0,
      notes: existing?.notes || '',
      lines: (existing?.lines || [{ lineId: 'LINE-1', component: '', materialCode: materials[0]?.code || '', quantity: 1, wastePercent: 0, exchangeRate: 1 }]).map((line) => ({ lineId: line.lineId, component: line.component, materialCode: line.materialCode, quantity: line.quantity, wastePercent: line.wastePercent, exchangeRate: line.exchangeRate ?? 1 })),
    };
    showEditor({ existing, materials, skus, model });
  }

  function showEditor({ existing, materials, skus, model }) {
    const overlay = h('div', { className: 'bom-modal-overlay' });
    const dialog = h('form', { className: 'bom-modal', role: 'dialog', 'aria-modal': 'true' });
    const linesRoot = h('div', { className: 'bom-editor-lines' });
    function renderLines() {
      linesRoot.replaceChildren();
      model.lines.forEach((line, index) => {
        const material = materials.find((item) => item.code === line.materialCode);
        const row = h('div', { className: 'bom-editor-line' }, [
          field(text('ID строки', 'Line ID'), input('text', line.lineId, (value) => { line.lineId = value.toUpperCase(); })),
          field(text('Компонент', 'Component'), input('text', line.component, (value) => { line.component = value; })),
          field(text('Материал', 'Material'), select(materials.map((item) => [item.code, `${item.code} · ${item.name}`]), line.materialCode, (value) => { line.materialCode = value; renderLines(); })),
          field(text('Количество', 'Quantity'), input('number', line.quantity, (value) => { line.quantity = value; }, { step: '0.0001', min: '0.0001' })),
          field(text('Отход, %', 'Waste, %'), input('number', line.wastePercent, (value) => { line.wastePercent = value; }, { step: '0.0001', min: '0', max: '1000' })),
          field(text('FX', 'FX'), input('number', line.exchangeRate, (value) => { line.exchangeRate = value; }, { step: '0.0001', min: '0.0001', disabled: material?.currency === model.currency })),
          h('button', { type: 'button', className: 'danger-link', text: text('Удалить', 'Remove'), disabled: model.lines.length === 1, onclick: () => { model.lines.splice(index, 1); renderLines(); } }),
        ]);
        linesRoot.append(row);
      });
    }
    renderLines();
    dialog.append(
      h('div', { className: 'bom-modal-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: 'BOM / COSTING' }), h('h2', { text: existing ? text(`Редактировать ${existing.sku}`, `Edit ${existing.sku}`) : text('Создать BOM', 'Create BOM') })]), h('button', { type: 'button', className: 'icon-button', 'aria-label': text('Закрыть', 'Close'), text: '×', onclick: () => overlay.remove() })]),
      h('div', { className: 'bom-editor-grid' }, [
        field('SKU', select(skus.map((item) => [item.sku, `${item.sku} · ${item.name}`]), model.sku, (value) => { model.sku = value; }, { disabled: Boolean(existing) })),
        field(text('Валюта', 'Currency'), input('text', model.currency, (value) => { model.currency = value.toUpperCase(); renderLines(); }, { maxlength: '3' })),
        field(text('Труд', 'Labor'), input('number', model.laborCost, (value) => { model.laborCost = value; }, { step: '0.0001', min: '0' })),
        field(text('Накладные', 'Overhead'), input('number', model.overheadCost, (value) => { model.overheadCost = value; }, { step: '0.0001', min: '0' })),
        field(text('Логистика', 'Logistics'), input('number', model.logisticsCost, (value) => { model.logisticsCost = value; }, { step: '0.0001', min: '0' })),
        field(text('Прочее', 'Other'), input('number', model.otherCost, (value) => { model.otherCost = value; }, { step: '0.0001', min: '0' })),
      ]),
      h('div', { className: 'bom-editor-section-head' }, [h('h3', { text: text('Строки материалов', 'Material lines') }), h('button', { type: 'button', className: 'secondary', text: text('Добавить строку', 'Add line'), onclick: () => { model.lines.push({ lineId: `LINE-${model.lines.length + 1}`, component: '', materialCode: materials[0]?.code || '', quantity: 1, wastePercent: 0, exchangeRate: 1 }); renderLines(); } })]),
      linesRoot,
      field(text('Примечания', 'Notes'), textarea(model.notes, (value) => { model.notes = value; })),
      h('div', { className: 'bom-modal-actions' }, [h('button', { type: 'button', className: 'secondary', text: text('Отмена', 'Cancel'), onclick: () => overlay.remove() }), h('button', { type: 'submit', className: 'primary', text: text('Сохранить', 'Save') })]),
    );
    dialog.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        currency: model.currency,
        lines: model.lines.map((line) => ({ lineId: String(line.lineId).trim().toUpperCase(), component: String(line.component).trim(), materialCode: line.materialCode, quantity: Number(line.quantity), wastePercent: Number(line.wastePercent), exchangeRate: Number(line.exchangeRate) })),
        laborCost: Number(model.laborCost), overheadCost: Number(model.overheadCost), logisticsCost: Number(model.logisticsCost), otherCost: Number(model.otherCost), notes: model.notes.trim() || null,
      };
      if (existing) await mutate(`/v2/boms/${encodeURIComponent(existing.sku)}`, { expectedVersion: existing.version, ...payload }, 'PATCH');
      else await mutate('/v2/boms', { sku: model.sku, ...payload });
      overlay.remove();
      await loadBoms({ reset: true });
    });
    overlay.append(dialog);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) overlay.remove(); });
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
