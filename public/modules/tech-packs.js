(function installTechPackWorkspace(global) {
  'use strict';

  const core = global.SynthaTechPackCore;
  const caps = global.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaTechPackCore must load before tech-packs.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before tech-packs.js');

  const ui = global.SynthaTechPackWorkspace || (global.SynthaTechPackWorkspace = {
    items: [], dependencies: new Map(), loaded: false, loading: false, error: '', selectedCode: null, status: 'all', busyCode: null, generation: 0,
  });
  const STATUSES = ['draft', 'issued', 'superseded', 'withdrawn'];

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'disabled') node.disabled = Boolean(value);
      else if (key === 'value') node.value = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) if (child !== undefined && child !== null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }
  function canManage(brandId) { return caps.hasForOrganisation(state.workspace, brandId, caps.CAPABILITIES.TECH_PACK_MANAGE); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.TECH_PACK_MANAGE, 'brand'); }
  function catalog() { return Array.isArray(state.workspace?.catalogSkus) ? state.workspace.catalogSkus : []; }
  function badge(value, tone = 'neutral') { return h('span', { className: `tech-pack-badge tech-pack-${tone}`, text: value }); }
  function statusLabel(status) { const labels = { draft: ['Черновик', 'Draft'], issued: ['Выпущен', 'Issued'], superseded: ['Заменён', 'Superseded'], withdrawn: ['Отозван', 'Withdrawn'] }; return text(...(labels[status] || [status, status])); }
  function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—'; }

  async function fetchAll(path, request = api) {
    const items = [];
    const seen = new Set();
    let cursor = null;
    for (let page = 0; page < 500; page += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const result = await request(`${path}?${query}`);
      if (!result || !Array.isArray(result.items)) throw new Error('TECH_PACK_DEPENDENCY_PAGE_INVALID');
      items.push(...result.items);
      if (!result.nextCursor) return Object.freeze(items);
      if (seen.has(result.nextCursor)) throw new Error('TECH_PACK_CURSOR_CYCLE');
      seen.add(result.nextCursor); cursor = result.nextCursor;
    }
    throw new Error('TECH_PACK_PAGE_LIMIT_EXCEEDED');
  }

  async function load({ reset = false } = {}) {
    if (ui.loading) return;
    if (reset) { ui.loaded = false; ui.error = ''; ui.generation += 1; }
    ui.loading = true;
    const generation = ui.generation;
    try {
      const [packs, boms, measurements, samples] = await Promise.all([fetchAll('/v2/tech-packs'), fetchAll('/v2/boms'), fetchAll('/v2/measurements'), fetchAll('/v2/samples')]);
      if (generation !== ui.generation) return;
      const skuByCode = new Map(catalog().map((item) => [item.sku, item]));
      const bomBySku = new Map(boms.filter((item) => item.status === 'published').map((item) => [item.sku, item]));
      const measurementBySku = new Map(measurements.filter((item) => item.status === 'published').map((item) => [item.sku, item]));
      const sampleBySku = new Map();
      for (const sample of samples.filter((item) => item.status === 'approved')) {
        const previous = sampleBySku.get(sample.sku);
        if (!previous || Date.parse(sample.decisionAt || sample.updatedAt) > Date.parse(previous.decisionAt || previous.updatedAt)) sampleBySku.set(sample.sku, sample);
      }
      ui.dependencies = new Map([...skuByCode.keys()].map((sku) => [sku, { catalogSku: skuByCode.get(sku), bom: bomBySku.get(sku), measurementChart: measurementBySku.get(sku), approvedSample: sampleBySku.get(sku) }]));
      ui.items = [...packs].sort((a, b) => String(a.techPackCode).localeCompare(String(b.techPackCode)));
      ui.loaded = true;
      if (!ui.selectedCode && ui.items.length) ui.selectedCode = ui.items[0].techPackCode;
    } catch (error) { if (generation === ui.generation) ui.error = error?.message || 'TECH_PACK_LOAD_FAILED'; }
    finally { if (generation === ui.generation) ui.loading = false; if (state.view === 'tech-packs') renderApp(); }
  }
  function ensureLoaded() { if (!ui.loaded && !ui.loading) queueMicrotask(() => { void load({ reset: true }); }); }
  function selected() { return ui.items.find((item) => item.techPackCode === ui.selectedCode) || ui.items[0] || null; }
  function upsert(value) { const map = new Map(ui.items.map((item) => [item.techPackCode, item])); map.set(value.techPackCode, value); ui.items = [...map.values()].sort((a, b) => String(a.techPackCode).localeCompare(String(b.techPackCode))); ui.selectedCode = value.techPackCode; }
  async function run(code, path, body, method = 'POST') {
    if (ui.busyCode) return null;
    ui.busyCode = code; renderApp();
    try { const value = await mutate(path, body, method); upsert(value); toast(text('Изменения сохранены.', 'Changes saved.')); queueMicrotask(() => { void load({ reset: true }); }); return value; }
    catch (error) { if (error?.code === 'TECH_PACK_CONCURRENCY_CONFLICT') queueMicrotask(() => { void load({ reset: true }); }); toast(error?.message || 'TECH_PACK_MUTATION_FAILED', 'error'); return null; }
    finally { ui.busyCode = null; renderApp(); }
  }

  function metric(label, value) { return h('article', { className: 'tech-pack-kpi' }, [h('span', { text: label }), h('strong', { text: value })]); }
  function header(summary) {
    return h('header', { className: 'tech-pack-header' }, [
      h('div', {}, [h('p', { className: 'eyebrow', text: 'PLM / PRODUCTION DOCUMENTATION' }), h('h1', { text: text('Технические пакеты', 'Tech Packs') }), h('p', { className: 'muted', text: text('Единая версия производственных инструкций с контролем BOM, измерений и одобренного образца.', 'One factory-authoritative production instruction with governed BOM, measurement and approved-sample dependencies.') })]),
      h('div', { className: 'tech-pack-actions' }, [canManageAny() ? h('button', { type: 'button', className: 'primary', text: text('Создать Tech Pack', 'Create Tech Pack'), onclick: () => openEditor(null) }) : null, h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: text('Обновить', 'Refresh'), onclick: () => { void load({ reset: true }); } })]),
      h('section', { className: 'tech-pack-kpis' }, [metric(text('Всего', 'Total'), summary.total), metric(text('Активные', 'Active'), summary.active), metric(text('Черновики', 'Drafts'), summary.draft), metric(text('Выпущено', 'Issued'), summary.issued), metric(text('Заблокировано', 'Blocked'), summary.blocked), metric(text('Заменено', 'Superseded'), summary.superseded)]),
    ]);
  }
  function filters() { const select = h('select', { onchange: (event) => { ui.status = event.target.value; renderApp(); }, 'aria-label': text('Фильтр статуса', 'Status filter') }, [h('option', { value: 'all', text: text('Все статусы', 'All statuses') }), ...STATUSES.map((status) => h('option', { value: status, text: statusLabel(status) }))]); select.value = ui.status; return h('div', { className: 'tech-pack-filters' }, [select]); }
  function registry(items) {
    const rows = items.map((pack) => {
      const assessment = core.assess(pack, ui.dependencies.get(pack.sku) || {});
      const tone = pack.status === 'issued' ? 'ok' : assessment.issues.length ? 'high' : 'medium';
      const row = h('tr', { className: ui.selectedCode === pack.techPackCode ? 'selected' : '', tabindex: '0' }, [h('td', {}, [h('strong', { text: pack.techPackCode }), h('small', { text: pack.sku })]), h('td', { text: `R${pack.revision}` }), h('td', {}, [badge(statusLabel(pack.status), tone)]), h('td', { text: pack.supplierName || '—' }), h('td', { text: formatDate(pack.issuedAt) }), h('td', {}, [assessment.issues.length ? badge(`${assessment.issues.length} ${text('блок.', 'blockers')}`, 'high') : badge(text('Готов', 'Ready'), 'ok')])]);
      const choose = () => { ui.selectedCode = pack.techPackCode; renderApp(); };
      row.addEventListener('click', choose); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } }); return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '6', className: 'tech-pack-empty', text: ui.loading ? text('Загрузка…', 'Loading…') : text('Tech Packs не найдены.', 'No Tech Packs found.') })]));
    return h('div', { className: 'tech-pack-table-wrap' }, [h('table', { className: 'tech-pack-table' }, [h('thead', {}, [h('tr', {}, [text('Tech Pack / SKU', 'Tech Pack / SKU'), text('Ревизия', 'Revision'), text('Статус', 'Status'), text('Поставщик', 'Supplier'), text('Выпущен', 'Issued'), text('Готовность', 'Readiness')].map((value) => h('th', { text: value })))]), h('tbody', {}, rows)])]);
  }
  function inspector(pack) {
    if (!pack) return h('aside', { className: 'tech-pack-inspector' }, [h('p', { className: 'muted', text: text('Выберите Tech Pack.', 'Select a Tech Pack.') })]);
    const dependencies = ui.dependencies.get(pack.sku) || {};
    const assessment = core.assess(pack, dependencies);
    const actions = core.allowedActions(pack, { canManage: canManage(pack.brandId), dependencies });
    const buttons = actions.map((action) => h('button', { type: 'button', className: action === 'withdraw' ? 'danger' : action === 'issue' ? 'primary' : 'secondary', disabled: ui.busyCode === pack.techPackCode, text: ({ edit: text('Редактировать', 'Edit'), issue: text('Выпустить', 'Issue'), revision: text('Новая ревизия', 'New revision'), withdraw: text('Отозвать', 'Withdraw') })[action], onclick: () => executeAction(action, pack) }));
    const snapshot = pack.dependencySnapshot;
    return h('aside', { className: 'tech-pack-inspector' }, [
      h('div', { className: 'tech-pack-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: pack.sku }), h('h2', { text: pack.techPackCode }), h('p', { className: 'muted', text: pack.title })]), badge(statusLabel(pack.status), pack.status === 'issued' ? 'ok' : 'neutral')]),
      h('div', { className: 'tech-pack-action-row' }, buttons),
      h('section', { className: 'tech-pack-card' }, [h('h3', { text: text('Готовность к выпуску', 'Issue readiness') }), assessment.issues.length ? h('div', { className: 'tech-pack-blockers' }, assessment.issues.map((issue) => badge(issue, 'high'))) : h('p', { className: 'tech-pack-ready', text: text('Все обязательные зависимости подтверждены.', 'All required dependencies are confirmed.') })]),
      h('section', { className: 'tech-pack-card' }, [h('h3', { text: text('Производственные инструкции', 'Production instructions') }), h('p', { text: pack.constructionNotes || '—' }), h('p', { className: 'muted', text: pack.qualityNotes || '—' }), h('p', { className: 'muted', text: pack.packingNotes || '—' })]),
      snapshot ? h('section', { className: 'tech-pack-card' }, [h('h3', { text: text('Зафиксированные зависимости', 'Frozen dependencies') }), h('dl', {}, [pair('SKU', `v${snapshot.skuVersion}`), pair('BOM', `${snapshot.bomId} · v${snapshot.bomVersion}`), pair(text('Измерения', 'Measurements'), `${snapshot.measurementChartId} · v${snapshot.measurementChartVersion}`), pair(text('Образец', 'Sample'), `${snapshot.sampleCode} · v${snapshot.sampleVersion}`)])]) : null,
    ]);
  }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value })]); }
  function renderTechPacks() { ensureLoaded(); const summary = core.summarize(ui.items, ui.dependencies); const items = ui.items.filter((item) => ui.status === 'all' || item.status === ui.status); return h('section', { className: 'tech-pack-page' }, [header(summary), filters(), ui.error ? h('div', { className: 'tech-pack-error', text: ui.error }) : null, h('div', { className: 'tech-pack-layout' }, [registry(items), inspector(selected())])]); }

  function field(label, control) { return h('label', { className: 'tech-pack-field' }, [h('span', { text: label }), control]); }
  function input(name, value = '', attrs = {}) { return h('input', { name, value: value ?? '', ...attrs }); }
  function textarea(name, value = '', attrs = {}) { const node = h('textarea', { name, ...attrs }); node.value = value ?? ''; return node; }
  function dialog(title, fields, onSubmit, submitLabel) {
    const modal = h('dialog', { className: 'tech-pack-dialog' });
    const form = h('form', { method: 'dialog', className: 'tech-pack-form' }, [h('div', { className: 'tech-pack-dialog-head' }, [h('h2', { text: title }), h('button', { type: 'button', className: 'icon-button', text: '×', onclick: () => modal.close() })]), ...fields, h('div', { className: 'tech-pack-dialog-actions' }, [h('button', { type: 'button', className: 'secondary', text: text('Отмена', 'Cancel'), onclick: () => modal.close() }), h('button', { type: 'submit', className: 'primary', text: submitLabel || text('Сохранить', 'Save') })])]);
    form.addEventListener('submit', async (event) => { event.preventDefault(); const complete = await onSubmit(Object.fromEntries(new FormData(form).entries())); if (complete !== false) modal.close(); });
    modal.addEventListener('close', () => modal.remove()); modal.append(form); document.body.append(modal); modal.showModal();
  }
  function openEditor(pack) {
    const available = catalog().filter((sku) => canManage(sku.brandId)).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    if (!pack && !available.length) { toast(text('Нет доступного SKU.', 'No manageable SKU is available.'), 'error'); return; }
    const sku = pack?.sku || available[0].sku;
    const skuSelect = h('select', { name: 'sku' }, available.map((item) => h('option', { value: item.sku, text: `${item.sku} · ${item.name || ''}` }))); skuSelect.value = sku; if (pack) skuSelect.disabled = true;
    const controls = { code: input('techPackCode', pack?.techPackCode || `TP-${sku}-R01`, { required: true, maxlength: '64' }), supplierCode: input('supplierCode', pack?.supplierCode || '', { maxlength: '64' }), supplierName: input('supplierName', pack?.supplierName || '', { maxlength: '160' }), supplierEmail: input('supplierEmail', pack?.supplierEmail || '', { type: 'email', maxlength: '254' }), title: input('title', pack?.title || '', { required: true, maxlength: '200' }), description: textarea('description', pack?.description || '', { rows: '3', maxlength: '4000' }), construction: textarea('constructionNotes', pack?.constructionNotes || '', { rows: '5', maxlength: '8000' }), quality: textarea('qualityNotes', pack?.qualityNotes || '', { rows: '4', maxlength: '4000' }), packing: textarea('packingNotes', pack?.packingNotes || '', { rows: '4', maxlength: '4000' }) };
    if (pack) controls.code.disabled = true;
    dialog(pack ? text('Редактировать Tech Pack', 'Edit Tech Pack') : text('Новый Tech Pack', 'New Tech Pack'), [field('SKU', skuSelect), field(text('Код', 'Code'), controls.code), field(text('Код поставщика', 'Supplier code'), controls.supplierCode), field(text('Поставщик', 'Supplier'), controls.supplierName), field('Email', controls.supplierEmail), field(text('Название', 'Title'), controls.title), field(text('Описание', 'Description'), controls.description), field(text('Конструкция', 'Construction'), controls.construction), field(text('Качество', 'Quality'), controls.quality), field(text('Упаковка', 'Packing'), controls.packing)], async (values) => {
      const editable = { supplierCode: values.supplierCode || null, supplierName: values.supplierName || null, supplierEmail: values.supplierEmail || null, title: values.title, description: values.description || null, constructionNotes: values.constructionNotes || null, qualityNotes: values.qualityNotes || null, packingNotes: values.packingNotes || null };
      return Boolean(pack ? await run(pack.techPackCode, `/v2/tech-packs/${encodeURIComponent(pack.techPackCode)}`, { expectedVersion: pack.version, ...editable }, 'PATCH') : await run(values.techPackCode, '/v2/tech-packs', { techPackCode: values.techPackCode, sku: values.sku, ...editable }));
    });
  }
  function executeAction(action, pack) {
    if (action === 'edit') return openEditor(pack);
    if (action === 'issue') { if (confirm(text(`Выпустить ${pack.techPackCode} для фабрики?`, `Issue ${pack.techPackCode} to the factory?`))) void run(pack.techPackCode, `/v2/tech-packs/${encodeURIComponent(pack.techPackCode)}/issue`, { expectedVersion: pack.version }); return; }
    if (action === 'revision') return dialog(text('Новая ревизия', 'New revision'), [field(text('Код новой ревизии', 'New revision code'), input('techPackCode', core.nextRevisionCode(pack), { required: true, maxlength: '64' })), field(text('Изменение конструкции', 'Construction change'), textarea('constructionNotes', pack.constructionNotes || '', { rows: '5', maxlength: '8000' }))], async (values) => Boolean(await run(pack.techPackCode, `/v2/tech-packs/${encodeURIComponent(pack.techPackCode)}/revisions`, { expectedVersion: pack.version, techPackCode: values.techPackCode, constructionNotes: values.constructionNotes || null })));
    if (action === 'withdraw') return dialog(text('Отозвать Tech Pack', 'Withdraw Tech Pack'), [field(text('Причина', 'Reason'), textarea('reason', '', { required: true, minlength: '5', maxlength: '500', rows: '4' }))], async (values) => Boolean(await run(pack.techPackCode, `/v2/tech-packs/${encodeURIComponent(pack.techPackCode)}/withdraw`, { expectedVersion: pack.version, reason: values.reason })), text('Отозвать', 'Withdraw'));
  }

  const previousRenderView = renderView;
  renderView = (...args) => state.view === 'tech-packs' ? renderTechPacks() : previousRenderView(...args);
  global.SynthaTechPackWorkspace.fetchAll = fetchAll;
})(window);
