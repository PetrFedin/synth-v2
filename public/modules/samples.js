(function installSamplesWorkspace(global) {
  'use strict';

  const core = global.SynthaSampleCore;
  const caps = global.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaSampleCore must load before samples.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before samples.js');

  const ui = global.SynthaSamplesWorkspace || (global.SynthaSamplesWorkspace = {
    items: [], loaded: false, loading: false, error: '', selectedCode: null, status: 'all', sampleType: 'all', overdueOnly: false,
    busyCode: null, generation: 0, referenceTime: null,
  });
  const TYPES = ['proto', 'fit', 'size-set', 'pre-production', 'sales', 'photo'];
  const STATUSES = ['draft', 'requested', 'in-production', 'received', 'approved', 'rejected', 'cancelled'];

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
  function catalog() { return Array.isArray(state.workspace?.catalogSkus) ? state.workspace.catalogSkus : []; }
  function catalogBySku() { return new Map(catalog().map((sku) => [sku.sku, sku])); }
  function canManage(brandId) { return caps.hasForOrganisation(state.workspace, brandId, caps.CAPABILITIES.SAMPLE_MANAGE); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.SAMPLE_MANAGE, 'brand'); }
  function labelStatus(status) {
    const labels = {
      draft: ['Черновик', 'Draft'], requested: ['Запрошен', 'Requested'], 'in-production': ['В производстве', 'In production'],
      received: ['Получен / на проверке', 'Received / review'], approved: ['Одобрен', 'Approved'], rejected: ['Отклонён', 'Rejected'], cancelled: ['Отменён', 'Cancelled'],
    };
    const pair = labels[status] || [status, status];
    return text(pair[0], pair[1]);
  }
  function labelType(type) {
    const labels = { proto: ['Прототип', 'Proto'], fit: ['Примерочный', 'Fit'], 'size-set': ['Размерный ряд', 'Size set'], 'pre-production': ['Предсерийный', 'Pre-production'], sales: ['Продажный', 'Sales'], photo: ['Фото', 'Photo'] };
    const pair = labels[type] || [type, type];
    return text(pair[0], pair[1]);
  }
  function badge(value, tone = 'neutral') { return h('span', { className: `sample-badge sample-${tone}`, text: value }); }
  function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—'; }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value ?? '—' })]); }

  function reset() {
    ui.items = [];
    ui.loaded = false;
    ui.error = '';
    ui.selectedCode = null;
    ui.referenceTime = null;
    ui.generation += 1;
  }

  async function fetchAllSamples(request = api) {
    const byCode = new Map();
    const seen = new Set();
    let cursor = null;
    let referenceTime = null;
    for (let pageCount = 1; pageCount <= 500; pageCount += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const page = await request(`/v2/samples?${query.toString()}`);
      if (!page || !Array.isArray(page.items)) throw new Error('SAMPLE_PAGE_INVALID');
      if (referenceTime && page.referenceTime !== referenceTime) throw new Error('SAMPLE_REFERENCE_TIME_DRIFT');
      referenceTime ||= page.referenceTime;
      for (const sample of page.items) {
        if (!sample || typeof sample.sampleCode !== 'string') throw new Error('SAMPLE_ITEM_INVALID');
        byCode.set(sample.sampleCode, sample);
      }
      const next = page.nextCursor || null;
      if (!next) return Object.freeze({ items: Object.freeze([...byCode.values()]), referenceTime });
      if (seen.has(next)) throw new Error('SAMPLE_CURSOR_CYCLE');
      seen.add(next);
      cursor = next;
    }
    throw new Error('SAMPLE_PAGE_LIMIT_EXCEEDED');
  }

  async function loadSamples({ reset: shouldReset = false } = {}) {
    if (ui.loading) return;
    if (shouldReset) reset();
    ui.loading = true;
    ui.error = '';
    const generation = ui.generation;
    try {
      const result = await fetchAllSamples();
      if (generation !== ui.generation) return;
      ui.items = [...result.items].sort((left, right) => String(left.sampleCode).localeCompare(String(right.sampleCode)));
      ui.referenceTime = result.referenceTime || new Date().toISOString();
      ui.loaded = true;
      if (!ui.selectedCode && ui.items.length) ui.selectedCode = ui.items[0].sampleCode;
    } catch (error) {
      if (generation === ui.generation) ui.error = error?.message || 'SAMPLE_LOAD_FAILED';
    } finally {
      if (generation === ui.generation) ui.loading = false;
      if (state.view === 'samples') renderApp();
    }
  }
  function ensureLoaded() { if (!ui.loaded && !ui.loading) queueMicrotask(() => { void loadSamples({ reset: true }); }); }
  function upsert(sample) {
    const byCode = new Map(ui.items.map((item) => [item.sampleCode, item]));
    byCode.set(sample.sampleCode, sample);
    ui.items = [...byCode.values()].sort((left, right) => String(left.sampleCode).localeCompare(String(right.sampleCode)));
    ui.selectedCode = sample.sampleCode;
  }
  function selectedSample() { return ui.items.find((sample) => sample.sampleCode === ui.selectedCode) || ui.items[0] || null; }
  function filteredItems(referenceTime) {
    return ui.items.filter((sample) => {
      if (ui.status !== 'all' && sample.status !== ui.status) return false;
      if (ui.sampleType !== 'all' && sample.sampleType !== ui.sampleType) return false;
      if (ui.overdueOnly && !core.isOverdue(sample, referenceTime)) return false;
      return true;
    });
  }

  async function runMutation(sampleCode, path, body, method = 'POST') {
    if (ui.busyCode) return null;
    ui.busyCode = sampleCode;
    renderApp();
    try {
      const result = await mutate(path, body, method);
      upsert(result);
      toast(text('Изменения сохранены.', 'Changes saved.'));
      return result;
    } catch (error) {
      if (error?.code === 'SAMPLE_CONCURRENCY_CONFLICT') {
        reset();
        queueMicrotask(() => { void loadSamples({ reset: true }); });
      }
      toast(error?.message || 'SAMPLE_MUTATION_FAILED', 'error');
      return null;
    } finally {
      ui.busyCode = null;
      renderApp();
    }
  }

  function metric(label, value, detail) { return h('article', { className: 'sample-kpi' }, [h('span', { text: label }), h('strong', { text: value }), detail ? h('small', { text: detail }) : null]); }
  function header(summary) {
    const actions = [];
    if (canManageAny()) actions.push(h('button', { type: 'button', className: 'primary', text: text('Создать образец', 'Create sample'), onclick: () => openDraftDialog(null) }));
    actions.push(h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: text('Обновить', 'Refresh'), onclick: () => { void loadSamples({ reset: true }); } }));
    return h('header', { className: 'sample-header' }, [
      h('div', { className: 'sample-title' }, [h('p', { className: 'eyebrow', text: 'PLM / SAMPLE MANAGEMENT' }), h('h1', { text: text('Образцы и согласования', 'Samples and approvals') }), h('p', { className: 'muted', text: text('Полный контроль раундов образцов от запроса фабрике до решения и следующей итерации.', 'End-to-end sample rounds from factory request through decision and the next iteration.') })]),
      h('div', { className: 'sample-header-actions' }, actions),
      h('section', { className: 'sample-kpis' }, [
        metric(text('Всего', 'Total'), summary.total), metric(text('Активные', 'Active'), summary.active), metric(text('Просрочено', 'Overdue'), summary.overdue),
        metric(text('На проверке', 'Review queue'), summary.review), metric(text('Одобрено', 'Approved'), summary.approved), metric(text('Отклонено', 'Rejected'), summary.rejected), metric(text('Устаревший SKU', 'Stale SKU'), summary.stale),
      ]),
    ]);
  }

  function filters() {
    const status = h('select', { 'aria-label': text('Фильтр статуса', 'Status filter'), onchange: (event) => { ui.status = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('Все статусы', 'All statuses') }), ...STATUSES.map((value) => h('option', { value, text: labelStatus(value) }))]);
    status.value = ui.status;
    const type = h('select', { 'aria-label': text('Фильтр типа', 'Type filter'), onchange: (event) => { ui.sampleType = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('Все типы', 'All types') }), ...TYPES.map((value) => h('option', { value, text: labelType(value) }))]);
    type.value = ui.sampleType;
    return h('div', { className: 'sample-filters' }, [status, type, h('label', { className: 'sample-check' }, [h('input', { type: 'checkbox', checked: ui.overdueOnly, onchange: (event) => { ui.overdueOnly = event.target.checked; renderApp(); } }), h('span', { text: text('Только просроченные', 'Overdue only') })])]);
  }

  function registry(items, bySku, referenceTime) {
    const rows = items.map((sample) => {
      const assessment = core.assess(sample, bySku.get(sample.sku), referenceTime);
      const tone = assessment.overdue ? 'high' : sample.status === 'approved' ? 'ok' : sample.status === 'rejected' || sample.status === 'cancelled' ? 'neutral' : 'medium';
      const row = h('tr', { className: ui.selectedCode === sample.sampleCode ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: sample.sampleCode }), h('small', { text: sample.sku })]),
        h('td', {}, [badge(labelType(sample.sampleType), 'neutral')]), h('td', { text: `R${sample.round}` }), h('td', {}, [badge(labelStatus(sample.status), tone)]),
        h('td', { text: sample.supplierName || '—' }), h('td', { text: formatDate(sample.dueAt) }),
        h('td', {}, [assessment.overdue ? badge(text('Просрочено', 'Overdue'), 'high') : assessment.stale ? badge(text('SKU устарел', 'Stale SKU'), 'medium') : badge(text('В норме', 'On track'), 'ok')]),
      ]);
      const select = () => { ui.selectedCode = sample.sampleCode; renderApp(); };
      row.addEventListener('click', select);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
      return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '7', className: 'sample-empty', text: ui.loading ? text('Загрузка…', 'Loading…') : text('Нет образцов для выбранных фильтров.', 'No samples match the filters.') })]));
    return h('div', { className: 'sample-table-wrap' }, [h('table', { className: 'sample-table' }, [h('thead', {}, [h('tr', {}, [text('Образец / SKU', 'Sample / SKU'), text('Тип', 'Type'), text('Раунд', 'Round'), text('Статус', 'Status'), text('Поставщик', 'Supplier'), text('Срок', 'Due'), text('Контроль', 'Control')].map((value) => h('th', { text: value })))]), h('tbody', {}, rows)])]);
  }

  function actionButton(action, sample, assessment) {
    const labels = {
      edit: ['Редактировать', 'Edit'], request: ['Запросить у фабрики', 'Request sample'], 'start-production': ['Запустить производство', 'Start production'],
      receive: ['Принять образец', 'Receive'], approve: ['Одобрить', 'Approve'], reject: ['Отклонить', 'Reject'], cancel: ['Отменить', 'Cancel'], 'next-round': ['Создать следующий раунд', 'Create next round'],
    };
    const handler = {
      edit: () => openDraftDialog(sample), request: () => confirmAction(sample, 'request'), 'start-production': () => confirmAction(sample, 'start-production'),
      receive: () => openReceiptDialog(sample), approve: () => openDecisionDialog(sample, 'approved'), reject: () => openDecisionDialog(sample, 'rejected'),
      cancel: () => openCancellationDialog(sample), 'next-round': () => openNextRoundDialog(sample),
    }[action];
    const primary = ['request', 'start-production', 'receive', 'approve', 'next-round'].includes(action);
    return h('button', { type: 'button', className: primary ? 'primary' : action === 'reject' || action === 'cancel' ? 'danger' : 'secondary', disabled: ui.busyCode === sample.sampleCode || (action === 'request' && assessment.requestIssues.length > 0), text: text(...labels[action]), onclick: handler });
  }

  function inspector(sample, bySku, referenceTime) {
    if (!sample) return h('aside', { className: 'sample-inspector' }, [h('p', { className: 'muted', text: text('Выберите образец.', 'Select a sample.') })]);
    const sku = bySku.get(sample.sku);
    const assessment = core.assess(sample, sku, referenceTime);
    const actions = core.allowedActions(sample, { canManage: canManage(sample.brandId), catalogSku: sku, referenceTime }).map((action) => actionButton(action, sample, assessment));
    const blockers = assessment.requestIssues.map((code) => badge(code, 'medium'));
    return h('aside', { className: 'sample-inspector' }, [
      h('div', { className: 'sample-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: sample.sampleCode }), h('h2', { text: sample.sku }), h('p', { className: 'muted', text: `${labelType(sample.sampleType)} · R${sample.round}` })]), badge(labelStatus(sample.status), assessment.overdue ? 'high' : sample.status === 'approved' ? 'ok' : 'neutral')]),
      h('div', { className: 'sample-inspector-actions' }, actions),
      blockers.length ? h('div', { className: 'sample-blockers' }, [h('strong', { text: text('Перед запросом устраните:', 'Resolve before request:') }), ...blockers]) : null,
      h('dl', { className: 'sample-summary' }, [
        pair(text('Поставщик', 'Supplier'), sample.supplierName || '—'), pair(text('Код поставщика', 'Supplier code'), sample.supplierCode || '—'), pair(text('Срок', 'Due'), formatDate(sample.dueAt)),
        pair(text('Количество', 'Quantity'), String(sample.quantity)), pair(text('Размеры', 'Sizes'), (sample.sizeCodes || []).join(', ')), pair(text('Цвет', 'Colourway'), sample.colourway || '—'),
        pair(text('Версия', 'Version'), String(sample.version)), pair('SKU version', `${sample.skuVersion}${assessment.stale && sku ? ` → ${sku.version}` : ''}`), pair(text('Предыдущий раунд', 'Source round'), sample.sourceSampleCode || '—'),
      ]),
      sample.receipt ? h('section', { className: 'sample-detail-card' }, [h('h3', { text: text('Приёмка', 'Receipt') }), h('p', { text: `${sample.receipt.receivedQuantity} · ${sample.receipt.condition}` }), h('p', { className: 'muted', text: sample.receipt.notes || sample.receipt.trackingReference || '—' })]) : null,
      sample.decision ? h('section', { className: 'sample-detail-card' }, [h('h3', { text: text('Решение', 'Decision') }), h('p', { text: labelStatus(sample.decision.outcome) }), h('p', { className: 'muted', text: sample.decision.notes || '—' })]) : null,
      sample.cancellationReason ? h('section', { className: 'sample-detail-card' }, [h('h3', { text: text('Причина отмены', 'Cancellation reason') }), h('p', { className: 'muted', text: sample.cancellationReason })]) : null,
      sample.notes ? h('section', { className: 'sample-detail-card' }, [h('h3', { text: text('Комментарий', 'Notes') }), h('p', { className: 'muted', text: sample.notes })]) : null,
    ]);
  }

  function renderSamples() {
    ensureLoaded();
    const bySku = catalogBySku();
    const referenceTime = ui.referenceTime || new Date().toISOString();
    const summary = core.summarize(ui.items, bySku, referenceTime);
    const items = filteredItems(referenceTime);
    return h('section', { className: 'sample-page' }, [header(summary), filters(), ui.error ? h('div', { className: 'sample-error' }, [h('strong', { text: text('Не удалось загрузить образцы', 'Could not load samples') }), h('span', { text: ui.error }), h('button', { type: 'button', className: 'secondary', text: text('Повторить', 'Retry'), onclick: () => { void loadSamples({ reset: true }); } })]) : null, h('div', { className: 'sample-layout' }, [registry(items, bySku, referenceTime), inspector(selectedSample(), bySku, referenceTime)])]);
  }

  function field(label, control) { return h('label', { className: 'sample-field' }, [h('span', { text: label }), control]); }
  function input(name, type = 'text', value = '', attrs = {}) { return h('input', { name, type, value: value ?? '', ...attrs }); }
  function textarea(name, value = '', attrs = {}) { return h('textarea', { name, ...attrs, text: value ?? '' }); }
  function select(name, options, value) { const control = h('select', { name }, options.map(([id, label]) => h('option', { value: id, text: label }))); control.value = value; return control; }
  function isoFromLocal(value) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value; }
  function localFromIso(value) { if (!value) return ''; const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
  function defaultDue() { return localFromIso(new Date(Date.now() + 14 * 86_400_000).toISOString()); }
  function parseSizes(value) { return [...new Set(String(value).split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))]; }

  function dialog(title, fields, onSubmit, submitLabel = text('Сохранить', 'Save')) {
    const modal = h('dialog', { className: 'sample-dialog' });
    const form = h('form', { method: 'dialog', className: 'sample-form' }, [h('div', { className: 'sample-dialog-head' }, [h('h2', { text: title }), h('button', { type: 'button', className: 'icon-button', text: '×', 'aria-label': text('Закрыть', 'Close'), onclick: () => modal.close() })]), ...fields, h('div', { className: 'sample-dialog-actions' }, [h('button', { type: 'button', className: 'secondary', text: text('Отмена', 'Cancel'), onclick: () => modal.close() }), h('button', { type: 'submit', className: 'primary', text: submitLabel })])]);
    form.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form).entries()); const completed = await onSubmit(values); if (completed !== false) modal.close(); });
    modal.addEventListener('close', () => modal.remove());
    modal.append(form); document.body.append(modal); modal.showModal();
    return modal;
  }

  function manageableCatalog() { return catalog().filter((sku) => canManage(sku.brandId)).sort((a, b) => String(a.sku).localeCompare(String(b.sku))); }
  function openDraftDialog(sample) {
    const available = manageableCatalog();
    if (!sample && !available.length) { toast(text('Нет доступных SKU для создания образца.', 'No manageable SKU is available.'), 'error'); return; }
    const initialSku = sample?.sku || available[0].sku;
    const skuOptions = available.map((sku) => [sku.sku, `${sku.sku} · ${sku.name || ''}`]);
    const typeOptions = TYPES.map((value) => [value, labelType(value)]);
    const controls = {
      sku: select('sku', skuOptions, initialSku), sampleType: select('sampleType', typeOptions, sample?.sampleType || 'fit'),
      round: input('round', 'number', sample?.round || 1, { min: '1', max: '100', required: true }),
      sampleCode: input('sampleCode', 'text', sample?.sampleCode || `SMP-${initialSku}-FIT-R01`, { required: true, maxlength: '64' }),
      supplierCode: input('supplierCode', 'text', sample?.supplierCode || '', { maxlength: '64' }), supplierName: input('supplierName', 'text', sample?.supplierName || '', { maxlength: '160' }),
      dueAt: input('dueAt', 'datetime-local', localFromIso(sample?.dueAt) || defaultDue()), quantity: input('quantity', 'number', sample?.quantity || 1, { min: '1', max: '100', required: true }),
      sizeCodes: input('sizeCodes', 'text', (sample?.sizeCodes || ['M']).join(', '), { required: true }), colourway: input('colourway', 'text', sample?.colourway || '', { maxlength: '120' }), notes: textarea('notes', sample?.notes || '', { maxlength: '2000', rows: '4' }),
    };
    if (sample) { controls.sku.disabled = true; controls.sampleType.disabled = true; controls.round.disabled = true; controls.sampleCode.disabled = true; }
    controls.sku.addEventListener('change', () => { if (!sample) controls.sampleCode.value = `SMP-${controls.sku.value}-${controls.sampleType.value.toUpperCase()}-R${String(controls.round.value || 1).padStart(2, '0')}`; });
    controls.sampleType.addEventListener('change', () => controls.sku.dispatchEvent(new Event('change')));
    controls.round.addEventListener('input', () => controls.sku.dispatchEvent(new Event('change')));
    dialog(sample ? text('Редактировать образец', 'Edit sample') : text('Новый образец', 'New sample'), [
      field('SKU', controls.sku), field(text('Тип', 'Type'), controls.sampleType), field(text('Раунд', 'Round'), controls.round), field(text('Код образца', 'Sample code'), controls.sampleCode),
      field(text('Код поставщика', 'Supplier code'), controls.supplierCode), field(text('Поставщик', 'Supplier'), controls.supplierName), field(text('Срок', 'Due'), controls.dueAt), field(text('Количество', 'Quantity'), controls.quantity),
      field(text('Размеры через запятую', 'Comma-separated sizes'), controls.sizeCodes), field(text('Цвет', 'Colourway'), controls.colourway), field(text('Комментарий', 'Notes'), controls.notes),
    ], async (values) => {
      const editable = { supplierCode: values.supplierCode || null, supplierName: values.supplierName || null, dueAt: values.dueAt ? isoFromLocal(values.dueAt) : null, quantity: Number(values.quantity), sizeCodes: parseSizes(values.sizeCodes), colourway: values.colourway || null, notes: values.notes || null };
      if (sample) return Boolean(await runMutation(sample.sampleCode, `/v2/samples/${encodeURIComponent(sample.sampleCode)}`, { expectedVersion: sample.version, ...editable }, 'PATCH'));
      return Boolean(await runMutation(values.sampleCode, '/v2/samples', { sampleCode: values.sampleCode, sku: values.sku, sampleType: values.sampleType, round: Number(values.round), ...editable }));
    });
  }

  async function confirmAction(sample, action) {
    const pathByAction = { request: 'request', 'start-production': 'start-production' };
    if (!confirm(text(`Подтвердить действие для ${sample.sampleCode}?`, `Confirm action for ${sample.sampleCode}?`))) return;
    await runMutation(sample.sampleCode, `/v2/samples/${encodeURIComponent(sample.sampleCode)}/${pathByAction[action]}`, { expectedVersion: sample.version });
  }
  function openReceiptDialog(sample) {
    dialog(text('Приёмка образца', 'Receive sample'), [field(text('Получено, шт.', 'Received quantity'), input('receivedQuantity', 'number', sample.quantity, { min: '1', max: '100', required: true })), field(text('Состояние', 'Condition'), select('condition', [['accepted', text('Принят', 'Accepted')], ['damaged', text('Повреждён', 'Damaged')], ['incomplete', text('Неполная комплектация', 'Incomplete')]], 'accepted')), field(text('Трекинг', 'Tracking'), input('trackingReference', 'text', '', { maxlength: '120' })), field(text('Комментарий', 'Notes'), textarea('notes', '', { maxlength: '1000', rows: '4' }))], async (values) => Boolean(await runMutation(sample.sampleCode, `/v2/samples/${encodeURIComponent(sample.sampleCode)}/receive`, { expectedVersion: sample.version, receivedQuantity: Number(values.receivedQuantity), condition: values.condition, trackingReference: values.trackingReference || null, notes: values.notes || null })));
  }
  function openDecisionDialog(sample, decision) {
    dialog(decision === 'approved' ? text('Одобрить образец', 'Approve sample') : text('Отклонить образец', 'Reject sample'), [field(text('Комментарий к решению', 'Decision notes'), textarea('notes', '', { maxlength: '2000', rows: '5', ...(decision === 'rejected' ? { required: true } : {}) }))], async (values) => Boolean(await runMutation(sample.sampleCode, `/v2/samples/${encodeURIComponent(sample.sampleCode)}/decision`, { expectedVersion: sample.version, decision, notes: values.notes || null })), decision === 'approved' ? text('Одобрить', 'Approve') : text('Отклонить', 'Reject'));
  }
  function openCancellationDialog(sample) {
    dialog(text('Отменить образец', 'Cancel sample'), [field(text('Причина отмены', 'Cancellation reason'), textarea('reason', '', { minlength: '5', maxlength: '500', rows: '4', required: true }))], async (values) => Boolean(await runMutation(sample.sampleCode, `/v2/samples/${encodeURIComponent(sample.sampleCode)}/cancel`, { expectedVersion: sample.version, reason: values.reason })), text('Отменить образец', 'Cancel sample'));
  }
  function openNextRoundDialog(sample) {
    dialog(text('Следующий раунд', 'Next round'), [field(text('Код нового образца', 'New sample code'), input('sampleCode', 'text', core.nextRoundCode(sample), { required: true, maxlength: '64' })), field(text('Новый срок', 'New due date'), input('dueAt', 'datetime-local', defaultDue(), { required: true })), field(text('Что исправить', 'Corrections required'), textarea('notes', sample.decision?.notes || '', { maxlength: '2000', rows: '5' }))], async (values) => Boolean(await runMutation(sample.sampleCode, `/v2/samples/${encodeURIComponent(sample.sampleCode)}/next-round`, { expectedVersion: sample.version, sampleCode: values.sampleCode, dueAt: isoFromLocal(values.dueAt), notes: values.notes || null })));
  }

  const previousRenderView = renderView;
  renderView = (...args) => state.view === 'samples' ? renderSamples() : previousRenderView(...args);
  global.SynthaSamplesWorkspace.fetchAllSamples = fetchAllSamples;
})(window);
