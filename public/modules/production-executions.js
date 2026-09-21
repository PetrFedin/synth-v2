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
    // Пооперационный контроль живёт здесь же, где вехи, а не на отдельном экране: проверка
    // относится к конкретной вехе, и разносить их означало бы заставить человека держать две
    // страницы рядом, чтобы понять одну партию.
    catalogue: [], catalogueLoaded: false, checksByExecution: {}, checksLoading: '',
    qcCheckedQuantity: '', qcInspectorName: '', qcDefectCode: '', qcDefectQuantity: '1',
    qcDefects: [], qcNotes: '', qcDispositionNotes: '',
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
      ? new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed)
      : '—';
  }
  function can(brandId, capability) { return caps.hasForOrganisation(state.workspace, brandId, capability); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.PRODUCTION_EXECUTION_MANAGE, 'brand'); }
  function openFinalQuality(value) {
    const workspace = global.SynthaFinalQualityWorkspace;
    if (!workspace || typeof workspace.openForExecution !== 'function') {
      toast(t('Модуль Final Quality недоступен. Обновите страницу и повторите.', 'Final Quality is unavailable. Refresh the page and try again.'), 'error');
      return;
    }
    workspace.openForExecution(value.executionCode);
  }

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
      if (generation === ui.generation) ui.error = error?.message || I18N.t('common.requestError');
    } finally {
      if (generation === ui.generation) ui.loading = false;
      if (state.view === 'production-executions') renderApp();
    }
  }
  // See materials.js: retrying a failed load from render starves the event loop.
  // Каталог дефектов и проверки выбранной партии.
  //
  // The catalogue is fetched once — it changes when a brand edits it, not when a reader looks at
  // another lot — and the checks are fetched per lot, because that is the thing being looked at.
  // Neither failure empties the screen: a lot's milestones and its dates are still worth reading
  // when its inline history could not be loaded, and saying so is better than an error page.
  async function loadCatalogue(request = api) {
    if (ui.catalogueLoaded) return;
    try { ui.catalogue = await request('/v2/defect-types') || []; } catch (error) { ui.catalogue = []; }
    ui.catalogueLoaded = true;
  }
  async function loadChecks(executionCode, request = api) {
    if (!executionCode || ui.checksLoading === executionCode) return;
    ui.checksLoading = executionCode;
    try {
      const page = await request(`/v2/production-executions/${encodeURIComponent(executionCode)}/inline-quality-checks`);
      ui.checksByExecution[executionCode] = page && Array.isArray(page.items) ? page : { items: [], summary: null, pareto: [] };
    } catch (error) {
      ui.checksByExecution[executionCode] = { items: [], summary: null, pareto: [], error: error?.message || '' };
    } finally {
      ui.checksLoading = '';
      if (state.view === 'production-executions') renderApp();
    }
  }
  function ensureInlineQuality(value) {
    if (!value) return;
    if (!ui.catalogueLoaded || ui.checksByExecution[value.executionCode] === undefined) {
      queueMicrotask(async () => { await loadCatalogue(); await loadChecks(value.executionCode); });
    }
  }
  function activeCatalogue() { return ui.catalogue.filter((type) => type.status === 'active'); }
  function defectTypeLabel(code) {
    const type = ui.catalogue.find((candidate) => candidate.code === code);
    if (!type) return code;
    return `${code} · ${t(type.nameRu, type.nameEn)}`;
  }
  function severityLabel(severity) {
    return { critical: t('критический', 'critical'), major: t('значительный', 'major'), minor: t('незначительный', 'minor') }[severity] || severity;
  }
  function dispositionLabel(disposition) {
    return { rework: t('на доработку', 'rework'), scrap: t('в брак', 'scrap'), accepted: t('принято с отклонением', 'accepted') }[disposition] || '—';
  }
  function percent(rate) { return `${(Number(rate || 0) * 100).toFixed(1).replace('.', ',')} %`; }

  function ensureLoaded() { if (!ui.loaded && !ui.loading && !ui.error) queueMicrotask(() => { void load({ reset: true }); }); }
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
      toast(error?.message || I18N.t('common.requestError'), 'error');
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
        h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: t('Обновить', 'Refresh'), onclick: () => { load({ reset: true }).then(() => toast(t('Данные обновлены.', 'Data refreshed.'))).catch((error) => toast(error?.message || t('Не удалось обновить данные.', 'The data could not be refreshed.'), 'error')); } }),
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
      metric(t('Готово к QC', 'Ready for QC'), summary.ready, t('Производственный контур закрыт', 'Production gate closed'), 'ok'),
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
  // Пооперационный контроль партии: что нашли, где и что с этим решили.
  function inlineQualityPanel(value, current, manage) {
    const page = ui.checksByExecution[value.executionCode];
    const children = [h('h3', { text: t('Пооперационный контроль', 'Inline quality control') })];
    if (!page) { children.push(h('p', { className: 'muted', text: t('Загрузка…', 'Loading…') })); return h('section', { className: 'production-execution-card' }, children); }
    if (page.error) children.push(h('p', { className: 'production-execution-warn', text: page.error }));

    const summary = page.summary;
    if (summary && summary.checks > 0) {
      const counts = summary.severityCounts || { critical: 0, major: 0, minor: 0 };
      children.push(h('p', { className: 'muted', text: t(
        `Проверено ${summary.checkedQuantity} из ${value.quantity}, дефектных ${summary.defectiveQuantity} (${percent(summary.defectRate)}). Критических ${counts.critical}, значительных ${counts.major}, незначительных ${counts.minor}.`,
        `${summary.checkedQuantity} of ${value.quantity} checked, ${summary.defectiveQuantity} defective (${percent(summary.defectRate)}). Critical ${counts.critical}, major ${counts.major}, minor ${counts.minor}.`) }));
      if (summary.open > 0) children.push(h('p', { className: 'production-execution-warn', text: t(
        `Не разобрано проверок: ${summary.open}. Веха не закроется, пока по ним нет решения.`,
        `${summary.open} check(s) undecided. The milestone will not close until they are.`) }));
    } else {
      children.push(h('p', { className: 'muted', text: t('Проверок на этой партии пока нет.', 'No inline checks on this lot yet.') }));
    }

    for (const check of page.items) {
      const lines = [
        h('strong', { text: `${milestoneLabel(check.milestoneCode)} · ${t('проверка', 'check')} ${check.checkNumber}` }),
        h('p', { className: 'muted', text: `${check.inspectorName} · ${date(check.recordedAt)}` }),
        h('p', { className: 'muted', text: t(
          `Проверено ${check.checkedQuantity}, дефектных ${check.defectiveQuantity} (${percent(check.defectRate)})`,
          `${check.checkedQuantity} checked, ${check.defectiveQuantity} defective (${percent(check.defectRate)})`) }),
      ];
      for (const defect of check.defects || []) {
        lines.push(h('p', { className: 'muted', text: `${defectTypeLabel(defect.defectCode)} — ${defect.quantity} ${t('шт.', 'pcs')} · ${severityLabel(defect.severity)}${defect.notes ? ` · ${defect.notes}` : ''}` }));
      }
      if (check.status === 'closed' && check.disposition) {
        lines.push(h('p', { className: 'muted', text: `${t('Решение', 'Disposition')}: ${dispositionLabel(check.disposition)}${check.dispositionNotes ? ` · ${check.dispositionNotes}` : ''}` }));
      }
      if (check.status === 'open' && manage) lines.push(dispositionControls(value, check));
      children.push(h('div', { className: `production-execution-check ${check.status}` }, lines));
    }

    // Где работа идёт не так, а не только что она пошла не так.
    if (page.pareto && page.pareto.length > 1) {
      children.push(h('h4', { text: t('Чаще всего', 'Most frequent') }));
      for (const row of page.pareto.slice(0, 5)) {
        children.push(h('p', { className: 'muted', text: `${defectTypeLabel(row.defectCode)} — ${row.quantity} ${t('шт.', 'pcs')}${row.originStage ? ` · ${t('возникает на этапе', 'originates at')} ${milestoneLabel(row.originStage)}` : ''}` }));
      }
    }

    if (value.status === 'active' && current && manage) children.push(recordCheckForm(value, current));
    return h('section', { className: 'production-execution-card' }, children);
  }

  function dispositionControls(value, check) {
    const buttons = [['rework', t('На доработку', 'Rework')], ['scrap', t('В брак', 'Scrap')], ['accepted', t('Принять с отклонением', 'Accept')]]
      .map(([disposition, label]) => h('button', { type: 'button', className: disposition === 'accepted' ? 'secondary' : 'primary', disabled: Boolean(ui.busyCode), text: label, onclick: () => {
        const notes = String(ui.qcDispositionNotes || '').trim();
        // Принять известный брак можно, но только объяснив почему — и сказать об этом здесь, а не
        // дать серверу отказать после нажатия.
        if (disposition === 'accepted' && notes.length < 10) { toast(t('Опишите, почему партия принимается с известным браком.', 'Explain why the lot is accepted with known defects.'), 'error'); return; }
        void commandAndReload(value, `/v2/inline-quality-checks/${encodeURIComponent(check.id)}/disposition`, { expectedVersion: check.version, disposition, ...(notes.length >= 2 ? { notes } : {}) });
      } }));
    return h('div', {}, [
      h('input', { value: ui.qcDispositionNotes, placeholder: t('Что сделано с дефектными изделиями', 'What happens to the defective pieces'), oninput: (event) => { ui.qcDispositionNotes = event.target.value; } }),
      h('div', { className: 'production-execution-actions' }, buttons),
    ]);
  }

  function recordCheckForm(value, current) {
    const catalogue = activeCatalogue();
    if (!catalogue.length) return h('p', { className: 'muted', text: t('Каталог дефектов пуст — зарегистрируйте типы дефектов, чтобы записывать проверки.', 'The defect catalogue is empty — register defect types to record checks.') });
    const codeSelect = h('select', { onchange: (event) => { ui.qcDefectCode = event.target.value; } }, catalogue.map((type) => h('option', { value: type.code, text: `${type.code} · ${t(type.nameRu, type.nameEn)} · ${severityLabel(type.severity)}` })));
    codeSelect.value = ui.qcDefectCode || catalogue[0].code;
    ui.qcDefectCode = codeSelect.value;

    const staged = ui.qcDefects.map((defect, index) => h('p', { className: 'muted', text: `${defectTypeLabel(defect.defectCode)} — ${defect.quantity} ${t('шт.', 'pcs')}`, onclick: () => { ui.qcDefects.splice(index, 1); renderApp(); } }));

    return h('div', {}, [
      h('h4', { text: t(`Записать проверку на этапе «${milestoneLabel(current.code)}»`, `Record a check at «${milestoneLabel(current.code)}»`) }),
      h('input', { value: ui.qcInspectorName, placeholder: t('Имя инспектора', 'Inspector name'), oninput: (event) => { ui.qcInspectorName = event.target.value; } }),
      h('input', { type: 'number', min: 1, value: ui.qcCheckedQuantity, placeholder: t(`Сколько изделий проверено (в партии ${value.quantity})`, `Pieces checked (lot of ${value.quantity})`), oninput: (event) => { ui.qcCheckedQuantity = event.target.value; } }),
      h('div', { className: 'production-execution-actions' }, [
        codeSelect,
        h('input', { type: 'number', min: 1, value: ui.qcDefectQuantity, oninput: (event) => { ui.qcDefectQuantity = event.target.value; } }),
        h('button', { type: 'button', className: 'secondary', text: t('Добавить дефект', 'Add defect'), onclick: () => {
          const quantity = Number(ui.qcDefectQuantity);
          if (!Number.isSafeInteger(quantity) || quantity < 1) { toast(t('Некорректное количество дефектных изделий.', 'Invalid defect quantity.'), 'error'); return; }
          // Два вхождения одного типа — ошибка сложения, а не две находки; складываем здесь же.
          const existing = ui.qcDefects.find((defect) => defect.defectCode === ui.qcDefectCode);
          if (existing) existing.quantity += quantity; else ui.qcDefects.push({ defectCode: ui.qcDefectCode, quantity });
          renderApp();
        } }),
      ]),
      ...(staged.length ? [h('p', { className: 'muted', text: t('Нажмите на строку, чтобы убрать её:', 'Click a line to remove it:') }), ...staged] : []),
      h('input', { value: ui.qcNotes, placeholder: t('Комментарий (необязательно)', 'Notes (optional)'), oninput: (event) => { ui.qcNotes = event.target.value; } }),
      h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Записать проверку', 'Record check'), onclick: () => {
        const inspectorName = requireText(ui.qcInspectorName, 2, t('Укажите инспектора.', 'Enter the inspector name.'));
        if (!inspectorName) return;
        const checkedQuantity = Number(ui.qcCheckedQuantity);
        if (!Number.isSafeInteger(checkedQuantity) || checkedQuantity < 1) { toast(t('Укажите, сколько изделий проверено.', 'Enter how many pieces were checked.'), 'error'); return; }
        if (checkedQuantity > value.quantity) { toast(t(`В партии ${value.quantity} изделий — проверить больше нельзя.`, `The lot holds ${value.quantity} pieces — you cannot check more.`), 'error'); return; }
        const defective = ui.qcDefects.reduce((total, defect) => total + defect.quantity, 0);
        if (defective > checkedQuantity) { toast(t('Дефектных изделий больше, чем проверено.', 'More defective pieces than were checked.'), 'error'); return; }
        const notes = String(ui.qcNotes || '').trim();
        void commandAndReload(value, `/v2/production-executions/${encodeURIComponent(value.executionCode)}/inline-quality-checks`, {
          milestoneCode: current.code, checkedQuantity, inspectorName, defects: ui.qcDefects.map((defect) => ({ ...defect })), ...(notes.length >= 2 ? { notes } : {}),
        }, () => { ui.qcDefects = []; ui.qcNotes = ''; ui.qcCheckedQuantity = ''; });
      } }),
    ]);
  }

  // Проверки не входят в агрегат исполнения, поэтому после записи перечитываются они, а не он.
  async function commandAndReload(value, path, body, after) {
    if (ui.busyCode) return; ui.busyCode = value.executionCode; renderApp();
    try {
      await mutate(path, body, 'POST');
      if (after) after();
      ui.checksLoading = '';
      delete ui.checksByExecution[value.executionCode];
      toast(t('Пооперационный контроль обновлён.', 'Inline quality control updated.'));
    } catch (error) {
      toast(error?.message || I18N.t('common.requestError'), 'error');
    } finally { ui.busyCode = null; renderApp(); }
  }

  function inspector(value) {
    if (!value) return h('aside', { className: 'production-execution-inspector' }, [h('p', { className: 'muted', text: t('Выберите производственный календарь.', 'Select a production calendar.') })]);
    const manage = can(value.brandId, caps.CAPABILITIES.PRODUCTION_EXECUTION_MANAGE);
    const qualityManage = can(value.brandId, caps.CAPABILITIES.QUALITY_MANAGE);
    const actions = core.allowedActions(value, { canManage: manage });
    const current = core.currentMilestone(value);
    const headerActions = [];
    if (actions.includes('start')) headerActions.push(h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Запустить производство', 'Start production'), onclick: () => { void command(value.executionCode, `/v2/production-executions/${encodeURIComponent(value.executionCode)}/start`, { expectedVersion: value.version }); } }));
    if (value.status === 'ready-for-qc' && qualityManage) headerActions.push(h('button', { type: 'button', className: 'primary', 'data-final-quality-handoff': value.executionCode, text: t('Перейти к финальному контролю', 'Open Final Quality'), onclick: () => { openFinalQuality(value); } }));
    const children = [
      h('div', { className: 'production-execution-inspector-head' }, [
        h('div', {}, [h('p', { className: 'eyebrow', text: value.executionCode }), h('h2', { text: statusLabel(value.status) })]),
        h('div', { className: 'production-execution-actions' }, headerActions),
      ]),
      h('dl', { className: 'production-execution-facts' }, [pair('PO', value.productionOrderNumber), pair('SKU', value.sku), pair(t('Фабрика', 'Supplier'), value.supplierCode), pair(t('Количество', 'Quantity'), value.quantity), pair(t('Начало окна', 'Window start'), date(value.productionStartAt)), pair(t('Срок поставки', 'Delivery due'), date(value.deliveryDueAt)), pair(t('Подтверждение фабрики', 'Supplier confirmation'), value.sourceSnapshot?.confirmationReference), pair(t('Техпак', 'Tech Pack'), `${value.sourceSnapshot?.techPackCode || '—'} · v${value.sourceSnapshot?.techPackVersion || '—'}`)]),
      h('section', { className: 'production-execution-card' }, [h('h3', { text: t('Контрольные точки', 'Milestones') }), timeline(value)]),
    ];
    if (qualityManage) { ensureInlineQuality(value); children.push(inlineQualityPanel(value, current, qualityManage)); }
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
// The V7 nav shim runs before this file, so it could not see the global above; the section
// stayed marked as planned and could not be opened. Claim the entry now that it exists.
global.SynthaOmnidataV7Nav?.activate('Production execution', 'production-executions', '\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Production execution');
})(window);