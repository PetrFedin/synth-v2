(function installMeasurementWorkspace() {
  'use strict';

  const core = window.SynthaMeasurementCore;
  const caps = window.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaMeasurementCore must load before measurements.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before measurements.js');

  const ui = window.SynthaMeasurementWorkspace || (window.SynthaMeasurementWorkspace = {
    items: [], nextCursor: null, loaded: false, loading: false, error: '', tab: 'registry', selectedSku: null, generation: 0,
  });

  const nav = typeof OD_V5_GROUPS === 'undefined' ? null : OD_V5_GROUPS
    .flatMap((group) => group.items)
    .find((item) => item.en === 'Measurement Charts');
  if (nav) {
    nav.view = 'measurements';
    nav.ru = 'Размерные таблицы';
    nav.en = 'Measurement Charts';
    nav.planned = false;
  }

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'disabled') node.disabled = Boolean(value);
      else if (key === 'checked') node.checked = Boolean(value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === undefined || child === null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }
  function brandIds(capability) { return new Set(caps.organisationIds(state.workspace, capability, 'brand')); }
  function canManage(brandId) { return caps.hasForOrganisation(state.workspace, brandId, caps.CAPABILITIES.MEASUREMENT_MANAGE); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.MEASUREMENT_MANAGE, 'brand'); }

  function reset() {
    ui.items = [];
    ui.nextCursor = null;
    ui.loaded = false;
    ui.error = '';
    ui.generation += 1;
  }
  async function loadCharts({ reset: shouldReset = false } = {}) {
    if (ui.loading) return;
    if (shouldReset) reset();
    ui.loading = true;
    ui.error = '';
    const generation = ui.generation;
    const query = new URLSearchParams({ limit: '200' });
    if (ui.nextCursor) query.set('cursor', ui.nextCursor);
    try {
      const page = await api(`/v2/measurements?${query.toString()}`);
      if (generation !== ui.generation) return;
      const bySku = new Map(ui.items.map((item) => [item.sku, item]));
      for (const item of page.items || []) bySku.set(item.sku, item);
      ui.items = [...bySku.values()].sort((left, right) => String(left.sku).localeCompare(String(right.sku)));
      ui.nextCursor = page.nextCursor || null;
      ui.loaded = true;
      if (!ui.selectedSku && ui.items.length) ui.selectedSku = ui.items[0].sku;
    } catch (error) {
      if (generation === ui.generation) ui.error = error?.message || 'MEASUREMENT_LOAD_FAILED';
    } finally {
      if (generation === ui.generation) ui.loading = false;
      if (state.view === 'measurements') renderApp();
    }
  }
  function ensureLoaded() {
    if (!ui.loaded && !ui.loading) queueMicrotask(() => { void loadCharts({ reset: true }); });
  }

  function riskLabel(code) {
    const labels = {
      SKU_NOT_IN_WORKSPACE: ['SKU отсутствует в рабочем контуре', 'SKU is outside the workspace'],
      SKU_BRAND_MISMATCH: ['Бренд таблицы не совпадает с SKU', 'Chart brand differs from SKU'],
      NO_SIZES: ['Нет размерного ряда', 'No size range'],
      TOO_MANY_SIZES: ['Превышен лимит размеров', 'Size limit exceeded'],
      DUPLICATE_SIZE_CODE: ['Дубли кодов размеров', 'Duplicate size codes'],
      BASE_SIZE_MISSING: ['Базовый размер отсутствует', 'Base size is missing'],
      NO_POINTS: ['Нет точек измерения', 'No points of measure'],
      TOO_MANY_POINTS: ['Превышен лимит POM', 'POM limit exceeded'],
      DUPLICATE_POINT_CODE: ['Дубли кодов POM', 'Duplicate POM codes'],
      MATRIX_INCOMPLETE: ['Матрица заполнена не полностью', 'Measurement matrix is incomplete'],
      INVALID_VALUES: ['Некорректные измерения', 'Invalid measurement values'],
      INVALID_TOLERANCES: ['Некорректные допуски', 'Invalid tolerances'],
      INVALID_GRADING_DELTAS: ['Некорректные grading deltas', 'Invalid grading deltas'],
      SKU_NOT_PUBLISHED: ['SKU не опубликован', 'SKU is not published'],
      SKU_SNAPSHOT_STALE: ['Версия SKU устарела', 'SKU snapshot is stale'],
      CHART_NOT_PUBLISHED: ['Таблица не опубликована', 'Chart is not published'],
    };
    const pair = labels[code] || [code, code];
    return text(pair[0], pair[1]);
  }
  function badge(value, tone) { return h('span', { className: `measurement-badge measurement-${tone}`, text: value }); }
  function progress(value) {
    const fill = h('span', { className: 'measurement-progress-fill' });
    fill.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
    return h('div', { className: 'measurement-progress' }, [h('span', { className: 'measurement-progress-track' }, [fill]), h('strong', { text: `${value}%` })]);
  }
  function metric(label, value, detail) {
    return h('article', { className: 'measurement-kpi' }, [h('span', { text: label }), h('strong', { text: value }), detail ? h('small', { text: detail }) : null]);
  }
  function header(summary) {
    const actions = [];
    if (canManageAny()) actions.push(h('button', { className: 'primary', type: 'button', text: text('Создать таблицу', 'Create chart'), onclick: () => { void openEditor(null); } }));
    actions.push(h('button', { className: 'secondary', type: 'button', disabled: ui.loading, text: text('Обновить', 'Refresh'), onclick: () => { void loadCharts({ reset: true }); } }));
    return h('header', { className: 'measurement-header' }, [
      h('div', { className: 'measurement-title' }, [
        h('p', { className: 'eyebrow', text: 'PLM / FIT & GRADING' }),
        h('h1', { text: text('Размерные таблицы и grading', 'Measurement charts and grading') }),
        h('p', { className: 'muted', text: text('Управляемая матрица размеров, POM, допусков и межразмерных приращений с привязкой к версии SKU.', 'Governed size, POM, tolerance and grading matrix bound to the exact SKU version.') }),
      ]),
      h('div', { className: 'measurement-header-actions' }, actions),
      h('section', { className: 'measurement-kpis' }, [
        metric(text('Всего', 'Total'), summary.total),
        metric(text('Черновики', 'Drafts'), summary.draft),
        metric(text('Опубликовано', 'Published'), summary.published),
        metric(text('Готовы к публикации', 'Publish ready'), summary.publishReady),
        metric(text('Неполные', 'Incomplete'), summary.incomplete),
        metric(text('Устаревший SKU', 'Stale SKU'), summary.stale),
        metric(text('Средняя готовность', 'Average readiness'), `${summary.averageReadiness}%`),
      ]),
    ]);
  }
  function tabs() {
    const entries = [['registry', text('Реестр', 'Registry')], ['matrix', text('Матрица', 'Matrix')], ['exceptions', text('Исключения', 'Exceptions')]];
    return h('nav', { className: 'measurement-tabs', role: 'tablist' }, entries.map(([id, label]) => h('button', {
      type: 'button', role: 'tab', className: ui.tab === id ? 'active' : '', 'aria-selected': ui.tab === id, text: label,
      onclick: () => { ui.tab = id; renderApp(); },
    })));
  }

  function registryTable(registry) {
    const items = ui.tab === 'exceptions' ? registry.items.filter((item) => item.risks.length) : registry.items;
    const rows = items.map((item) => {
      const row = h('tr', { className: ui.selectedSku === item.chart.sku ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: item.chart.sku }), h('small', { text: item.sku?.name || '' })]),
        h('td', {}, [badge(item.chart.status, item.chart.status === 'published' ? 'ok' : 'neutral')]),
        h('td', { text: item.chart.unit }),
        h('td', { text: item.chart.sizes.length }),
        h('td', { text: item.chart.points.length }),
        h('td', { text: `${item.actualValues}/${item.expectedValues}` }),
        h('td', {}, [progress(item.readiness)]),
        h('td', {}, [badge(item.risks.length ? riskLabel(item.risks[0].code) : text('Готово', 'Ready'), item.highestRisk)]),
      ]);
      const select = () => { ui.selectedSku = item.chart.sku; renderApp(); };
      row.addEventListener('click', select);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
      return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '8', className: 'measurement-empty', text: ui.loading ? text('Загрузка…', 'Loading…') : text('Нет данных для выбранного режима.', 'No records for this view.') })]));
    return h('div', { className: 'measurement-table-wrap' }, [h('table', { className: 'measurement-table' }, [
      h('thead', {}, [h('tr', {}, [
        text('SKU / модель', 'SKU / style'), text('Статус', 'Status'), text('Ед.', 'Unit'), text('Размеры', 'Sizes'),
        'POM', text('Матрица', 'Matrix'), text('Готовность', 'Readiness'), text('Риск', 'Risk'),
      ].map((label) => h('th', { text: label })))]),
      h('tbody', {}, rows),
    ])]);
  }

  function selectedAssessment(registry) {
    return registry.items.find((item) => item.chart.sku === ui.selectedSku) || registry.items[0] || null;
  }
  function matrixView(item) {
    if (!item) return h('div', { className: 'measurement-empty', text: text('Выберите размерную таблицу.', 'Select a measurement chart.') });
    const head = [h('th', { text: text('POM / допуск', 'POM / tolerance') })];
    for (const size of item.chart.sizes) head.push(h('th', { text: `${size.code} · ${size.label}` }));
    const rows = item.chart.points.map((point) => {
      const bySize = new Map(point.measurements.map((measurement) => [measurement.sizeCode, measurement]));
      const cells = [h('td', {}, [h('strong', { text: point.pointCode }), h('span', { text: point.name }), h('small', { text: `−${point.toleranceMinus} / +${point.tolerancePlus} ${item.chart.unit}` })])];
      for (const size of item.chart.sizes) {
        const value = bySize.get(size.code);
        cells.push(h('td', { className: size.code === item.chart.baseSizeCode ? 'base-size' : '' }, value
          ? [h('strong', { text: String(value.value) }), h('small', { text: value.deltaFromPrevious === null ? '—' : `${value.deltaFromPrevious >= 0 ? '+' : ''}${value.deltaFromPrevious}` })]
          : [badge(text('Нет значения', 'Missing'), 'high')]));
      }
      return h('tr', {}, cells);
    });
    return h('section', { className: 'measurement-matrix-panel' }, [
      h('div', { className: 'measurement-matrix-head' }, [
        h('div', {}, [h('h2', { text: item.chart.sku }), h('p', { text: `${item.sku?.name || ''} · ${item.chart.unit} · ${text('базовый размер', 'base size')} ${item.chart.baseSizeCode}` })]),
        progress(item.readiness),
      ]),
      h('div', { className: 'measurement-table-wrap' }, [h('table', { className: 'measurement-matrix' }, [h('thead', {}, [h('tr', {}, head)]), h('tbody', {}, rows)])]),
    ]);
  }

  function inspector(item) {
    if (!item) return h('aside', { className: 'measurement-inspector' }, [h('p', { className: 'muted', text: text('Выберите запись для просмотра.', 'Select a record to inspect.') })]);
    const actions = [];
    if (canManage(item.chart.brandId) && item.chart.status === 'draft') {
      actions.push(h('button', { type: 'button', className: 'secondary', text: text('Редактировать', 'Edit'), onclick: () => { void openEditor(item.chart); } }));
      actions.push(h('button', { type: 'button', className: 'primary', disabled: !item.publishReady, text: text('Опубликовать', 'Publish'), onclick: () => { void publishChart(item); } }));
    }
    const risks = item.risks.length
      ? item.risks.map((risk) => h('div', { className: `measurement-risk measurement-${risk.severity}` }, [badge(risk.severity, risk.severity), h('span', { text: riskLabel(risk.code) })]))
      : [h('p', { className: 'muted', text: text('Контрольных исключений нет.', 'No control exceptions.') })];
    return h('aside', { className: 'measurement-inspector' }, [
      h('div', { className: 'measurement-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: item.chart.sku }), h('h2', { text: item.sku?.name || item.chart.sku })]), h('div', { className: 'measurement-inspector-actions' }, actions)]),
      h('dl', { className: 'measurement-summary' }, [
        pair(text('Статус', 'Status'), item.chart.status), pair(text('Версия', 'Version'), item.chart.version), pair(text('SKU version', 'SKU version'), item.chart.skuVersion),
        pair(text('Размеры', 'Sizes'), item.chart.sizes.length), pair('POM', item.chart.points.length), pair(text('Заполнение', 'Completion'), `${item.actualValues}/${item.expectedValues}`),
      ]),
      h('h3', { text: text('Контрольные исключения', 'Control exceptions') }),
      h('div', { className: 'measurement-risk-list' }, risks),
    ]);
  }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value })]); }

  function renderMeasurements() {
    ensureLoaded();
    const registry = core.buildRegistry(ui.items, state.workspace.catalogSkus || []);
    const selected = selectedAssessment(registry);
    const main = ui.tab === 'matrix' ? matrixView(selected) : registryTable(registry);
    return h('section', { className: 'measurement-page' }, [
      header(registry.summary),
      ui.error ? h('div', { className: 'measurement-error', role: 'alert', text: ui.error }) : null,
      tabs(),
      h('div', { className: 'measurement-layout' }, [
        h('main', {}, [main, ui.nextCursor ? h('button', { className: 'secondary measurement-load-more', type: 'button', disabled: ui.loading, text: text('Загрузить ещё', 'Load more'), onclick: () => { void loadCharts(); } }) : null]),
        inspector(selected),
      ]),
    ]);
  }

  async function publishChart(item) {
    if (!item.publishReady) return;
    if (!confirm(text(`Опубликовать размерную таблицу ${item.chart.sku}?`, `Publish measurement chart ${item.chart.sku}?`))) return;
    await mutate(`/v2/measurements/${encodeURIComponent(item.chart.sku)}/publish`, { expectedVersion: item.chart.version });
    await loadCharts({ reset: true });
  }

  async function fetchCatalogSkus() {
    const items = new Map();
    const seen = new Set();
    let cursor = null;
    let pages = 0;
    do {
      pages += 1;
      if (pages > 500) throw new Error(text('Каталог превысил безопасный предел загрузки.', 'Catalog exceeded the safe page limit.'));
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const page = await api(`/v2/catalog/skus?${query.toString()}`);
      for (const sku of page.items || []) items.set(sku.sku, sku);
      const next = page.nextCursor || null;
      if (next && seen.has(next)) throw new Error(text('Каталог вернул циклический курсор.', 'Catalog returned a cyclic cursor.'));
      if (next) seen.add(next);
      cursor = next;
    } while (cursor);
    return [...items.values()];
  }

  async function openEditor(existing) {
    const manageableBrands = brandIds(caps.CAPABILITIES.MEASUREMENT_MANAGE);
    const allSkus = (await fetchCatalogSkus()).filter((sku) => manageableBrands.has(sku.brandId));
    const occupied = new Set(ui.items.map((chart) => chart.sku));
    const skus = existing ? allSkus.filter((sku) => sku.sku === existing.sku) : allSkus.filter((sku) => !occupied.has(sku.sku));
    if (!skus.length) throw new Error(text('Нет доступных SKU без размерной таблицы.', 'No manageable SKU without a measurement chart is available.'));
    let sequence = 0;
    const sizes = (existing?.sizes || [{ code: 'S', label: 'Small' }, { code: 'M', label: 'Medium' }, { code: 'L', label: 'Large' }]).map((size) => ({ key: `size-${++sequence}`, code: size.code, label: size.label }));
    const model = {
      sku: existing?.sku || skus[0].sku,
      unit: existing?.unit || 'cm',
      baseSizeKey: sizes.find((size) => size.code === existing?.baseSizeCode)?.key || sizes[Math.floor(sizes.length / 2)]?.key,
      sizes,
      points: (existing?.points || [{ pointCode: 'CHEST', name: 'Half chest', description: '', toleranceMinus: 0.5, tolerancePlus: 0.5, measurements: [] }]).map((point) => {
        const values = new Map((point.measurements || []).map((measurement) => [measurement.sizeCode, measurement.value]));
        return {
          key: `point-${++sequence}`, pointCode: point.pointCode, name: point.name, description: point.description || '',
          toleranceMinus: point.toleranceMinus, tolerancePlus: point.tolerancePlus,
          values: new Map(sizes.map((size) => [size.key, values.get(size.code) ?? ''])),
        };
      }),
      notes: existing?.notes || '',
    };
    showEditor({ existing, skus, model, nextKey: (prefix) => `${prefix}-${++sequence}` });
  }

  function showEditor({ existing, skus, model, nextKey }) {
    const overlay = h('div', { className: 'measurement-modal-overlay' });
    const form = h('form', { className: 'measurement-modal', role: 'dialog', 'aria-modal': 'true' });
    const body = h('div', { className: 'measurement-editor-body' });

    function renderBody() {
      body.replaceChildren();
      const baseSelect = select(model.sizes.map((size) => [size.key, size.code || text('Новый размер', 'New size')]), model.baseSizeKey, (value) => { model.baseSizeKey = value; });
      body.append(h('div', { className: 'measurement-editor-grid' }, [
        field('SKU', select(skus.map((sku) => [sku.sku, `${sku.sku} · ${sku.name}`]), model.sku, (value) => { model.sku = value; }, { disabled: Boolean(existing) })),
        field(text('Единица измерения', 'Unit'), select([['cm', 'cm'], ['in', 'in']], model.unit, (value) => { model.unit = value; })),
        field(text('Базовый размер', 'Base size'), baseSelect),
      ]));

      const sizeList = h('div', { className: 'measurement-size-list' });
      model.sizes.forEach((size) => {
        sizeList.append(h('div', { className: 'measurement-size-card' }, [
          input('text', size.code, (value) => { size.code = value.toUpperCase(); }, { maxlength: '16', placeholder: 'M' }),
          input('text', size.label, (value) => { size.label = value; }, { maxlength: '40', placeholder: text('Название', 'Label') }),
          h('button', { type: 'button', className: 'danger-link', disabled: model.sizes.length === 1, text: '×', 'aria-label': text('Удалить размер', 'Remove size'), onclick: () => {
            model.sizes = model.sizes.filter((candidate) => candidate.key !== size.key);
            model.points.forEach((point) => point.values.delete(size.key));
            if (model.baseSizeKey === size.key) model.baseSizeKey = model.sizes[0]?.key;
            renderBody();
          } }),
        ]));
      });
      body.append(sectionHead(text('Размерный ряд', 'Size range'), h('button', { type: 'button', className: 'secondary', disabled: model.sizes.length >= 50, text: text('Добавить размер', 'Add size'), onclick: () => {
        const size = { key: nextKey('size'), code: '', label: '' };
        model.sizes.push(size);
        model.points.forEach((point) => point.values.set(size.key, ''));
        renderBody();
      } })), sizeList);

      const tableHead = [h('th', { text: 'POM' }), h('th', { text: text('Название / описание', 'Name / description') }), h('th', { text: '− Tol.' }), h('th', { text: '+ Tol.' })];
      model.sizes.forEach((size) => tableHead.push(h('th', { text: size.code || '—' })));
      tableHead.push(h('th', { text: '' }));
      const rows = model.points.map((point) => {
        const cells = [
          h('td', {}, [input('text', point.pointCode, (value) => { point.pointCode = value.toUpperCase(); }, { maxlength: '32', placeholder: 'CHEST' })]),
          h('td', {}, [input('text', point.name, (value) => { point.name = value; }, { maxlength: '120', placeholder: text('Название POM', 'POM name') }), input('text', point.description, (value) => { point.description = value; }, { maxlength: '500', placeholder: text('Метод измерения', 'Measuring method') })]),
          h('td', {}, [input('number', point.toleranceMinus, (value) => { point.toleranceMinus = value; }, { step: '0.0001', min: '0' })]),
          h('td', {}, [input('number', point.tolerancePlus, (value) => { point.tolerancePlus = value; }, { step: '0.0001', min: '0' })]),
        ];
        model.sizes.forEach((size) => cells.push(h('td', { className: size.key === model.baseSizeKey ? 'base-size' : '' }, [input('number', point.values.get(size.key), (value) => { point.values.set(size.key, value); }, { step: '0.0001', min: '0.0001' })])));
        cells.push(h('td', {}, [h('button', { type: 'button', className: 'danger-link', text: '×', 'aria-label': text('Удалить POM', 'Remove POM'), onclick: () => { model.points = model.points.filter((candidate) => candidate.key !== point.key); renderBody(); } })]));
        return h('tr', {}, cells);
      });
      body.append(sectionHead(text('Точки измерения и матрица', 'Points of measure and matrix'), h('button', { type: 'button', className: 'secondary', disabled: model.points.length >= 300, text: text('Добавить POM', 'Add POM'), onclick: () => {
        model.points.push({ key: nextKey('point'), pointCode: '', name: '', description: '', toleranceMinus: 0, tolerancePlus: 0, values: new Map(model.sizes.map((size) => [size.key, ''])) });
        renderBody();
      } })), h('div', { className: 'measurement-editor-matrix-wrap' }, [h('table', { className: 'measurement-editor-matrix' }, [h('thead', {}, [h('tr', {}, tableHead)]), h('tbody', {}, rows)] )]));
      body.append(field(text('Примечания', 'Notes'), textarea(model.notes, (value) => { model.notes = value; })));
    }

    form.append(
      h('div', { className: 'measurement-modal-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: 'MEASUREMENT CHART' }), h('h2', { text: existing ? text(`Редактировать ${existing.sku}`, `Edit ${existing.sku}`) : text('Создать размерную таблицу', 'Create measurement chart') })]), h('button', { type: 'button', className: 'icon-button', text: '×', 'aria-label': text('Закрыть', 'Close'), onclick: () => overlay.remove() })]),
      body,
      h('div', { className: 'measurement-modal-actions' }, [h('button', { type: 'button', className: 'secondary', text: text('Отмена', 'Cancel'), onclick: () => overlay.remove() }), h('button', { type: 'submit', className: 'primary', text: text('Сохранить', 'Save') })]),
    );
    renderBody();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const sizeCodes = model.sizes.map((size) => String(size.code).trim().toUpperCase());
      if (sizeCodes.some((code) => !code) || new Set(sizeCodes).size !== sizeCodes.length) throw new Error(text('Коды размеров должны быть заполнены и уникальны.', 'Size codes must be present and unique.'));
      const baseSize = model.sizes.find((size) => size.key === model.baseSizeKey);
      if (!baseSize) throw new Error(text('Выберите базовый размер.', 'Select a base size.'));
      const payload = {
        unit: model.unit,
        baseSizeCode: String(baseSize.code).trim().toUpperCase(),
        sizes: model.sizes.map((size) => ({ code: String(size.code).trim().toUpperCase(), label: String(size.label).trim() })),
        points: model.points.map((point) => ({
          pointCode: String(point.pointCode).trim().toUpperCase(), name: String(point.name).trim(), description: String(point.description).trim() || null,
          toleranceMinus: Number(point.toleranceMinus), tolerancePlus: Number(point.tolerancePlus),
          measurements: model.sizes.flatMap((size) => {
            const value = point.values.get(size.key);
            return value === '' || value === null || value === undefined ? [] : [{ sizeCode: String(size.code).trim().toUpperCase(), value: Number(value) }];
          }),
        })),
        notes: String(model.notes).trim() || null,
      };
      if (existing) await mutate(`/v2/measurements/${encodeURIComponent(existing.sku)}`, { expectedVersion: existing.version, ...payload }, 'PATCH');
      else await mutate('/v2/measurements', { sku: model.sku, ...payload });
      overlay.remove();
      await loadCharts({ reset: true });
    });
    overlay.append(form);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) overlay.remove(); });
    document.body.append(overlay);
    form.querySelector('input,select,button')?.focus();
  }

  function sectionHead(title, action) { return h('div', { className: 'measurement-editor-section-head' }, [h('h3', { text: title }), action]); }
  function field(label, control) { return h('label', { className: 'measurement-field' }, [h('span', { text: label }), control]); }
  function input(type, value, setter, extra = {}) {
    const control = h('input', { type, ...extra });
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
  renderView = (...args) => state.view === 'measurements' ? renderMeasurements() : previousRenderView(...args);
  const previousViewTitle = viewTitle;
  viewTitle = (view) => view === 'measurements' ? text('Размерные таблицы', 'Measurement Charts') : previousViewTitle(view);
  const previousViewSectionName = viewSectionName;
  viewSectionName = (view) => view === 'measurements' ? 'PLM / FIT & GRADING' : previousViewSectionName(view);
})();
