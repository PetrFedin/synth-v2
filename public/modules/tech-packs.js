(function installTechPacksWorkspace(global) {
  'use strict';

  const core = global.SynthaTechPackCore;
  const caps = global.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaTechPackCore must load before tech-packs.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before tech-packs.js');

  const ui = global.SynthaTechPacksWorkspace || (global.SynthaTechPacksWorkspace = {
    items: [], loaded: false, loading: false, error: '', selectedCode: null, status: 'all', readiness: 'all', search: '', busyCode: null, generation: 0,
  });
  const STATUSES = ['draft', 'issued', 'acknowledged', 'superseded', 'withdrawn'];

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'disabled') node.disabled = Boolean(value);
      else if (key === 'checked') node.checked = Boolean(value);
      else if (key === 'value') node.value = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === undefined || child === null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }
  function labelStatus(status) {
    const labels = { draft: ['Черновик', 'Draft'], issued: ['Выпущен', 'Issued'], acknowledged: ['Подтверждён фабрикой', 'Supplier acknowledged'], superseded: ['Заменён редакцией', 'Superseded'], withdrawn: ['Отозван', 'Withdrawn'] };
    return text(...(labels[status] || [status, status]));
  }
  function date(value) { if (!value) return '—'; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed) : '—'; }
  function badge(value, tone = 'neutral') { return h('span', { className: `tech-pack-badge tech-pack-${tone}`, text: value }); }
  function can(brandId, capability) { return caps.hasForOrganisation(state.workspace, brandId, capability); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.TECH_PACK_MANAGE, 'brand'); }
  function catalog() { return Array.isArray(state.workspace?.catalogSkus) ? state.workspace.catalogSkus : []; }
  function manageableCatalog() { return catalog().filter((sku) => can(sku.brandId, caps.CAPABILITIES.TECH_PACK_MANAGE)); }

  function reset() { ui.items = []; ui.loaded = false; ui.error = ''; ui.selectedCode = null; ui.generation += 1; }
  async function fetchAll(request = api) {
    const byCode = new Map();
    const seen = new Set();
    let cursor = null;
    for (let page = 1; page <= 500; page += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const result = await request(`/v2/tech-packs?${query.toString()}`);
      if (!result || !Array.isArray(result.items)) throw new Error('TECH_PACK_PAGE_INVALID');
      for (const value of result.items) {
        if (!value || typeof value.techPackCode !== 'string') throw new Error('TECH_PACK_ITEM_INVALID');
        byCode.set(value.techPackCode, value);
      }
      const next = result.nextCursor || null;
      if (!next) return Object.freeze([...byCode.values()]);
      if (seen.has(next)) throw new Error('TECH_PACK_CURSOR_CYCLE');
      seen.add(next); cursor = next;
    }
    throw new Error('TECH_PACK_PAGE_LIMIT_EXCEEDED');
  }
  async function load({ reset: shouldReset = false } = {}) {
    if (ui.loading) return;
    if (shouldReset) reset();
    ui.loading = true; ui.error = '';
    const generation = ui.generation;
    try {
      const items = await fetchAll();
      if (generation !== ui.generation) return;
      ui.items = [...items].sort((a, b) => String(a.techPackCode).localeCompare(String(b.techPackCode)));
      ui.loaded = true;
      if (!ui.selectedCode && ui.items.length) ui.selectedCode = ui.items[0].techPackCode;
    } catch (error) {
      if (generation === ui.generation) ui.error = error?.message || 'TECH_PACK_LOAD_FAILED';
    } finally {
      if (generation === ui.generation) ui.loading = false;
      if (state.view === 'tech-packs') renderApp();
    }
  }
  function ensureLoaded() { if (!ui.loaded && !ui.loading) queueMicrotask(() => { void load({ reset: true }); }); }
  function upsert(value) {
    const map = new Map(ui.items.map((item) => [item.techPackCode, item]));
    map.set(value.techPackCode, value);
    ui.items = [...map.values()].sort((a, b) => String(a.techPackCode).localeCompare(String(b.techPackCode)));
    ui.selectedCode = value.techPackCode;
  }
  function selected() { return ui.items.find((value) => value.techPackCode === ui.selectedCode) || ui.items[0] || null; }
  async function command(value, path, body, method = 'POST') {
    if (ui.busyCode) return null;
    ui.busyCode = value?.techPackCode || 'new'; renderApp();
    try {
      const result = await mutate(path, body, method);
      upsert(result); toast(text('Изменения сохранены.', 'Changes saved.')); return result;
    } catch (error) {
      if (error?.code === 'TECH_PACK_CONCURRENCY_CONFLICT') queueMicrotask(() => { void load({ reset: true }); });
      toast(error?.message || 'TECH_PACK_MUTATION_FAILED', 'error'); return null;
    } finally { ui.busyCode = null; renderApp(); }
  }

  function metric(label, value, detail) { return h('article', { className: 'tech-pack-kpi' }, [h('span', { text: label }), h('strong', { text: value }), h('small', { text: detail })]); }
  function header(summary) {
    return h('header', { className: 'tech-pack-header' }, [
      h('div', {}, [h('p', { className: 'eyebrow', text: 'PLM / TECH PACK CONTROL' }), h('h1', { text: text('Технические пакеты', 'Tech Packs') }), h('p', { className: 'muted', text: text('Версионный производственный контракт: выпуск, подтверждение фабрики и допуск к размещению производства.', 'Versioned production contract: issue, supplier acknowledgement and production-allocation readiness.') })]),
      h('div', { className: 'tech-pack-header-actions' }, [canManageAny() ? h('button', { type: 'button', className: 'primary', text: text('Создать техпак', 'Create Tech Pack'), onclick: () => openDraft(null) }) : null, h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: text('Обновить', 'Refresh'), onclick: () => { void load({ reset: true }); } })]),
      h('section', { className: 'tech-pack-kpis' }, [
        metric(text('Всего', 'Total'), summary.total, text('Все редакции', 'All revisions')),
        metric(text('Выпущено', 'Issued'), summary.issued, text('Ждут фабрику', 'Awaiting supplier')),
        metric(text('Готово', 'Ready'), summary.ready, text('Допуск к allocation', 'Allocation allowed')),
        metric(text('Заблокировано', 'Blocked'), summary.blocked, text('Нет подтверждения', 'Not acknowledged')),
      ]),
    ]);
  }
  function filters() {
    const status = h('select', { onchange: (event) => { ui.status = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('Все статусы', 'All statuses') }), ...STATUSES.map((value) => h('option', { value, text: labelStatus(value) }))]); status.value = ui.status;
    const readiness = h('select', { onchange: (event) => { ui.readiness = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('Любой допуск', 'All readiness') }), h('option', { value: 'ready', text: text('Готово к производству', 'Production ready') }), h('option', { value: 'blocked', text: text('Заблокировано', 'Blocked') })]); readiness.value = ui.readiness;
    return h('div', { className: 'tech-pack-filters' }, [h('input', { type: 'search', value: ui.search, placeholder: text('Код, SKU, фабрика…', 'Code, SKU, supplier…'), oninput: (event) => { ui.search = event.target.value; renderApp(); } }), status, readiness]);
  }
  function registry(items) {
    const rows = items.map((value) => {
      const ready = core.isProductionReady(value);
      const row = h('tr', { className: ui.selectedCode === value.techPackCode ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: value.techPackCode }), h('small', { text: value.title })]), h('td', { text: value.sku }), h('td', { text: `R${value.revision}` }),
        h('td', {}, [badge(labelStatus(value.status), ready ? 'ok' : value.status === 'withdrawn' ? 'neutral' : 'medium')]), h('td', { text: value.supplierName || '—' }),
        h('td', {}, [ready ? badge(text('Допущен', 'Ready'), 'ok') : badge(text('Стоп', 'Blocked'), 'high')]), h('td', { text: date(value.updatedAt) }),
      ]);
      const choose = () => { ui.selectedCode = value.techPackCode; renderApp(); };
      row.addEventListener('click', choose); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
      return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '7', className: 'tech-pack-empty', text: ui.loading ? text('Загрузка…', 'Loading…') : text('Нет техпаков для выбранных фильтров.', 'No Tech Packs match the filters.') })]));
    return h('div', { className: 'tech-pack-table-wrap' }, [h('table', { className: 'tech-pack-table' }, [h('thead', {}, [h('tr', {}, [text('Техпак', 'Tech Pack'), 'SKU', text('Редакция', 'Revision'), text('Статус', 'Status'), text('Фабрика', 'Supplier'), text('Допуск', 'Readiness'), text('Обновлён', 'Updated')].map((item) => h('th', { text: item })))]), h('tbody', {}, rows)])]);
  }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value ?? '—' })]); }
  function inspector(value) {
    if (!value) return h('aside', { className: 'tech-pack-inspector' }, [h('p', { className: 'muted', text: text('Выберите техпак.', 'Select a Tech Pack.') })]);
    const ready = core.isProductionReady(value);
    const actions = core.allowedActions(value, { canManage: can(value.brandId, caps.CAPABILITIES.TECH_PACK_MANAGE), canAcknowledge: can(value.brandId, caps.CAPABILITIES.TECH_PACK_ACKNOWLEDGE) });
    const buttons = actions.map((action) => actionButton(action, value));
    const snapshot = value.dependencySnapshot || {};
    return h('aside', { className: 'tech-pack-inspector' }, [
      h('div', { className: `tech-pack-readiness ${ready ? 'ready' : 'blocked'}` }, [h('strong', { text: ready ? text('Готов к размещению производства', 'Ready for production allocation') : text('Размещение производства заблокировано', 'Production allocation blocked') }), h('span', { text: ready ? text('Фабрика подтвердила текущую выпущенную версию.', 'Supplier acknowledged the current issued version.') : text('Нужен выпущенный и подтверждённый фабрикой техпак.', 'An issued and supplier-acknowledged Tech Pack is required.') })]),
      h('div', { className: 'tech-pack-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: value.techPackCode }), h('h2', { text: value.title })]), h('div', { className: 'tech-pack-actions' }, buttons)]),
      h('dl', { className: 'tech-pack-facts' }, [pair('SKU', value.sku), pair(text('Редакция', 'Revision'), value.revision), pair(text('Фабрика', 'Supplier'), `${value.supplierCode || '—'} · ${value.supplierName || '—'}`), pair(text('Выпущен', 'Issued'), date(value.issuedAt)), pair(text('Подтверждён', 'Acknowledged'), date(value.acknowledgedAt)), pair(text('Ссылка подтверждения', 'Acknowledgement reference'), value.acknowledgement?.acknowledgementReference)]),
      h('section', { className: 'tech-pack-card' }, [h('h3', { text: text('Зафиксированные зависимости', 'Immutable dependencies') }), h('dl', { className: 'tech-pack-facts' }, [pair(text('Версия SKU', 'SKU version'), snapshot.skuVersion), pair(text('Версия BOM', 'BOM version'), snapshot.bomVersion), pair(text('Версия Measurement Chart', 'Measurement version'), snapshot.measurementChartVersion), pair(text('Одобренный PPS', 'Approved PPS'), snapshot.sampleCode)])]),
      h('section', { className: 'tech-pack-card' }, [h('h3', { text: text('Производственные указания', 'Production instructions') }), h('p', { text: value.constructionNotes || '—' }), h('p', { text: value.qualityNotes || '—' }), h('p', { text: value.packingNotes || '—' })]),
    ]);
  }
  function actionButton(action, value) {
    const labels = { edit: [text('Редактировать', 'Edit'), 'secondary'], issue: [text('Выпустить', 'Issue'), 'primary'], acknowledge: [text('Зафиксировать подтверждение', 'Record acknowledgement'), 'primary'], revision: [text('Новая редакция', 'New revision'), 'secondary'], withdraw: [text('Отозвать', 'Withdraw'), 'danger'] };
    const handlers = { edit: () => openDraft(value), issue: () => confirmIssue(value), acknowledge: () => openAcknowledgement(value), revision: () => openRevision(value), withdraw: () => openWithdraw(value) };
    return h('button', { type: 'button', className: labels[action][1], disabled: Boolean(ui.busyCode), text: labels[action][0], onclick: handlers[action] });
  }

  function field(label, control) { return h('label', { className: 'tech-pack-field' }, [h('span', { text: label }), control]); }
  function input(name, value = '', attrs = {}) { return h('input', { name, type: 'text', value: value ?? '', ...attrs }); }
  function textarea(name, value = '', attrs = {}) { return h('textarea', { name, text: value ?? '', ...attrs }); }
  function select(name, options, value) { const control = h('select', { name }, options.map(([id, label]) => h('option', { value: id, text: label }))); control.value = value; return control; }
  function dialog(title, fields, submit, label = text('Сохранить', 'Save')) {
    const modal = h('dialog', { className: 'tech-pack-dialog' });
    const form = h('form', { method: 'dialog', className: 'tech-pack-form' }, [h('div', { className: 'tech-pack-dialog-head' }, [h('h2', { text: title }), h('button', { type: 'button', className: 'icon-button', text: '×', onclick: () => modal.close() })]), ...fields, h('div', { className: 'tech-pack-dialog-actions' }, [h('button', { type: 'button', className: 'secondary', text: text('Отмена', 'Cancel'), onclick: () => modal.close() }), h('button', { type: 'submit', className: 'primary', text: label })])]);
    form.addEventListener('submit', async (event) => { event.preventDefault(); const result = await submit(Object.fromEntries(new FormData(form).entries())); if (result !== false) modal.close(); });
    modal.addEventListener('close', () => modal.remove()); modal.append(form); document.body.append(modal); modal.showModal();
  }
  function editableFields(value = {}) { return [field(text('Код фабрики', 'Supplier code'), input('supplierCode', value.supplierCode, { required: true, maxlength: '64' })), field(text('Фабрика', 'Supplier name'), input('supplierName', value.supplierName, { required: true, maxlength: '160' })), field('Email', input('supplierEmail', value.supplierEmail, { required: true, maxlength: '254' })), field(text('Название', 'Title'), input('title', value.title, { required: true, minlength: '3', maxlength: '200' })), field(text('Описание', 'Description'), textarea('description', value.description, { rows: '3', maxlength: '4000' })), field(text('Конструкция', 'Construction notes'), textarea('constructionNotes', value.constructionNotes, { rows: '4', required: true, maxlength: '8000' })), field(text('Контроль качества', 'Quality notes'), textarea('qualityNotes', value.qualityNotes, { rows: '4', required: true, maxlength: '4000' })), field(text('Упаковка', 'Packing notes'), textarea('packingNotes', value.packingNotes, { rows: '4', required: true, maxlength: '4000' }))]; }
  function payload(values) { return { supplierCode: values.supplierCode, supplierName: values.supplierName, supplierEmail: values.supplierEmail, title: values.title, description: values.description || null, constructionNotes: values.constructionNotes, qualityNotes: values.qualityNotes, packingNotes: values.packingNotes }; }
  function openDraft(value) {
    const options = manageableCatalog().map((sku) => [sku.sku, `${sku.sku} · ${sku.name || ''}`]);
    if (!value && !options.length) { toast(text('Нет доступных SKU.', 'No manageable SKU is available.'), 'error'); return; }
    const sku = value ? h('input', { name: 'sku', value: value.sku, disabled: true }) : select('sku', options, options[0][0]);
    const code = input('techPackCode', value?.techPackCode || `TP-${options[0]?.[0] || value?.sku}-R01`, { required: true, maxlength: '64', disabled: Boolean(value) });
    dialog(value ? text('Редактировать техпак', 'Edit Tech Pack') : text('Новый техпак', 'New Tech Pack'), [field('SKU', sku), field(text('Код техпака', 'Tech Pack code'), code), ...editableFields(value)], async (values) => {
      if (value) return Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}`, { expectedVersion: value.version, ...payload(values) }, 'PATCH'));
      return Boolean(await command(null, '/v2/tech-packs', { techPackCode: values.techPackCode, sku: values.sku, ...payload(values) }));
    });
  }
  async function confirmIssue(value) { if (confirm(text(`Выпустить ${value.techPackCode}? После выпуска редакция неизменяема.`, `Issue ${value.techPackCode}? The revision becomes immutable.`))) await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/issue`, { expectedVersion: value.version }); }
  function openAcknowledgement(value) { dialog(text('Подтверждение фабрики', 'Supplier acknowledgement'), [field(text('Код фабрики', 'Supplier code'), input('supplierCode', value.supplierCode, { readonly: true, required: true })), field(text('Ссылка / номер подтверждения', 'Acknowledgement reference'), input('acknowledgementReference', '', { required: true, minlength: '2', maxlength: '160' })), field(text('Подтвердил', 'Acknowledged by'), input('acknowledgedBy', '', { required: true, minlength: '2', maxlength: '160' })), field(text('Комментарий', 'Notes'), textarea('notes', '', { rows: '4', maxlength: '1000' }))], async (values) => Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/acknowledge`, { expectedVersion: value.version, supplierCode: values.supplierCode, acknowledgementReference: values.acknowledgementReference, acknowledgedBy: values.acknowledgedBy, notes: values.notes || null })), text('Зафиксировать', 'Record'));
  }
  function openRevision(value) { dialog(text('Новая редакция', 'New revision'), [field(text('Код новой редакции', 'New revision code'), input('techPackCode', core.nextRevisionCode(value), { required: true, maxlength: '64' }))], async (values) => Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/revisions`, { expectedVersion: value.version, techPackCode: values.techPackCode })), text('Создать редакцию', 'Create revision'));
  }
  function openWithdraw(value) { dialog(text('Отозвать техпак', 'Withdraw Tech Pack'), [field(text('Причина', 'Reason'), textarea('reason', '', { required: true, minlength: '5', maxlength: '500', rows: '4' }))], async (values) => Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/withdraw`, { expectedVersion: value.version, reason: values.reason })), text('Отозвать', 'Withdraw'));
  }

  function renderTechPacks() {
    ensureLoaded();
    const summary = core.summarize(ui.items);
    const items = core.filter(ui.items, { status: ui.status, ready: ui.readiness, search: ui.search });
    return h('section', { className: 'tech-pack-page' }, [header(summary), filters(), ui.error ? h('div', { className: 'tech-pack-error' }, [h('strong', { text: text('Не удалось загрузить техпаки', 'Could not load Tech Packs') }), h('span', { text: ui.error }), h('button', { type: 'button', className: 'secondary', text: text('Повторить', 'Retry'), onclick: () => { void load({ reset: true }); } })]) : null, h('div', { className: 'tech-pack-layout' }, [registry(items), inspector(selected())])]);
  }

  const previousRenderView = renderView;
  renderView = (...args) => state.view === 'tech-packs' ? renderTechPacks() : previousRenderView(...args);
  const previousRenderNavigation = renderNavigation;
  renderNavigation = (...args) => {
    const navigation = previousRenderNavigation(...args);
    for (const button of navigation.querySelectorAll('button')) {
      const label = button.textContent.trim();
      if (label !== 'Технические пакеты' && label !== 'Tech packs') continue;
      button.disabled = false;
      button.classList.remove('planned', 'is-planned');
      button.setAttribute('aria-label', text('Открыть технические пакеты', 'Open Tech Packs'));
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); state.view = 'tech-packs'; renderApp(); }, true);
    }
    return navigation;
  };
  global.SynthaTechPacksWorkspace.fetchAll = fetchAll;
})(window);
