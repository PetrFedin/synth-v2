(function installProductionExecutionsWorkspace(global) {
  'use strict';

  const core = global.SynthaProductionExecutionCore;
  const caps = global.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaProductionExecutionCore must load before production-executions.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before production-executions.js');

  const ui = global.SynthaProductionExecutionsWorkspace || {
    items: [], loaded: false, loading: false, error: '', selectedCode: null,
    status: 'all', risk: 'all', search: '', productionOrderNumber: '',
    completionNotes: '', blockReason: '', resolutionNotes: '', cancelReason: '',
    busyCode: null, generation: 0,
  };
  const STATUSES = ['planned', 'active', 'ready-for-qc', 'cancelled'];

  function t(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
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
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === undefined || child === null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function statusLabel(status) {
    const labels = {
      planned: ['Запланировано', 'Planned'], active: ['В производстве', 'Active'],
      'ready-for-qc': ['Готово к QC', 'Ready for QC'], cancelled: ['Отменено', 'Cancelled'],
    };
    return t(...(labels[status] || [status, status]));
  }
  function milestoneLabel(code) {
    const labels = {
      'materials-ready': ['Материалы готовы', 'Materials ready'],
      'cutting-complete': ['Раскрой завершён', 'Cutting complete'],
      'assembly-complete': ['Пошив завершён', 'Assembly complete'],
      'finishing-complete': ['Отделка завершена', 'Finishing complete'],
      'packing-complete': ['Упаковка завершена', 'Packing complete'],
      'ready-for-qc': ['Партия готова к QC', 'Ready for QC'],
    };
    return t(...(labels[code] || [code, code]));
  }
  function date(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed)
      : '—';
  }
  function can(brandId, capability) { return caps.hasForOrganisation(state.workspace, brandId, capability); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.PRODUCTION_EXECUTION_MANAGE, 'brand'); }

  function reset() { ui.items = []; ui.loaded = false; ui.error = ''; ui.selectedCode = null; ui.generation += 1; }
  async function fetchAll(request = api) {
    const byCode = new Map();
    const seen = new Set();
    let cursor = null;
    for (let page = 1; page <= 500; page += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const result = await request(`/v2/production-executions?${query}`);
      if (!result || !Array.isArray(result.items)) throw new Error('PRODUCTION_EXECUTION_PAGE_INVALID');
      for (const value of result.items) {
        if (!value || typeof value.executionCode !== 'string') throw new Error('PRODUCTION_EXECUTION_ITEM_INVALID');
        byCode.set(value.executionCode, value);
      }
      const next = result.nextCursor || null;
      if (!next) return Object.freeze([...byCode.values()]);
      if (seen.has(next)) throw new Error('PRODUCTION_EXECUTION_CURSOR_CYCLE');
      seen.add(next);
      cursor = next;
    }
    throw new Error('PRODUCTION_EXECUTION_PAGE_LIMIT_EXCEEDED');
  }
  async function load({ reset: shouldReset = false } = {}) {
    if (ui.loading) return;
    if (shouldReset) reset();
    ui.loading = true; ui.error = '';
    const generation = ui.generation;
    try {
      const items = await fetchAll();
      if (generation !== ui.generation) return;
      ui.items = [...items].sort((a, b) => String(a.executionCode).localeCompare(String(b.executionCode)));
      ui.loaded = true;
      if (!ui.selectedCode && ui.items.length) ui.selectedCode = ui.items[0].executionCode;
    } catch (error) {
      if (generation === ui.generation) ui.error = error?.message || 'PRODUCTION_EXECUTION_LOAD_FAILED';
    } finally {
      if (generation === ui.generation) ui.loading = false;
      if (state.view === 'production-executions') renderApp();
    }
  }
  function ensureLoaded() { if (!ui.loaded && !ui.loading) queueMicrotask(() => { void load({ reset: true }); }); }
  function selected() { return ui.items.find((value) => value.executionCode === ui.selectedCode) || ui.items[0] || null; }
  function upsert(value) {
    const map = new Map(ui.items.map((item) => [item.executionCode, item]));
    map.set(value.executionCode, value);
    ui.items = [...map.values()].sort((a, b) => String(a.executionCode).localeCompare(String(b.executionCode)));
    ui.selectedCode = value.executionCode;
  }
  function clearInputs() { ui.completionNotes = ''; ui.blockReason = ''; ui.resolutionNotes = ''; ui.cancelReason = ''; }
  function requireText(value, minimum, message) {
    const normalized = String(value || '').trim();
    if (normalized.length < minimum) { toast(message, 'error'); return null; }
    return normalized;
  }
  async function command(code, path, body) {
    if (ui.busyCode) return null;
    ui.busyCode = code || 'new'; renderApp();
    try {
      const value = await mutate(path, body, 'POST');
      upsert(value); clearInputs();
      toast(t('Производственный календарь обновлён.', 'Production calendar updated.'));
      return value;
    } catch (error) {
      if (error?.code === 'PRODUCTION_EXECUTION_CONCURRENCY_CONFLICT') queueMicrotask(() => { void load({ reset: true }); });
      toast(error?.message || 'PRODUCTION_EXECUTION_MUTATION_FAILED', 'error');
      return null;
    } finally { ui.busyCode = null; renderApp(); }
  }

  function metric(label, value, detail, tone = '') {
    return h('article', { className: `production-execution-kpi ${tone}` }, [
      h('span', { text: label }), h('strong', { text: value }), h('small', { text: detail }),
    ]);
  }
  function header(summary) {
    const children = [
      h('div', {}, [
        h('p', { className: 'eyebrow', text: 'PLM / PRODUCTION EXECUTION' }),
        h('h1', { text: t('Производственный календарь', 'Production Execution') }),
        h('p', { className: 'muted', text: t('Фактическое прохождение партии от подтверждённого PO до допуска к контролю качества. Этапы выполняются строго последовательно.', 'Actual batch progress from a confirmed PO to the quality-control gate. Milestones are completed strictly in sequence.') }),
      ]),
      h('div', { className: 'production-execution-header-actions' }, [
        h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: t('Обновить', 'Refresh'), onclick: () => { void load({ reset: true }); } }),
      ]),
    ];
    if (canManageAny()) children.push(h('div', { className: 'production-execution-create' }, [
      h('input', { value: ui.productionOrderNumber, placeholder: t('Номер подтверждённого PO', 'Confirmed PO number'), oninput: (event) => { ui.productionOrderNumber = event.target.value.toUpperCase(); } }),
      h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Создать календарь', 'Create calendar'), onclick: () => {
        const number = requireText(ui.productionOrderNumber, 3, t('Укажите номер подтверждённого PO.', 'Enter a confirmed PO number.'));
        if (number) void command('new', `/v2/production-executions/from-production-order/${encodeURIComponent(number)}`, {});
      } }),
    ]));
    children.push(h('section', { className: 'production-execution-kpis' }, [
      metric(t('Всего', 'Total'), summary.total, t('Все партии', 'All batches')),
      metric(t('В производстве', 'Active'), summary.active, t('Текущие партии', 'Current batches')),
      metric(t('Блокировки', 'Blocked'), summary.blocked, t('Требуют решения', 'Need resolution'), summary.blocked ? 'risk' : ''),
      metric(t('Просрочено', 'Overdue'), summary.overdue, t('Текущий этап', 'Current milestone'), summary.overdue ? 'risk' : ''),
      metric(t('Готово к QC', 'Ready for QC'), summary.ready, t('Закрыт production gate', 'Production gate closed'), 'ok'),
    ]));
    return h('header', { className: 'production-execution-header' }, children);
  }
  function filters() {
    const status = h('select', { onchange: (event) => { ui.status = event.target.value; renderApp(); } }, [
      h('option', { value: 'all', text: t('Все статусы', 'All statuses') }),
      ...STATUSES.map((value) => h('option', { value, text: statusLabel(value) })),
    ]);
    status.value = ui.status;
    const risk = h('select', { onchange: (event) => { ui.risk = event.target.value; renderApp(); } }, [
      h('option', { value: 'all', text: t('Любой риск', 'All risk states') }),
      h('option', { value: 'blocked', text: t('Только блокировки', 'Blocked only') }),
      h('option', { value: 'overdue', text: t('Только просроченные', 'Overdue only') }),
    ]);
    risk.value = ui.risk;
    return h('div', { className: 'production-execution-filters' }, [
      h('input', { type: 'search', value: ui.search, placeholder: t('Execution, PO, SKU, фабрика…', 'Execution, PO, SKU, supplier…'), oninput: (event) => { ui.search = event.target.value; renderApp(); } }),
      status, risk,
    ]);
  }
  function progressBar(value) {
    const progress = core.progress(value);
    return h('div', { className: 'production-progress' }, [
      h('div', { className: 'production-progress-track' }, [h('span', { className: `production-progress-fill production-progress-${progress.completed}` })]),
      h('small', { text: `${progress.completed}/${progress.total} · ${progress.percent}%` }),
    ]);
  }
  function registry(items) {
    const rows = items.map((value) => {
      const current = core.currentMilestone(value);
      const blocked = core.isBlocked(value);
      const overdue = core.isOverdue(value);
      const row = h('tr', { className: ui.selectedCode === value.executionCode ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: value.executionCode }), h('small', { text: value.productionOrderNumber })]),
        h('td', { text: value.sku }), h('td', { text: value.supplierCode }), h('td', { text: value.quantity }),
        h('td', {}, [progressBar(value)]),
        h('td', {}, [h('span', { className: `production-execution-badge ${value.status}`, text: statusLabel(value.status) }), blocked ? h('small', { className: 'production-risk-text', text: t('Заблокировано', 'Blocked') }) : overdue ? h('small', { className: 'production-risk-text', text: t('Просрочено', 'Overdue') }) : null]),
        h('td', {}, [h('strong', { text: current ? milestoneLabel(current.code) : '—' }), h('small', { text: current ? date(current.dueAt) : date(value.readyForQcAt) })]),
      ]);
      const choose = () => { ui.selectedCode = value.executionCode; clearInputs(); renderApp(); };
      row.addEventListener('click', choose);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
      return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '7', className: 'production-execution-empty', text: ui.loading ? t('Загрузка…', 'Loading…') : t('Нет партий для выбранных фильтров.', 'No batches match the filters.') })]));
    return h('div', { className: 'production-execution-registry' }, [h('table', { className: 'production-execution-table' }, [
      h('thead', {}, [h('tr', {}, [t('Календарь', 'Execution'), 'SKU', t('Фабрика', 'Supplier'), t('Количество', 'Quantity'), t('Прогресс', 'Progress'), t('Статус', 'Status'), t('Текущий этап', 'Current milestone')].map((label) => h('th', { text: label })))]),
      h('tbody', {}, rows),
    ])]);
  }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value ?? '—' })]); }
  function formatVariance(minutes) {
    if (!Number.isInteger(minutes)) return '—';
    if (minutes === 0) return t('по плану', 'on time');
    const absolute = Math.abs(minutes); const days = Math.floor(absolute / 1440); const hours = Math.floor((absolute % 1440) / 60);
    const value = days ? `${days}${t('д', 'd')} ${hours}${t('ч', 'h')}` : `${hours}${t('ч', 'h')}`;
    return minutes > 0 ? `+${value}` : `−${value}`;
  }
  function timeline(value) {
    return h('ol', { className: 'production-timeline' }, value.milestones.map((milestone) => h('li', { className: `production-milestone ${milestone.status}` }, [
      h('span', { className: 'production-milestone-sequence', text: milestone.sequence }),
      h('div', {}, [
        h('strong', { text: milestoneLabel(milestone.code) }), h('small', { text: `${t('План', 'Due')}: ${date(milestone.dueAt)}` }),
        milestone.completedAt ? h('small', { text: `${t('Факт', 'Actual')}: ${date(milestone.completedAt)} · ${formatVariance(milestone.varianceMinutes)}` }) : null,
        milestone.blockReason ? h('small', { className: 'production-risk-text', text: `${t('Стоп', 'Block')}: ${milestone.blockReason}` }) : null,
        milestone.resolutionNotes ? h('small', { text: `${t('Решение', 'Resolution')}: ${milestone.resolutionNotes}` }) : null,
      ]),
    ])));
  }
  function actionPanel(value, current, actions) {
    if (current.status === 'blocked') return h('section', { className: 'production-execution-card production-execution-command' }, [
      h('h3', { text: milestoneLabel(current.code) }), h('p', { className: 'production-risk-text', text: current.blockReason }),
      h('textarea', { value: ui.resolutionNotes, placeholder: t('Как устранена блокировка — минимум 5 символов', 'How the block was resolved — at least 5 characters'), oninput: (event) => { ui.resolutionNotes = event.target.value; } }),
      actions.includes('resolve') ? h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Снять блокировку', 'Resolve block'), onclick: () => {
        const notes = requireText(ui.resolutionNotes, 5, t('Опишите решение блокировки.', 'Describe the block resolution.'));
        if (notes) void command(value.executionCode, `/v2/production-executions/${encodeURIComponent(value.executionCode)}/milestones/resolve`, { expectedVersion: value.version, milestoneCode: current.code, notes });
      } }) : null,
    ]);
    return h('section', { className: 'production-execution-card production-execution-command' }, [
      h('h3', { text: milestoneLabel(current.code) }),
      h('textarea', { value: ui.completionNotes, placeholder: t('Комментарий к завершению — необязательно', 'Completion notes — optional'), oninput: (event) => { ui.completionNotes = event.target.value; } }),
      actions.includes('complete') ? h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Завершить текущий этап', 'Complete current milestone'), onclick: () => { void command(value.executionCode, `/v2/production-executions/${encodeURIComponent(value.executionCode)}/milestones/complete`, { expectedVersion: value.version, milestoneCode: current.code, notes: String(ui.completionNotes || '').trim() || null }); } }) : null,
      h('input', { value: ui.blockReason, placeholder: t('Причина блокировки — минимум 5 символов', 'Block reason — at least 5 characters'), oninput: (event) => { ui.blockReason = event.target.value; } }),
      actions.includes('block') ? h('button', { type: 'button', className: 'danger', disabled: Boolean(ui.busyCode), text: t('Зафиксировать блокировку', 'Report block'), onclick: () => {
        const reason = requireText(ui.blockReason, 5, t('Укажите причину блокировки.', 'Enter a block reason.'));
        if (reason) void command(value.executionCode, `/v2/production-executions/${encodeURIComponent(value.executionCode)}/milestones/block`, { expectedVersion: value.version, milestoneCode: current.code, reason });
      } }) : null,
    ]);
  }
  function cancelPanel(value) {
    return h('section', { className: 'production-execution-card production-execution-cancel' }, [
      h('h3', { text: t('Отмена производственного календаря', 'Cancel production execution') }),
      h('input', { value: ui.cancelReason, placeholder: t('Причина отмены — минимум 5 символов', 'Cancellation reason — at least 5 characters'), oninput: (event) => { ui.cancelReason = event.target.value; } }),
      h('button', { type: 'button', className: 'danger', disabled: Boolean(ui.busyCode), text: t('Отменить календарь', 'Cancel execution'), onclick: () => {
        const reason = requireText(ui.cancelReason, 5, t('Укажите причину отмены.', 'Enter a cancellation reason.'));
        if (reason) void command(value.executionCode, `/v2/production-executions/${encodeURIComponent(value.executionCode)}/cancel`, { expectedVersion: value.version, reason });
      } }),
    ]);
  }
  function inspector(value) {
    if (!value) return h('aside', { className: 'production-execution-inspector' }, [h('p', { className: 'muted', text: t('Выберите производственный календарь.', 'Select a production calendar.') })]);
    const manage = can(value.brandId, caps.CAPABILITIES.PRODUCTION_EXECUTION_MANAGE);
    const actions = core.allowedActions(value, { canManage: manage });
    const current = core.currentMilestone(value);
    const children = [
      h('div', { className: 'production-execution-inspector-head' }, [
        h('div', {}, [h('p', { className: 'eyebrow', text: value.executionCode }), h('h2', { text: statusLabel(value.status) })]),
        h('div', { className: 'production-execution-actions' }, actions.includes('start') ? h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Запустить производство', 'Start production'), onclick: () => { void command(value.executionCode, `/v2/production-executions/${encodeURIComponent(value.executionCode)}/start`, { expectedVersion: value.version }); } }) : null),
      ]),
      h('dl', { className: 'production-execution-facts' }, [pair('PO', value.productionOrderNumber), pair('SKU', value.sku), pair(t('Фабрика', 'Supplier'), value.supplierCode), pair(t('Количество', 'Quantity'), value.quantity), pair(t('Начало окна', 'Window start'), date(value.productionStartAt)), pair(t('Срок поставки', 'Delivery due'), date(value.deliveryDueAt)), pair(t('Подтверждение фабрики', 'Supplier confirmation'), value.sourceSnapshot?.confirmationReference), pair(t('Техпак', 'Tech Pack'), `${value.sourceSnapshot?.techPackCode || '—'} · v${value.sourceSnapshot?.techPackVersion || '—'}`)]),
      h('section', { className: 'production-execution-card' }, [h('h3', { text: t('Контрольные точки', 'Milestones') }), timeline(value)]),
    ];
    if (value.status === 'active' && current && manage) children.push(actionPanel(value, current, actions));
    if (['planned', 'active'].includes(value.status) && manage) children.push(cancelPanel(value));
    return h('aside', { className: 'production-execution-inspector' }, children);
  }
  function renderProductionExecutions() {
    ensureLoaded();
    const summary = core.summarize(ui.items);
    const items = core.filter(ui.items, { status: ui.status, risk: ui.risk, search: ui.search });
    return h('section', { className: 'production-execution-page' }, [
      header(summary), filters(),
      ui.error ? h('div', { className: 'production-execution-error' }, [h('strong', { text: t('Не удалось загрузить календарь', 'Could not load production calendar') }), h('span', { text: ui.error }), h('button', { type: 'button', className: 'secondary', text: t('Повторить', 'Retry'), onclick: () => { void load({ reset: true }); } })]) : null,
      h('div', { className: 'production-execution-layout' }, [registry(items), inspector(selected())]),
    ]);
  }

  const previousRenderView = renderView;
  renderView = (...args) => state.view === 'production-executions' ? renderProductionExecutions() : previousRenderView(...args);
  const previousRenderNavigation = renderNavigation;
  renderNavigation = (...args) => {
    const navigation = previousRenderNavigation(...args);
    if (!navigation.querySelector('[data-production-executions-nav]')) {
      navigation.append(h('button', { type: 'button', 'data-production-executions-nav': 'true', text: t('Производство', 'Production Execution'), onclick: () => { state.view = 'production-executions'; renderApp(); } }));
    }
    return navigation;
  };
  global.SynthaProductionExecutionsWorkspace = Object.freeze({ fetchAll, load, render: renderProductionExecutions });
})(window);
