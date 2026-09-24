(function installFinalQualityWorkspace(global) {
  'use strict';

  const core = global.SynthaFinalQualityCore;
  const caps = global.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaFinalQualityCore must load before final-quality.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before final-quality.js');

  const ui = global.SynthaFinalQualityWorkspace || {
    items: [], loaded: false, loading: false, error: '', selectedCode: null,
    status: 'all', risk: 'all', search: '', executionCode: '', busyCode: null, generation: 0,
    inspectorName: '', sampleSize: '32', allowedMajor: '2', allowedMinor: '4',
    // Which criterion the run will be judged by. 'standard' resolves the plan from the rows the
    // brand holds; 'agreed' records a plan agreed with one factory, as agreed.
    planSource: 'standard', planSets: [], planSetsLoaded: false, planSetKey: '', aqlMajor: '', aqlMinor: '', samplingNote: '',
    criticalCount: '0', majorCount: '0', minorCount: '0', defectDescription: '',
    measurementPoint: '', measurementSize: '', measuredValue: '', lowerLimit: '', upperLimit: '',
    workmanshipResult: 'pass', measurementsResult: 'pass', packingResult: 'pass', checkpointSeverity: 'major',
    evidenceReferences: '', completionNotes: '', reviewNotes: '', releaseCode: '',
    reworkReference: '', resolutionNotes: '', cancelReason: '',
  };
  const STATUSES = ['planned','in-progress','review-pending','rework-required','released','rejected','cancelled'];

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
      planned: ['Запланировано', 'Planned'], 'in-progress': ['Инспекция', 'In progress'],
      'review-pending': ['Ожидает решения', 'Review pending'], 'rework-required': ['Требуется доработка', 'Rework required'],
      released: ['Разрешена отгрузка', 'Shipment released'], rejected: ['Партия отклонена', 'Rejected'], cancelled: ['Отменено', 'Cancelled'],
    };
    return t(...(labels[status] || [status, status]));
  }
  function recommendationLabel(value) {
    const labels = { pass: ['Соответствует', 'Pass'], rework: ['Доработка', 'Rework'], reject: ['Отклонить', 'Reject'] };
    return value ? t(...(labels[value] || [value, value])) : '—';
  }
  // The decision the approver took, in the words the buttons used to take it. The run history
  // printed the stored enum, so a Russian reader met "Решение: release" — the one English word
  // on the page, and the only place in the module where a domain value was shown raw.
  function dispositionLabel(value) {
    const labels = { release: ['Отгрузка разрешена', 'Shipment released'], rework: ['Назначена доработка', 'Rework required'], reject: ['Партия отклонена', 'Lot rejected'] };
    return value ? t(...(labels[value] || [value, value])) : '—';
  }
  function date(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed) : '—';
  }
  function can(brandId, capability) { return caps.hasForOrganisation(state.workspace, brandId, capability); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.QUALITY_MANAGE, 'brand'); }
  function reset() { ui.items = []; ui.loaded = false; ui.error = ''; ui.selectedCode = null; ui.generation += 1; }
  async function fetchAll(request = api) {
    const byCode = new Map(); const seen = new Set(); let cursor = null;
    for (let page = 1; page <= 500; page += 1) {
      const query = new URLSearchParams({ limit: '200' }); if (cursor) query.set('cursor', cursor);
      const result = await request(`/v2/final-quality-inspections?${query}`);
      if (!result || !Array.isArray(result.items)) throw new Error('FINAL_QUALITY_PAGE_INVALID');
      for (const value of result.items) {
        if (!value || typeof value.inspectionCode !== 'string') throw new Error('FINAL_QUALITY_ITEM_INVALID');
        byCode.set(value.inspectionCode, value);
      }
      const next = result.nextCursor || null;
      if (!next) return Object.freeze([...byCode.values()]);
      if (seen.has(next)) throw new Error('FINAL_QUALITY_CURSOR_CYCLE');
      seen.add(next); cursor = next;
    }
    throw new Error('FINAL_QUALITY_PAGE_LIMIT_EXCEEDED');
  }
  async function load({ reset: shouldReset = false } = {}) {
    if (ui.loading) return; if (shouldReset) reset(); ui.loading = true; ui.error = '';
    const generation = ui.generation;
    try {
      const items = await fetchAll(); if (generation !== ui.generation) return;
      await loadPlanSets();
      ui.items = [...items].sort((a, b) => String(a.inspectionCode).localeCompare(String(b.inspectionCode)));
      ui.loaded = true; if (!ui.selectedCode && ui.items.length) ui.selectedCode = ui.items[0].inspectionCode;
    } catch (error) { if (generation === ui.generation) ui.error = error?.message || I18N.t('common.requestError'); }
    finally { if (generation === ui.generation) ui.loading = false; if (state.view === 'final-quality') renderApp(); }
  }
  // The plan sets the brand holds. A brand that has loaded none is not broken — it agrees plans with
  // its factories instead — so a failure here leaves the workspace usable on the agreed path rather
  // than failing the whole screen for a list that is an aid, not a prerequisite.
  async function loadPlanSets(request = api) {
    try {
      const sets = await request('/v2/aql-sampling-plans');
      ui.planSets = Array.isArray(sets) ? sets : [];
      ui.planSetsLoaded = true;
      if (!ui.planSets.length) { ui.planSource = 'agreed'; return; }
      if (!ui.planSets.some((set) => planSetKey(set) === ui.planSetKey)) applyPlanSet(ui.planSets[0]);
    } catch (error) {
      ui.planSets = []; ui.planSetsLoaded = true; ui.planSource = 'agreed';
    }
  }
  function planSetKey(set) { return `${set.standardCode}|${set.inspectionLevel}`; }
  function currentPlanSet() { return ui.planSets.find((set) => planSetKey(set) === ui.planSetKey) || null; }
  // Choosing a set chooses the limits it actually offers. Carrying an AQL across to a set that has
  // no rows at it would produce a refusal the inspector could not have predicted from the screen.
  function applyPlanSet(set) {
    ui.planSetKey = planSetKey(set);
    const limits = Array.isArray(set.aqls) ? set.aqls : [];
    ui.aqlMajor = String(limits[0] ?? '');
    ui.aqlMinor = String(limits.length > 1 ? limits[limits.length - 1] : (limits[0] ?? ''));
  }

  // See materials.js: retrying a failed load from render starves the event loop.
  function ensureLoaded() { if (!ui.loaded && !ui.loading && !ui.error) queueMicrotask(() => { void load({ reset: true }); }); }
  function selected() { return ui.items.find((value) => value.inspectionCode === ui.selectedCode) || ui.items[0] || null; }
  function upsert(value) {
    const map = new Map(ui.items.map((item) => [item.inspectionCode, item])); map.set(value.inspectionCode, value);
    ui.items = [...map.values()].sort((a, b) => String(a.inspectionCode).localeCompare(String(b.inspectionCode)));
    ui.selectedCode = value.inspectionCode;
  }
  function clearRunInputs() {
    ui.criticalCount = '0'; ui.majorCount = '0'; ui.minorCount = '0'; ui.defectDescription = '';
    ui.measurementPoint = ''; ui.measurementSize = ''; ui.measuredValue = ''; ui.lowerLimit = ''; ui.upperLimit = '';
    ui.workmanshipResult = 'pass'; ui.measurementsResult = 'pass'; ui.packingResult = 'pass'; ui.evidenceReferences = ''; ui.completionNotes = '';
  }
  function requireText(value, minimum, message) { const normalized = String(value || '').trim(); if (normalized.length < minimum) { toast(message, 'error'); return null; } return normalized; }
  function integer(value, minimum, message) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < minimum) { toast(message, 'error'); return null; } return parsed; }
  async function command(code, path, body) {
    if (ui.busyCode) return null; ui.busyCode = code || 'new'; renderApp();
    try {
      const value = await mutate(path, body, 'POST'); upsert(value);
      toast(t('Контур Final Quality обновлён.', 'Final Quality workflow updated.')); return value;
    } catch (error) {
      if (error?.code === 'QUALITY_CONCURRENCY_CONFLICT') queueMicrotask(() => { void load({ reset: true }); });
      toast(error?.message || I18N.t('common.requestError'), 'error'); return null;
    } finally { ui.busyCode = null; renderApp(); }
  }
  function metric(label, value, detail, tone = '') { return h('article', { className: `final-quality-kpi ${tone}` }, [h('span', { text: label }), h('strong', { text: value }), h('small', { text: detail })]); }
  function header(summary) {
    const children = [h('div', {}, [
      h('p', { className: 'eyebrow', text: 'PLM / FINAL QUALITY' }),
      h('h1', { text: t('Финальный контроль качества', 'Final Quality') }),
      h('p', { className: 'muted', text: t('Инспекция партии, доработка, повторная проверка и неизменяемый допуск к отгрузке.', 'Lot inspection, rework, reinspection and an immutable shipment release.') }),
    ]), h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: t('Обновить', 'Refresh'), onclick: () => { load({ reset: true }).then(() => toast(t('Данные обновлены.', 'Data refreshed.'))).catch((error) => toast(error?.message || t('Не удалось обновить данные.', 'The data could not be refreshed.'), 'error')); } })];
    if (canManageAny()) children.push(h('div', { className: 'final-quality-create' }, [
      h('input', { value: ui.executionCode, placeholder: t('Execution в статусе ready-for-qc', 'Ready-for-QC execution code'), oninput: (event) => { ui.executionCode = event.target.value.toUpperCase(); } }),
      h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Создать инспекцию', 'Create inspection'), onclick: () => {
        const code = requireText(ui.executionCode, 3, t('Укажите production execution.', 'Enter a production execution code.'));
        if (code) void command('new', `/v2/final-quality-inspections/from-execution/${encodeURIComponent(code)}`, {});
      } }),
    ]));
    children.push(h('section', { className: 'final-quality-kpis' }, [
      metric(t('Всего', 'Total'), summary.total, t('Все партии', 'All lots')),
      metric(t('На проверке', 'In progress'), summary.inProgress, t('Активные прогоны', 'Active runs')),
      metric(t('Решение', 'Review'), summary.reviewPending, t('Требуется согласующий', 'Needs approver'), summary.reviewPending ? 'attention' : ''),
      metric(t('Доработка', 'Rework'), summary.rework, t('Нужна повторная проверка', 'Needs reinspection'), summary.rework ? 'risk' : ''),
      metric(t('Допущено', 'Released'), summary.released, t('Можно отгружать', 'Ready to ship'), 'ok'),
    ]));
    return h('header', { className: 'final-quality-header' }, children);
  }
  function filters() {
    const status = h('select', { onchange: (event) => { ui.status = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: t('Все статусы', 'All statuses') }), ...STATUSES.map((value) => h('option', { value, text: statusLabel(value) }))]); status.value = ui.status;
    const risk = h('select', { onchange: (event) => { ui.risk = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: t('Все состояния', 'All states') }), h('option', { value: 'risk', text: t('Только риск', 'Risk only') }), h('option', { value: 'release', text: t('Только допущенные', 'Released only') })]); risk.value = ui.risk;
    return h('div', { className: 'final-quality-filters' }, [h('input', { type: 'search', value: ui.search, placeholder: t('Inspection, execution, PO, SKU, фабрика…', 'Inspection, execution, PO, SKU, supplier…'), oninput: (event) => { ui.search = event.target.value; renderApp(); } }), status, risk]);
  }
  function registry(items) {
    const rows = items.map((value) => {
      const run = core.currentRun(value); const counts = run?.defectCounts;
      const row = h('tr', { className: ui.selectedCode === value.inspectionCode ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: value.inspectionCode }), h('small', { text: value.productionOrderNumber })]),
        h('td', { text: value.sku }), h('td', { text: value.supplierCode }), h('td', { text: value.quantity }),
        h('td', { text: value.currentRun || '—' }),
        h('td', { text: counts ? `${counts.critical}/${counts.major}/${counts.minor}` : '—' }),
        h('td', { text: recommendationLabel(run?.recommendation) }),
        h('td', {}, [h('span', { className: `final-quality-badge ${value.status}`, text: statusLabel(value.status) }), value.shipmentRelease ? h('small', { text: value.shipmentRelease.releaseCode }) : null]),
      ]);
      const choose = () => { ui.selectedCode = value.inspectionCode; renderApp(); };
      row.addEventListener('click', choose); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } }); return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '8', className: 'final-quality-empty', text: ui.loading ? t('Загрузка…', 'Loading…') : t('Нет партий для выбранных фильтров.', 'No lots match the filters.') })]));
    return h('div', { className: 'final-quality-registry' }, [h('table', { className: 'final-quality-table' }, [h('thead', {}, [h('tr', {}, [t('Инспекция', 'Inspection'), 'SKU', t('Фабрика', 'Supplier'), t('Партия', 'Lot'), t('Прогон', 'Run'), 'C/M/m', t('Рекомендация', 'Recommendation'), t('Статус', 'Status')].map((label) => h('th', { text: label })))]), h('tbody', {}, rows)])]);
  }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value ?? '—' })]); }
  function numericInput(label, key, min = 0) { return h('label', {}, [h('span', { text: label }), h('input', { type: 'number', min, value: ui[key], oninput: (event) => { ui[key] = event.target.value; } })]); }
  function planSourceField() {
    const usable = ui.planSets.length > 0;
    const select = h('select', { onchange: (event) => { ui.planSource = event.target.value; renderApp(); } }, [
      h('option', { value: 'standard', text: t('По стандарту', 'By standard'), disabled: !usable }),
      h('option', { value: 'agreed', text: t('Согласован с фабрикой', 'Agreed with the factory') }),
    ]);
    select.value = usable ? ui.planSource : 'agreed';
    return h('label', {}, [h('span', { text: t('Критерий приёмки', 'Acceptance criterion') }), select]);
  }
  function planSetField() {
    const select = h('select', { onchange: (event) => { const set = ui.planSets.find((candidate) => planSetKey(candidate) === event.target.value); if (set) applyPlanSet(set); renderApp(); } },
      ui.planSets.map((set) => h('option', { value: planSetKey(set), text: `${set.standardCode} · ${t('уровень', 'level')} ${set.inspectionLevel}` })));
    select.value = ui.planSetKey;
    return h('label', {}, [h('span', { text: t('Набор планов', 'Plan set') }), select]);
  }
  function aqlField(label, key) {
    const set = currentPlanSet();
    const select = h('select', { onchange: (event) => { ui[key] = event.target.value; } },
      (set?.aqls ?? []).map((limit) => h('option', { value: String(limit), text: `AQL ${limit}` })));
    select.value = ui[key];
    return h('label', {}, [h('span', { text: label }), select]);
  }
  // What the chosen set covers, so a lot outside its ranges is visible before the run is refused
  // rather than after.
  function planSetCoverage(value) {
    const set = currentPlanSet();
    if (!set) return null;
    const covered = value.quantity >= set.lotFrom && value.quantity <= set.lotTo;
    // Каждая подпись — отдельной строкой: <small> строчный, и два подряд склеиваются в одну.
    const lines = [h('p', { className: 'muted', text: t(`Партии ${set.lotFrom}–${set.lotTo} шт., строк: ${set.rows}`, `Lots ${set.lotFrom}–${set.lotTo} pcs, ${set.rows} rows`) })];
    if (!covered) lines.push(h('p', { className: 'final-quality-warn', text: t(`Партия ${value.quantity} шт. не покрыта этим набором — выберите другой или согласуйте план.`, `A lot of ${value.quantity} pcs is not covered by this set — choose another or agree a plan.`) }));
    if (set.sourceNote) lines.push(h('p', { className: 'muted', text: set.sourceNote }));
    return h('div', {}, lines);
  }
  function startPanel(value, reinspection) {
    const byStandard = ui.planSets.length > 0 && ui.planSource === 'standard';
    return h('section', { className: 'final-quality-card final-quality-command' }, [
      h('h3', { text: reinspection ? t('Повторная инспекция', 'Reinspection') : t('План выборки', 'Sampling plan') }),
      h('input', { value: ui.inspectorName, placeholder: t('Имя инспектора', 'Inspector name'), oninput: (event) => { ui.inspectorName = event.target.value; } }),
      h('div', { className: 'final-quality-grid' }, [planSourceField()]),
      // По стандарту объём выборки не набирается: он следует из размера партии и уровня контроля.
      byStandard ? h('div', { className: 'final-quality-grid' }, [planSetField(), aqlField(t('AQL значительные', 'AQL major'), 'aqlMajor'), aqlField(t('AQL незначительные', 'AQL minor'), 'aqlMinor')]) : null,
      byStandard ? planSetCoverage(value) : null,
      byStandard ? h('p', { className: 'muted', text: t('Объём выборки и приёмочные числа определит план — их не нужно вводить.', 'The plan fixes the sample size and the acceptance numbers — they are not typed in.') }) : null,
      byStandard ? null : h('div', { className: 'final-quality-grid' }, [numericInput(t('Размер выборки', 'Sample size'), 'sampleSize', 1), numericInput(t('Допустимо major', 'Allowed major'), 'allowedMajor'), numericInput(t('Допустимо minor', 'Allowed minor'), 'allowedMinor')]),
      byStandard ? null : h('input', { value: ui.samplingNote, placeholder: t('Чем согласован план (необязательно)', 'How the plan was agreed (optional)'), oninput: (event) => { ui.samplingNote = event.target.value; } }),
      reinspection ? h('input', { value: ui.reworkReference, placeholder: t('Ссылка на доработку', 'Rework reference'), oninput: (event) => { ui.reworkReference = event.target.value; } }) : null,
      reinspection ? h('textarea', { value: ui.resolutionNotes, placeholder: t('Что исправлено', 'What was corrected'), oninput: (event) => { ui.resolutionNotes = event.target.value; } }) : null,
      h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: reinspection ? t('Начать повторную инспекцию', 'Start reinspection') : t('Начать инспекцию', 'Start inspection'), onclick: () => {
        const inspectorName = requireText(ui.inspectorName, 2, t('Укажите инспектора.', 'Enter the inspector name.'));
        if (inspectorName === null) return;
        const body = { expectedVersion: value.version, inspectorName };
        if (byStandard) {
          const set = currentPlanSet();
          if (!set) { toast(t('Выберите набор планов.', 'Choose a plan set.'), 'error'); return; }
          const aqlMajor = Number(ui.aqlMajor); const aqlMinor = Number(ui.aqlMinor);
          if (!Number.isFinite(aqlMajor) || !Number.isFinite(aqlMinor)) { toast(t('Выберите пределы AQL.', 'Choose both AQL limits.'), 'error'); return; }
          if (aqlMajor > aqlMinor) { toast(t('Предел для значительных дефектов не может быть мягче, чем для незначительных.', 'The major limit cannot be looser than the minor one.'), 'error'); return; }
          Object.assign(body, { standardCode: set.standardCode, inspectionLevel: set.inspectionLevel, aqlMajor, aqlMinor });
        } else {
          const sampleSize = integer(ui.sampleSize, 1, t('Некорректный размер выборки.', 'Invalid sample size.'));
          const allowedMajorDefects = integer(ui.allowedMajor, 0, t('Некорректный major threshold.', 'Invalid major threshold.'));
          const allowedMinorDefects = integer(ui.allowedMinor, 0, t('Некорректный minor threshold.', 'Invalid minor threshold.'));
          if (sampleSize === null || allowedMajorDefects === null || allowedMinorDefects === null) return;
          Object.assign(body, { sampleSize, allowedMajorDefects, allowedMinorDefects });
          const samplingNote = String(ui.samplingNote || '').trim();
          if (samplingNote.length >= 2) body.samplingNote = samplingNote;
        }
        if (reinspection) { const reworkReference = requireText(ui.reworkReference, 2, t('Укажите ссылку на доработку.', 'Enter a rework reference.')); const resolutionNotes = requireText(ui.resolutionNotes, 5, t('Опишите выполненную доработку.', 'Describe the completed rework.')); if (!reworkReference || !resolutionNotes) return; Object.assign(body, { reworkReference, resolutionNotes }); }
        void command(value.inspectionCode, `/v2/final-quality-inspections/${encodeURIComponent(value.inspectionCode)}/${reinspection ? 'reinspect' : 'start'}`, body);
      } }),
    ]);
  }
  function checkpoints() {
    const selector = (label, key) => { const select = h('select', { onchange: (event) => { ui[key] = event.target.value; } }, [h('option', { value: 'pass', text: t('Соответствует', 'Pass') }), h('option', { value: 'fail', text: t('Не соответствует', 'Fail') }), h('option', { value: 'not-applicable', text: t('Не применимо', 'N/A') })]); select.value = ui[key]; return h('label', {}, [h('span', { text: label }), select]); };
    return h('div', { className: 'final-quality-grid' }, [selector(t('Качество пошива', 'Workmanship'), 'workmanshipResult'), selector(t('Измерения', 'Measurements'), 'measurementsResult'), selector(t('Упаковка', 'Packing'), 'packingResult')]);
  }
  function completePanel(value) {
    return h('section', { className: 'final-quality-card final-quality-command' }, [
      h('h3', { text: t('Результат выборки', 'Sampling result') }),
      h('div', { className: 'final-quality-grid' }, [numericInput('Critical', 'criticalCount'), numericInput('Major', 'majorCount'), numericInput('Minor', 'minorCount')]),
      h('input', { value: ui.defectDescription, placeholder: t('Описание дефектов', 'Defect description'), oninput: (event) => { ui.defectDescription = event.target.value; } }),
      checkpoints(),
      h('h4', { text: t('Отклонение измерения — необязательно', 'Measurement failure — optional') }),
      h('div', { className: 'final-quality-grid' }, [
        h('input', { value: ui.measurementPoint, placeholder: t('Точка', 'Point'), oninput: (event) => { ui.measurementPoint = event.target.value.toUpperCase(); } }),
        h('input', { value: ui.measurementSize, placeholder: t('Размер', 'Size'), oninput: (event) => { ui.measurementSize = event.target.value.toUpperCase(); } }),
        h('input', { type: 'number', step: 'any', value: ui.measuredValue, placeholder: t('Факт', 'Measured'), oninput: (event) => { ui.measuredValue = event.target.value; } }),
        h('input', { type: 'number', step: 'any', value: ui.lowerLimit, placeholder: t('Нижний допуск', 'Lower'), oninput: (event) => { ui.lowerLimit = event.target.value; } }),
        h('input', { type: 'number', step: 'any', value: ui.upperLimit, placeholder: t('Верхний допуск', 'Upper'), oninput: (event) => { ui.upperLimit = event.target.value; } }),
      ]),
      h('input', { value: ui.evidenceReferences, placeholder: t('Ссылки на фото через запятую', 'Photo references, comma-separated'), oninput: (event) => { ui.evidenceReferences = event.target.value; } }),
      h('textarea', { value: ui.completionNotes, placeholder: t('Комментарий инспектора', 'Inspector notes'), oninput: (event) => { ui.completionNotes = event.target.value; } }),
      h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Завершить прогон', 'Complete run'), onclick: () => {
        const run = core.currentRun(value); const inspectedQuantity = run?.samplingPlan?.sampleSize;
        const counts = [['critical', ui.criticalCount], ['major', ui.majorCount], ['minor', ui.minorCount]].map(([severity, raw]) => [severity, integer(raw, 0, t('Проверьте количество дефектов.', 'Check defect counts.'))]); if (counts.some(([, count]) => count === null)) return;
        const description = String(ui.defectDescription || '').trim() || t('Зафиксировано инспектором', 'Recorded by inspector');
        const defects = counts.filter(([, count]) => count > 0).map(([severity, count], index) => ({ defectCode: `${severity.toUpperCase()}-${index + 1}`, severity, category: 'Final inspection', description, quantity: count, evidenceReferences: [] }));
        const measurementFailures = [];
        if ([ui.measurementPoint, ui.measurementSize, ui.measuredValue, ui.lowerLimit, ui.upperLimit].some((item) => String(item || '').trim())) {
          const measuredValue = Number(ui.measuredValue); const lowerLimit = Number(ui.lowerLimit); const upperLimit = Number(ui.upperLimit);
          if (!ui.measurementPoint || !ui.measurementSize || !Number.isFinite(measuredValue) || !Number.isFinite(lowerLimit) || !Number.isFinite(upperLimit)) { toast(t('Заполните все поля отклонения измерения.', 'Complete all measurement-failure fields.'), 'error'); return; }
          measurementFailures.push({ pointCode: ui.measurementPoint, sizeCode: ui.measurementSize, measuredValue, lowerLimit, upperLimit });
        }
        const checkpointValues = [['WORKMANSHIP', t('Качество пошива', 'Workmanship'), ui.workmanshipResult], ['MEASUREMENTS', t('Измерения', 'Measurements'), ui.measurementsResult], ['PACKING', t('Упаковка', 'Packing'), ui.packingResult]];
        const checkpointsPayload = checkpointValues.map(([checkpointCode, name, result]) => ({ checkpointCode, name, result, severity: result === 'fail' ? ui.checkpointSeverity : null, notes: result === 'fail' ? description : t('Проверено', 'Checked') }));
        const evidenceReferences = String(ui.evidenceReferences || '').split(',').map((item) => item.trim()).filter(Boolean);
        void command(value.inspectionCode, `/v2/final-quality-inspections/${encodeURIComponent(value.inspectionCode)}/complete-run`, { expectedVersion: value.version, inspectedQuantity, defects, measurementFailures, checkpoints: checkpointsPayload, evidenceReferences, notes: String(ui.completionNotes || '').trim() || null }).then((result) => { if (result) clearRunInputs(); });
      } }),
    ]);
  }
  function reviewPanel(value) {
    const run = core.currentRun(value); const allowed = run?.recommendation === 'pass' ? ['release','rework','reject'] : run?.recommendation === 'rework' ? ['rework','reject'] : ['reject'];
    const review = (decision) => {
      const notes = requireText(ui.reviewNotes, 5, t('Добавьте комментарий к решению.', 'Add review notes.')); if (!notes) return;
      const body = { expectedVersion: value.version, decision, releaseCode: null, notes };
      if (decision === 'release') { const releaseCode = requireText(ui.releaseCode, 3, t('Укажите номер допуска.', 'Enter a release code.')); if (!releaseCode) return; body.releaseCode = releaseCode; }
      void command(value.inspectionCode, `/v2/final-quality-inspections/${encodeURIComponent(value.inspectionCode)}/review`, body);
    };
    return h('section', { className: 'final-quality-card final-quality-command' }, [
      h('h3', { text: t('Решение по партии', 'Lot disposition') }),
      h('p', { className: `final-quality-recommendation ${run?.recommendation || ''}`, text: `${t('Рекомендация', 'Recommendation')}: ${recommendationLabel(run?.recommendation)}` }),
      h('input', { value: ui.releaseCode, placeholder: t('Номер допуска к отгрузке', 'Shipment release code'), oninput: (event) => { ui.releaseCode = event.target.value.toUpperCase(); } }),
      h('textarea', { value: ui.reviewNotes, placeholder: t('Обоснование решения', 'Decision rationale'), oninput: (event) => { ui.reviewNotes = event.target.value; } }),
      h('div', { className: 'final-quality-actions' }, [
        allowed.includes('release') ? h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyCode), text: t('Разрешить отгрузку', 'Release shipment'), onclick: () => review('release') }) : null,
        allowed.includes('rework') ? h('button', { type: 'button', className: 'secondary', disabled: Boolean(ui.busyCode), text: t('Назначить доработку', 'Require rework'), onclick: () => review('rework') }) : null,
        allowed.includes('reject') ? h('button', { type: 'button', className: 'danger', disabled: Boolean(ui.busyCode), text: t('Отклонить партию', 'Reject lot'), onclick: () => review('reject') }) : null,
      ]),
    ]);
  }
  // Каким критерием судили партию. A run recorded before plans were resolvable carries the three
  // numbers and no provenance; it is shown as what it is rather than relabelled as something it did
  // not record.
  function samplingPlanLabel(plan) {
    if (!plan) return '—';
    const limits = t(`выборка ${plan.sampleSize}, приёмка ${plan.allowedMajorDefects}/${plan.allowedMinorDefects}`, `sample ${plan.sampleSize}, accept ${plan.allowedMajorDefects}/${plan.allowedMinorDefects}`);
    if (plan.source === 'standard') return `${plan.standardCode} · ${t('уровень', 'level')} ${plan.inspectionLevel} · AQL ${plan.aqlMajor}/${plan.aqlMinor} · ${limits}`;
    if (plan.source === 'agreed') return `${t('Согласованный план', 'Agreed plan')} · ${limits}${plan.note ? ` · ${plan.note}` : ''}`;
    return `${t('Пороги заданы вручную', 'Thresholds entered by hand')} · ${limits}`;
  }
  function runHistory(value) {
    if (!value.runs.length) return h('p', { className: 'muted', text: t('Инспекция ещё не запускалась.', 'Inspection has not started.') });
    // Каждая строка прогона — блок, а не <small>.
    //
    // A run's class carries its status, and one of those statuses is `in-progress`. The role system
    // matches component heuristics on class-name tokens, so the token `progress` gave the active run
    // a block layout that completed runs never got: the same list rendered its items two different
    // ways depending on which word happened to be in the status. The lines are blocks here, so the
    // geometry no longer depends on which heuristic fired.
    return h('ol', { className: 'final-quality-runs' }, value.runs.map((run) => h('li', { className: `final-quality-run ${run.status}` }, [
      h('strong', { text: `${t('Прогон', 'Run')} ${run.runNumber}` }),
      h('p', { className: 'muted', text: `${run.inspectorName} · ${date(run.startedAt)}` }),
      h('p', { className: 'muted', text: samplingPlanLabel(run.samplingPlan) }),
      run.defectCounts ? h('p', { className: 'muted', text: `${t('Крит./знач./незнач.', 'Critical/major/minor')} ${run.defectCounts.critical}/${run.defectCounts.major}/${run.defectCounts.minor}` }) : null,
      run.recommendation ? h('p', { className: 'muted', text: `${t('Рекомендация', 'Recommendation')}: ${recommendationLabel(run.recommendation)}` }) : null,
      run.disposition ? h('p', { className: 'muted', text: `${t('Решение', 'Disposition')}: ${dispositionLabel(run.disposition)}` }) : null,
      run.reworkReference ? h('p', { className: 'muted', text: `${t('Доработка', 'Rework')}: ${run.reworkReference}` }) : null,
    ])));
  }
  const INLINE_MILESTONE_LABELS = {
    'materials-ready': ['Материалы готовы', 'Materials ready'],
    'cutting-complete': ['Раскрой завершён', 'Cutting complete'],
    'assembly-complete': ['Пошив завершён', 'Assembly complete'],
    'finishing-complete': ['Отделка завершена', 'Finishing complete'],
    'packing-complete': ['Упаковка завершена', 'Packing complete'],
    'ready-for-qc': ['Готово к QC', 'Ready for QC'],
  };
  function inlineMilestoneLabel(code) { const pair = INLINE_MILESTONE_LABELS[code]; return pair ? t(pair[0], pair[1]) : code; }
  // Брак, накопленный инлайн-контролем по этому же исполнению, — только для чтения рядом с решением
  // AQL. Приёмочное число выборки его не учитывает и не должно: оно решение плана выборки, а не
  // истории производства, снятой другой методикой; это число инспектор читает сам, а не система за
  // него.
  function inlineDefectHistoryPanel(value) {
    const rows = value.inlineDefectHistory || [];
    if (!rows.length) return null;
    return h('section', { className: 'final-quality-card' }, [
      h('h3', { text: t('Брак по вехам инлайн-контроля', 'Inline control defect history') }),
      h('p', { className: 'muted', text: t(
        'Справочно: накоплено на том же исполнении, не входит в приёмочное число выборки.',
        'For reference: accumulated on the same execution, not part of the sampling acceptance number.') }),
      h('ul', { className: 'final-quality-inline-history' }, rows.map((row) => h('li', {}, [
        h('strong', { text: inlineMilestoneLabel(row.milestoneCode) }),
        h('span', { className: 'muted', text: `${t('Проверено', 'Checked')} ${row.checkedQuantity} · ${t('Брак', 'Defective')} ${row.defectiveQuantity}${row.openDispositions ? ` · ${t('без решения', 'undispositioned')}: ${row.openDispositions}` : ''}` }),
      ]))),
    ]);
  }
  function cancelPanel(value) { return h('section', { className: 'final-quality-card' }, [h('h3', { text: t('Отмена инспекции', 'Cancel inspection') }), h('input', { value: ui.cancelReason, placeholder: t('Причина отмены', 'Cancellation reason'), oninput: (event) => { ui.cancelReason = event.target.value; } }), h('button', { type: 'button', className: 'danger', disabled: Boolean(ui.busyCode), text: t('Отменить', 'Cancel'), onclick: () => { const reason = requireText(ui.cancelReason, 5, t('Укажите причину отмены.', 'Enter a cancellation reason.')); if (reason) void command(value.inspectionCode, `/v2/final-quality-inspections/${encodeURIComponent(value.inspectionCode)}/cancel`, { expectedVersion: value.version, reason }); } })]); }
  function inspector(value) {
    if (!value) return h('aside', { className: 'final-quality-inspector' }, [h('p', { className: 'muted', text: t('Выберите инспекцию.', 'Select an inspection.') })]);
    const manage = can(value.brandId, caps.CAPABILITIES.QUALITY_MANAGE); const approve = can(value.brandId, caps.CAPABILITIES.QUALITY_APPROVE); const actions = core.allowedActions(value, { canManage: manage, canApprove: approve });
    const children = [h('div', { className: 'final-quality-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: value.inspectionCode }), h('h2', { text: statusLabel(value.status) })]), value.shipmentRelease ? h('span', { className: 'final-quality-release', text: value.shipmentRelease.releaseCode }) : null]),
      h('dl', { className: 'final-quality-facts' }, [pair(t('Исполнение', 'Execution'), value.executionCode), pair('PO', value.productionOrderNumber), pair('SKU', value.sku), pair(t('Фабрика', 'Supplier'), value.supplierCode), pair(t('Партия', 'Lot quantity'), value.quantity), pair(t('Техпак', 'Tech Pack'), `${value.sourceSnapshot.techPackCode} · v${value.sourceSnapshot.techPackVersion}`), pair(t('Готово к QC', 'Ready for QC'), date(value.sourceSnapshot.readyForQcAt)), pair(t('Версия исполнения', 'Execution version'), value.sourceSnapshot.executionVersion)]),
      h('section', { className: 'final-quality-card' }, [h('h3', { text: t('История инспекций', 'Inspection history') }), runHistory(value)]),
      inlineDefectHistoryPanel(value),
    ];
    if (actions.includes('start')) children.push(startPanel(value, false));
    if (actions.includes('complete')) children.push(completePanel(value));
    if (actions.includes('review')) children.push(reviewPanel(value));
    if (actions.includes('reinspect')) children.push(startPanel(value, true));
    if (actions.includes('cancel')) children.push(cancelPanel(value));
    return h('aside', { className: 'final-quality-inspector' }, children);
  }
  function renderFinalQuality() {
    ensureLoaded(); const summary = core.summarize(ui.items); const items = core.filter(ui.items, { status: ui.status, risk: ui.risk, search: ui.search });
    return h('section', { className: 'final-quality-page' }, [header(summary), filters(), ui.error ? h('div', { className: 'final-quality-error' }, [h('strong', { text: t('Не удалось загрузить Final Quality', 'Could not load Final Quality') }), h('span', { text: ui.error }), h('button', { type: 'button', className: 'secondary', text: t('Повторить', 'Retry'), onclick: () => { void load({ reset: true }); } })]) : null, h('div', { className: 'final-quality-layout' }, [registry(items), inspector(selected())])]);
  }

  const previousRenderView = renderView;
  renderView = (...args) => state.view === 'final-quality' ? renderFinalQuality() : previousRenderView(...args);
  const previousRenderNavigation = renderNavigation;
  renderNavigation = (...args) => {
    const navigation = previousRenderNavigation(...args);
    if (!navigation.querySelector('[data-final-quality-nav]')) navigation.append(h('button', { type: 'button', 'data-final-quality-nav': 'true', text: t('Контроль качества', 'Final Quality'), onclick: () => { state.view = 'final-quality'; renderApp(); } }));
    return navigation;
  };
  // Production Execution hands a ready-for-QC batch over by execution code. If an inspection for
  // that execution already exists, open it; otherwise prefill the create panel with the code so the
  // user does not have to retype it from the other screen.
  function openForExecution(executionCode) {
    const code = String(executionCode || '').trim().toUpperCase();
    if (code) {
      ui.executionCode = code;
      const existing = ui.items.find((item) => item?.executionCode === code);
      if (existing) ui.selectedCode = existing.inspectionCode;
    }
    state.view = 'final-quality';
    renderApp();
  }

  global.SynthaFinalQualityWorkspace = Object.freeze({ fetchAll, load, render: renderFinalQuality, openForExecution });
// The V7 nav shim runs before this file, so it could not see the global above; the section
// stayed marked as planned and could not be opened. Claim the entry now that it exists.
global.SynthaOmnidataV7Nav?.activate('Quality', 'final-quality', '\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e', 'Quality');
})(window);
