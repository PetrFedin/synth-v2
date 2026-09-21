(function installSourcingWorkspace(global) {
  'use strict';

  const core = global.SynthaSourcingCore;
  const caps = global.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaSourcingCore must load before sourcing.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before sourcing.js');

  const ui = global.SynthaSourcingWorkspace || (global.SynthaSourcingWorkspace = {
    suppliers: [], rfqs: [], boms: [], loaded: false, loading: false, error: '', selectedSupplierCode: null,
    selectedRfqCode: null, busyKey: null, generation: 0, referenceTime: null, supplierStatus: 'all', rfqStatus: 'all',
    portalAccess: [], portalAccessFor: null, portalAccessLoading: false,
    // Карточка поставщика считалась целиком и не была видна нигде. Она живёт рядом с поставщиком по
    // той же причине, что и доступ к порталу: это факт об этом контрагенте.
    performance: null, performanceFor: null, performanceLoading: false,
  });
  const SUPPLIER_STATUSES = ['draft', 'qualified', 'suspended', 'archived'];
  const RFQ_STATUSES = ['draft', 'issued', 'quoted', 'awarded', 'allocated', 'cancelled'];
  const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'];
  const SOURCING_VIEWS = new Set(['suppliers', 'rfqs', 'quotations', 'production']);

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
  function can(brandId, capability) { return caps.hasForOrganisation(state.workspace, brandId, capability); }
  function canAny(capability) { return caps.hasAny(state.workspace, capability, 'brand'); }
  function manageableBrands(capability) { return caps.organisationIds(state.workspace, capability, 'brand'); }
  function catalog() { return Array.isArray(state.workspace?.catalogSkus) ? state.workspace.catalogSkus : []; }
  function brandName(brandId) { return state.workspace.organisations?.find((item) => item.id === brandId)?.name || brandId; }
  function supplierByCode(code) { return ui.suppliers.find((item) => item.supplierCode === code); }
  function selectedSupplier() { return supplierByCode(ui.selectedSupplierCode) || ui.suppliers[0] || null; }
  function selectedRfq() { return ui.rfqs.find((item) => item.rfqCode === ui.selectedRfqCode) || ui.rfqs[0] || null; }
  function publishedBoms() { return ui.boms.filter((bom) => bom.status === 'published'); }
  function publishedSkuOptions() {
    const bomSkus = new Set(publishedBoms().map((bom) => bom.sku));
    return catalog().filter((sku) => sku.status === 'published' && bomSkus.has(sku.sku) && can(sku.brandId, caps.CAPABILITIES.SOURCING_MANAGE));
  }
  function qualifiedSuppliers(brandId) { return ui.suppliers.filter((supplier) => supplier.brandId === brandId && supplier.status === 'qualified'); }
  function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—'; }
  function formatMoneyMinor(value, currency) { const amount = Number(value) / 100; return Number.isFinite(amount) ? new Intl.NumberFormat(I18N.localeTag(), { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 2 }).format(amount) : '—'; }
  function badge(label, tone = 'neutral') { return h('span', { className: `sourcing-badge sourcing-${tone}`, text: label }); }
  function statusLabel(status) {
    const labels = {
      draft: ['Черновик', 'Draft'], qualified: ['Квалифицирован', 'Qualified'], suspended: ['Приостановлен', 'Suspended'], archived: ['Архив', 'Archived'],
      issued: ['Отправлен', 'Issued'], quoted: ['Есть котировки', 'Quoted'], awarded: ['Победитель выбран', 'Awarded'], allocated: ['В производстве', 'Allocated'], cancelled: ['Отменён', 'Cancelled'],
    };
    const pair = labels[status] || [status, status]; return text(pair[0], pair[1]);
  }
  function statusTone(status) { if (['qualified', 'allocated'].includes(status)) return 'ok'; if (['suspended', 'cancelled'].includes(status)) return 'danger'; if (['issued', 'quoted', 'awarded'].includes(status)) return 'warning'; return 'neutral'; }

  function reset() {
    ui.suppliers = []; ui.rfqs = []; ui.boms = []; ui.loaded = false; ui.error = ''; ui.selectedSupplierCode = null;
    ui.selectedRfqCode = null; ui.referenceTime = null; ui.generation += 1;
  }
  async function fetchAllPages(path, request = api) {
    const items = [];
    const seen = new Set();
    let cursor = null;
    let referenceTime = null;
    for (let pageCount = 1; pageCount <= 500; pageCount += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const page = await request(`${path}?${query.toString()}`);
      if (!page || !Array.isArray(page.items)) throw new Error('SOURCING_PAGE_INVALID');
      if (referenceTime && page.referenceTime && page.referenceTime !== referenceTime) throw new Error('SOURCING_REFERENCE_TIME_DRIFT');
      referenceTime ||= page.referenceTime || null;
      items.push(...page.items);
      const next = page.nextCursor || null;
      if (!next) return Object.freeze({ items: Object.freeze(items), referenceTime });
      if (seen.has(next)) throw new Error('SOURCING_CURSOR_CYCLE');
      seen.add(next); cursor = next;
    }
    throw new Error('SOURCING_PAGE_LIMIT_EXCEEDED');
  }
  async function loadSourcing({ reset: shouldReset = false } = {}) {
    if (ui.loading) return;
    if (shouldReset) reset();
    ui.loading = true; ui.error = '';
    const generation = ui.generation;
    try {
      const [suppliers, rfqs, boms] = await Promise.all([fetchAllPages('/v2/suppliers'), fetchAllPages('/v2/rfqs'), fetchAllPages('/v2/boms')]);
      if (generation !== ui.generation) return;
      ui.suppliers = [...suppliers.items].sort((a, b) => String(a.supplierCode).localeCompare(String(b.supplierCode)));
      ui.rfqs = [...rfqs.items].sort((a, b) => String(a.rfqCode).localeCompare(String(b.rfqCode)));
      ui.boms = [...boms.items];
      ui.referenceTime = rfqs.referenceTime || suppliers.referenceTime || new Date().toISOString();
      ui.loaded = true;
      ui.selectedSupplierCode ||= ui.suppliers[0]?.supplierCode || null;
      ui.selectedRfqCode ||= ui.rfqs[0]?.rfqCode || null;
    } catch (error) {
      if (generation === ui.generation) ui.error = error?.message || I18N.t('common.requestError');
    } finally {
      if (generation === ui.generation) ui.loading = false;
      if (SOURCING_VIEWS.has(state.view)) renderApp();
    }
  }
  // See materials.js: retrying a failed load from render starves the event loop.
  function ensureLoaded() { if (!ui.loaded && !ui.loading && !ui.error) queueMicrotask(() => { void loadSourcing({ reset: true }); }); }
  function upsertSupplier(supplier) { const map = new Map(ui.suppliers.map((item) => [item.supplierCode, item])); map.set(supplier.supplierCode, supplier); ui.suppliers = [...map.values()].sort((a, b) => a.supplierCode.localeCompare(b.supplierCode)); ui.selectedSupplierCode = supplier.supplierCode; }
  function upsertRfq(rfq) { const map = new Map(ui.rfqs.map((item) => [item.rfqCode, item])); map.set(rfq.rfqCode, rfq); ui.rfqs = [...map.values()].sort((a, b) => a.rfqCode.localeCompare(b.rfqCode)); ui.selectedRfqCode = rfq.rfqCode; }
  async function runMutation(key, path, body, method = 'POST', kind = 'rfq') {
    if (ui.busyKey) return null;
    ui.busyKey = key; renderApp();
    try {
      const result = await mutate(path, body, method);
      // A command's response is the aggregate it changed. Portal access changes a grant, not the
      // supplier: folding it into the supplier register replaced the supplier with the grant, and the
      // next render threw on a field a grant does not have.
      if (kind === 'supplier') upsertSupplier(result);
      else if (kind === 'grant') { /* the access panel reloads itself */ }
      else upsertRfq(result);
      toast(text('Изменения сохранены.', 'Changes saved.'));
      return result;
    } catch (error) {
      if (String(error?.code || '').includes('CONCURRENCY_CONFLICT')) { reset(); queueMicrotask(() => { void loadSourcing({ reset: true }); }); }
      toast(errorMessage(error), 'error');
      return null;
    } finally { ui.busyKey = null; renderApp(); }
  }

  // A rule the server enforces has to be readable in the language the screen is in. Anything not
  // listed here still falls back to the server's own sentence rather than to a generic apology.
  const ERROR_TEXT = {
    SUPPLIER_PORTAL_ACCOUNT_NOT_FOUND: ['У этого человека ещё нет учётной записи Syntha. Сначала он должен получить доступ к платформе.', 'That person has no Syntha account yet.'],
    SUPPLIER_PORTAL_HOLDER_IS_GRANTER: ['Нельзя открыть доступ самому себе.', 'You cannot grant portal access to yourself.'],
    SUPPLIER_PORTAL_HOLDER_IS_BRAND_MEMBER: ['Сотрудник бренда не может получить доступ к порталу его же поставщика.', 'A member of the brand cannot hold portal access to that brand\u2019s supplier.'],
    SUPPLIER_PORTAL_GRANT_EXISTS: ['У этого человека уже есть доступ к порталу этого поставщика.', 'This person already has portal access to that supplier.'],
    SUPPLIER_PORTAL_GRANT_NOT_FOUND: ['Такого доступа нет.', 'There is no such access.'],
    SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED: ['Доступ к порталу открывают квалифицированному поставщику.', 'Portal access belongs to a qualified supplier.'],
  };
  function errorMessage(error) {
    const pair = ERROR_TEXT[String(error?.code || '')];
    return pair ? text(pair[0], pair[1]) : (error?.message || I18N.t('common.requestError'));
  }

  function metric(label, value, detail) { return h('article', { className: 'sourcing-kpi' }, [h('span', { text: label }), h('strong', { text: String(value) }), detail ? h('small', { text: detail }) : null]); }
  function workspaceHeader(summary) {
    return h('header', { className: 'sourcing-header' }, [
      h('div', {}, [h('p', { className: 'eyebrow', text: 'PLM / SOURCING / PRODUCTION ALLOCATION' }), h('h1', { text: text('Поставщики, RFQ и размещение производства', 'Suppliers, RFQs and production allocation') }), h('p', { className: 'muted', text: text('Сквозной процесс: квалификация фабрики → запрос цены → сравнение котировок → выбор → PO и производственная аллокация.', 'End-to-end flow: supplier qualification → RFQ → quotation comparison → award → PO and production allocation.') })]),
      h('div', { className: 'sourcing-header-actions' }, [
        canAny(caps.CAPABILITIES.SUPPLIER_MANAGE) ? h('button', { type: 'button', className: 'secondary', text: text('Новый поставщик', 'New supplier'), onclick: () => openSupplierDialog(null) }) : null,
        canAny(caps.CAPABILITIES.SOURCING_MANAGE) ? h('button', { type: 'button', className: 'primary', text: text('Новый RFQ', 'New RFQ'), onclick: () => openRfqDialog(null) }) : null,
        h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: text('Обновить', 'Refresh'), onclick: () => { loadSourcing({ reset: true }).then(() => toast(text('\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b.', 'Data refreshed.'))).catch((error) => toast(error?.message || text('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435.', 'The data could not be refreshed.'), 'error')); } }),
      ]),
      h('section', { className: 'sourcing-kpis' }, [
        metric(text('Поставщики', 'Suppliers'), summary.suppliers), metric(text('Квалифицировано', 'Qualified'), summary.qualified),
        metric(text('Открытые RFQ', 'Open RFQs'), summary.openRfqs), metric(text('Просрочено', 'Overdue'), summary.overdue),
        metric(text('Победитель выбран', 'Awarded'), summary.awarded), metric(text('Размещено', 'Allocated'), summary.allocated),
      ]),
    ]);
  }
  function viewTabs() {
    const items = [
      ['suppliers', text('Поставщики', 'Suppliers')], ['rfqs', 'RFQ'], ['quotations', text('Котировки', 'Quotations')], ['production', text('Производство', 'Production')],
    ];
    return h('nav', { className: 'sourcing-tabs', 'aria-label': text('Разделы закупки', 'Sourcing sections') }, items.map(([view, label]) => h('button', { type: 'button', className: state.view === view ? 'active' : '', text: label, onclick: () => { state.view = view; renderApp(); } })));
  }
  function renderSourcing() {
    ensureLoaded();
    const summary = core.summarize(ui.suppliers, ui.rfqs, ui.referenceTime || new Date().toISOString());
    const body = h('section', { className: 'sourcing-workspace' }, [workspaceHeader(summary), viewTabs()]);
    if (ui.error) body.append(h('div', { className: 'sourcing-error', text: ui.error }));
    if (state.view === 'suppliers') body.append(renderSuppliers());
    else if (state.view === 'quotations') body.append(renderQuotations());
    else if (state.view === 'production') body.append(renderProduction());
    else body.append(renderRfqs());
    return body;
  }

  function renderSuppliers() {
    const values = ui.suppliers.filter((supplier) => ui.supplierStatus === 'all' || supplier.status === ui.supplierStatus);
    const filter = h('select', { onchange: (event) => { ui.supplierStatus = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('Все статусы', 'All statuses') }), ...SUPPLIER_STATUSES.map((status) => h('option', { value: status, text: statusLabel(status) }))]); filter.value = ui.supplierStatus;
    const rows = values.map((supplier) => {
      const row = h('tr', { className: ui.selectedSupplierCode === supplier.supplierCode ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: supplier.supplierCode }), h('small', { text: supplier.legalName })]), h('td', { text: supplier.countryCode }),
        h('td', { text: supplier.categories.join(', ') }), h('td', { text: `${supplier.leadTimeDays} ${text('дн.', 'days')}` }), h('td', { text: String(supplier.minimumOrderQuantity) }),
        h('td', {}, [badge(statusLabel(supplier.status), statusTone(supplier.status))]), h('td', { text: formatDate(supplier.auditExpiresAt) }),
      ]);
      const select = () => { ui.selectedSupplierCode = supplier.supplierCode; renderApp(); };
      row.addEventListener('click', select); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }); return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '7', className: 'sourcing-empty', text: ui.loading ? text('Загрузка…', 'Loading…') : text('Поставщики не найдены.', 'No suppliers found.') })]));
    return h('div', { className: 'sourcing-grid' }, [h('section', { className: 'sourcing-panel' }, [h('div', { className: 'sourcing-toolbar' }, [h('h2', { text: text('Реестр поставщиков', 'Supplier register') }), filter]), h('div', { className: 'sourcing-table-wrap' }, [h('table', { className: 'sourcing-table' }, [h('thead', {}, [h('tr', {}, [text('Код / название', 'Code / name'), text('Страна', 'Country'), text('Категории', 'Categories'), text('Lead time', 'Lead time'), 'MOQ', text('Статус', 'Status'), text('Аудит до', 'Audit valid until')].map((value) => h('th', { text: value })))]), h('tbody', {}, rows)])])]), supplierInspector(selectedSupplier())]);
  }
  function supplierInspector(supplier) {
    if (!supplier) return h('aside', { className: 'sourcing-inspector' }, [h('p', { className: 'muted', text: text('Выберите поставщика.', 'Select a supplier.') })]);
    const actions = core.allowedSupplierActions(supplier, { canManage: can(supplier.brandId, caps.CAPABILITIES.SUPPLIER_MANAGE) });
    return h('aside', { className: 'sourcing-inspector' }, [
      h('div', { className: 'sourcing-inspector-title' }, [h('div', {}, [h('p', { className: 'eyebrow', text: supplier.supplierCode }), h('h2', { text: supplier.legalName })]), badge(statusLabel(supplier.status), statusTone(supplier.status))]),
      h('dl', { className: 'sourcing-details' }, [detail(text('Бренд', 'Brand'), brandName(supplier.brandId)), detail('Email', supplier.email), detail(text('Валюта', 'Currency'), supplier.currency), detail('Incoterms', supplier.incoterms.join(', ')), detail(text('Условия оплаты', 'Payment terms'), `${supplier.paymentTermsDays} ${text('дн.', 'days')}`), detail(text('Аудит до', 'Audit valid until'), formatDate(supplier.auditExpiresAt))]),
      supplier.suspensionReason ? h('div', { className: 'sourcing-warning', text: supplier.suspensionReason }) : null,
      h('div', { className: 'sourcing-actions' }, actions.map((action) => supplierActionButton(action, supplier))),
      performancePanel(supplier),
      portalAccessPanel(supplier),
    ]);
  }

  // Как эта фабрика работает — по нашим собственным данным, а не по нашему впечатлению.
  //
  // Every figure here is measured from what the platform already recorded: orders, delivery dates,
  // final inspections and, since inline control exists, what was found during production. Each share
  // states its own denominator and there is no overall score, because a single number over
  // measurements this different would hide the thing worth looking at.
  function performancePanel(supplier) {
    if (!can(supplier.brandId, caps.CAPABILITIES.MARGIN_READ)) return null;
    if (ui.performanceFor !== supplier.supplierCode && !ui.performanceLoading) {
      queueMicrotask(() => { void loadPerformance(supplier.supplierCode); });
    }
    const body = [];
    const value = ui.performanceFor === supplier.supplierCode ? ui.performance : null;
    if (!value) {
      body.push(h('p', { className: 'muted', text: ui.performanceLoading ? text('Загрузка…', 'Loading…') : text('Показатели пока недоступны.', 'Performance figures are not available yet.') }));
    } else {
      const operations = value.operations;
      const quality = value.quality;
      const inline = quality.inline;
      body.push(h('dl', { className: 'sourcing-details' }, [
        detail(text('Заказов размещено', 'Orders placed'), `${operations.productionOrderCount} · ${operations.orderedUnits} ${text('ед.', 'units')}`),
        detail(text('В срок к контролю', 'On time to QC'), share(operations.onTimeQcPercent, `${operations.onTimeReadyForQcCount}/${operations.readyForQcCount}`)),
        detail(text('Принято с первого раза', 'First-pass yield'), share(quality.firstPassYieldPercent, `${quality.firstPassReleaseCount}/${quality.reviewedFirstRunCount}`)),
        detail(text('Ушло на доработку', 'Rework incidence'), share(quality.reworkIncidencePercent, `${quality.reworkInspectionCount}/${quality.inspectionCount}`)),
        detail(text('Отклонено', 'Rejected'), share(quality.rejectionRatePercent, `${quality.rejectedInspectionCount}/${quality.inspectionCount}`)),
        detail(text('Дефекты на приёмке', 'Defects at the gate'), `${quality.defectCounts.critical} / ${quality.defectCounts.major} / ${quality.defectCounts.minor}`),
      ]));
      body.push(h('h4', { text: text('Пооперационный контроль', 'Inline quality control') }));
      body.push(h('dl', { className: 'sourcing-details' }, [
        // Охват — это про то, смотрели ли в партию вообще: фабрика без проверок не фабрика без
        // дефектов, а фабрика, в которую не смотрели.
        detail(text('Партий под контролем', 'Lots under inline control'), share(inline.coveragePercent, `${inline.executionsWithChecks}/${operations.executionCount}`)),
        detail(text('Доля дефектных в производстве', 'Defect rate in production'), share(inline.defectRatePercent, `${inline.defectiveUnits}/${inline.checkedUnits}`)),
        detail(text('Дефекты в производстве', 'Defects in production'), `${inline.defectCounts.critical} / ${inline.defectCounts.major} / ${inline.defectCounts.minor}`),
        detail(text('Доработка / брак / принято', 'Rework / scrap / accepted'), `${inline.dispositions.rework} / ${inline.dispositions.scrap} / ${inline.dispositions.accepted}`),
        // Если мы соглашаемся с тем, что находим, находки ничего не меняют.
        detail(text('Принято с известным браком', 'Accepted with known defects'), share(inline.dispositions.acceptedSharePercent, String(inline.dispositions.accepted))),
      ]));
      if (inline.openCheckCount > 0) {
        body.push(h('div', { className: 'sourcing-warning', text: text(
          `Не разобрано проверок: ${inline.openCheckCount}. Пока по ним нет решения, соответствующие этапы не закроются.`,
          `${inline.openCheckCount} inline check(s) undecided. The matching stages cannot close until they are.`) }));
      }
      for (const row of value.economicsByCurrency || []) {
        body.push(h('p', { className: 'muted', text: text(
          `Подтверждённые потери ${row.confirmedFailureCost} ${row.currency}, возмещено ${row.recoveryCreditAmount} ${row.currency}, итого ${row.netConfirmedFailureCost} ${row.currency}.`,
          `Confirmed failure cost ${row.confirmedFailureCost} ${row.currency}, recovered ${row.recoveryCreditAmount} ${row.currency}, net ${row.netConfirmedFailureCost} ${row.currency}.`) }));
      }
    }
    return h('section', { className: 'sourcing-subpanel' }, [
      h('div', { className: 'sourcing-toolbar' }, [h('h3', { text: text('Как работает эта фабрика', 'How this factory performs') })]),
      ...body,
    ]);
  }
  // Доля, которую не на чем считать, — это «—», а не ноль: нулевой процент утверждает, что мы
  // смотрели и не нашли, а мы не смотрели.
  function share(percentValue, detailText) {
    if (percentValue === null || percentValue === undefined) return text(`— (${detailText})`, `— (${detailText})`);
    // Доля показывается с одним знаком: контракт отдаёт четыре, потому что там это точность
    // вычисления, а на экране это шум — «5,5556 %» не значит ничего сверх «5,6 %».
    return `${percentValue.toFixed(1).replace('.', ',')} % (${detailText})`;
  }
  async function loadPerformance(supplierCode) {
    if (ui.performanceLoading) return;
    ui.performanceLoading = true;
    try {
      ui.performance = await api(`/v2/suppliers/${encodeURIComponent(supplierCode)}/economic-performance`);
    } catch (error) {
      ui.performance = null;
    } finally {
      ui.performanceFor = supplierCode;
      ui.performanceLoading = false;
      renderApp();
    }
  }

  // Who at this supplier can sign in. Access is listed beside the supplier rather than in a settings
  // screen of its own, because it is a fact about this counterparty: revoking it is the same decision
  // as suspending them, taken one person at a time.
  function portalAccessPanel(supplier) {
    const manage = can(supplier.brandId, caps.CAPABILITIES.SUPPLIER_MANAGE);
    if (ui.portalAccessFor !== supplier.supplierCode && !ui.portalAccessLoading) {
      queueMicrotask(() => { void loadPortalAccess(supplier.supplierCode); });
    }
    const grants = ui.portalAccessFor === supplier.supplierCode ? ui.portalAccess : [];
    const active = grants.filter((grant) => grant.status === 'active');
    const rows = grants.map((grant) => h('tr', { className: grant.status === 'revoked' ? 'sourcing-row-muted' : '' }, [
      h('td', { text: grant.contactName || grant.invitedEmail }),
      h('td', { text: grant.invitedEmail || grant.userId }),
      h('td', {}, [badge(grant.status === 'active' ? text('Доступ открыт', 'Active') : text('Отозван', 'Revoked'), grant.status === 'active' ? 'positive' : 'muted')]),
      h('td', {}, grant.status === 'active' && manage
        ? [h('button', { type: 'button', className: 'danger', disabled: ui.busyKey === supplier.supplierCode, text: text('Отозвать', 'Revoke'), onclick: () => openPortalRevokeDialog(supplier, grant) })]
        : [h('span', { className: 'muted', text: grant.revokedAt ? formatDate(grant.revokedAt) : '—' })]),
    ]));
    if (!rows.length) {
      rows.push(h('tr', {}, [h('td', {
        colspan: '4', className: 'sourcing-empty',
        text: ui.portalAccessLoading
          ? text('Загрузка…', 'Loading…')
          : text('Никто из этого поставщика пока не может войти в портал.', 'Nobody at this supplier can sign in to the portal yet.'),
      })]));
    }
    return h('section', { className: 'sourcing-subpanel' }, [
      h('div', { className: 'sourcing-toolbar' }, [
        h('h3', { text: text('Доступ к порталу поставщика', 'Supplier portal access') }),
        manage && supplier.status === 'qualified'
          ? h('button', { type: 'button', className: 'secondary', text: text('Пригласить', 'Invite'), onclick: () => openPortalGrantDialog(supplier) })
          : null,
      ]),
      h('p', { className: 'muted', text: active.length
        ? text(
          `${active.length} ${active.length === 1 ? 'человек видит' : 'чел. видят'} запросы и заказы, адресованные этому поставщику.`,
          `${active.length} ${active.length === 1 ? 'person can' : 'people can'} see the requests and orders addressed to this supplier.`,
        )
        : text('Приглашённый видит только запросы и заказы этого поставщика — ни других поставщиков, ни их котировок.', 'An invited person sees only this supplier\u2019s requests and orders \u2014 no other supplier and no other quotation.') }),
      h('div', { className: 'sourcing-table-wrap' }, [h('table', { className: 'sourcing-table' }, [
        h('thead', {}, [h('tr', {}, [text('Контакт', 'Contact'), text('Учётная запись', 'Account'), text('Статус', 'Status'), ''].map((value) => h('th', { text: value })))]),
        h('tbody', {}, rows),
      ])]),
    ]);
  }

  async function loadPortalAccess(supplierCode) {
    if (ui.portalAccessLoading) return;
    ui.portalAccessLoading = true;
    try {
      const result = await api(`/v2/suppliers/${encodeURIComponent(supplierCode)}/portal-access`);
      ui.portalAccess = result.items || [];
      ui.portalAccessFor = supplierCode;
    } catch (error) {
      ui.portalAccess = [];
      ui.portalAccessFor = supplierCode;
    } finally {
      ui.portalAccessLoading = false;
      renderApp();
    }
  }

  function openPortalGrantDialog(supplier) {
    dialog(text('Пригласить в портал поставщика', 'Invite to the supplier portal'), [
      field(text('Учётная запись (email)', 'Account (email)'), control('email', 'email', '', { required: true, maxlength: '160' })),
      field(text('Имя контакта', 'Contact name'), control('contactName', 'text', '', { maxlength: '160' })),
    ], text('Открыть доступ', 'Grant access'), async (values) => {
      const done = await runMutation(supplier.supplierCode, `/v2/suppliers/${encodeURIComponent(supplier.supplierCode)}/portal-access`, { email: values.email.trim(), contactName: values.contactName.trim() }, 'POST', 'grant');
      if (done) { ui.portalAccessFor = null; void loadPortalAccess(supplier.supplierCode); }
      return Boolean(done);
    });
  }

  function openPortalRevokeDialog(supplier, grant) {
    dialog(text('Отозвать доступ', 'Revoke access'), [
      h('p', { className: 'sourcing-confirm', text: text(`${grant.contactName || grant.invitedEmail} перестанет видеть запросы и заказы этого поставщика.`, `${grant.contactName || grant.invitedEmail} will stop seeing this supplier\u2019s requests and orders.`) }),
    ], text('Отозвать', 'Revoke'), async () => {
      const done = await runMutation(supplier.supplierCode, `/v2/suppliers/${encodeURIComponent(supplier.supplierCode)}/portal-access/revoke`, { expectedVersion: grant.version, userId: grant.userId }, 'POST', 'grant');
      if (done) { ui.portalAccessFor = null; void loadPortalAccess(supplier.supplierCode); }
      return Boolean(done);
    }, true);
  }
  function supplierActionButton(action, supplier) {
    const labels = { edit: [text('Редактировать', 'Edit'), 'secondary'], qualify: [text('Квалифицировать', 'Qualify'), 'primary'], suspend: [text('Приостановить', 'Suspend'), 'danger'], archive: [text('В архив', 'Archive'), 'danger'] };
    const handlers = { edit: () => openSupplierDialog(supplier), qualify: () => qualifySupplier(supplier), suspend: () => openSupplierSuspendDialog(supplier), archive: () => archiveSupplier(supplier) };
    return h('button', { type: 'button', className: labels[action][1], disabled: ui.busyKey === supplier.supplierCode, text: labels[action][0], onclick: handlers[action] });
  }

  function rfqFilterValues(view) {
    // The status filter is shown on every tab now, so it has to apply on every tab.
    const byStatus = (list) => list.filter((rfq) => ui.rfqStatus === 'all' || rfq.status === ui.rfqStatus);
    if (view === 'quotations') return byStatus(ui.rfqs.filter((rfq) => rfq.quotes.length > 0 && ['quoted', 'awarded', 'allocated'].includes(rfq.status)));
    if (view === 'production') return byStatus(ui.rfqs.filter((rfq) => ['awarded', 'allocated'].includes(rfq.status)));
    return byStatus(ui.rfqs);
  }
  function renderRfqs() { return renderRfqRegistry('rfqs'); }
  function renderQuotations() { return renderRfqRegistry('quotations'); }
  function renderProduction() { return renderRfqRegistry('production'); }
  // The three tabs used to render one identical table under three different headings: "Quotation
  // comparison" showed no per-quote column and "Production allocations" no purchase order. Each view
  // now has the columns its own question needs.
  function rfqColumns(view) {
    const codeCell = (rfq) => h('td', {}, [h('strong', { text: rfq.rfqCode }), h('small', { text: rfq.sku })]);
    const statusCell = (rfq, ctx) => h('td', {}, [badge(statusLabel(rfq.status), statusTone(rfq.status)), ctx.overdue ? badge(text('\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043e', 'Overdue'), 'danger') : null]);
    if (view === 'quotations') return [
      { label: 'RFQ / SKU', cell: codeCell },
      { label: text('\u041e\u0442\u0432\u0435\u0442\u043e\u0432', 'Quotes'), cell: (rfq) => h('td', { text: String(rfq.quotes.length) }) },
      { label: text('\u041b\u0443\u0447\u0448\u0430\u044f \u0441\u0443\u043c\u043c\u0430', 'Best total'), cell: (rfq, ctx) => h('td', { text: ctx.best ? formatMoneyMinor(ctx.best.totalCostMinor, rfq.bomCurrency) : '\u2014' }) },
      { label: text('\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434.', 'Unit price'), cell: (rfq, ctx) => h('td', { text: ctx.best ? formatMoneyMinor(ctx.best.unitPriceMinor, rfq.bomCurrency) : '\u2014' }) },
      { label: text('\u0420\u0430\u0437\u0431\u0440\u043e\u0441', 'Spread'), cell: (rfq, ctx) => h('td', { text: ctx.spread }) },
      { label: text('\u043a BOM', 'vs BOM'), cell: (rfq, ctx) => h('td', { text: ctx.deltaText }) },
      { label: text('\u0421\u0440\u043e\u043a', 'Lead time'), cell: (rfq, ctx) => h('td', { text: ctx.best ? `${ctx.best.leadTimeDays} ${text('\u0434\u043d.', 'days')}` : '\u2014' }) },
      { label: text('\u041b\u0443\u0447\u0448\u0438\u0439 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Best supplier'), cell: (rfq, ctx) => h('td', { text: ctx.best ? ctx.best.supplierName || ctx.best.supplierCode : '\u2014' }) },
      { label: text('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), cell: statusCell },
    ];
    if (view === 'production') return [
      { label: 'RFQ / SKU', cell: codeCell },
      { label: text('\u041f\u0440\u043e\u0438\u0437\u0432. \u0437\u0430\u043a\u0430\u0437', 'Purchase order'), cell: (rfq) => h('td', { text: rfq.allocation?.purchaseOrderNumber || text('\u041d\u0435 \u0440\u0430\u0437\u043c\u0435\u0449\u0451\u043d', 'Not placed') }) },
      { label: text('\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier'), cell: (rfq) => h('td', { text: rfq.allocation?.supplierCode || rfq.selectedSupplierCode || '\u2014' }) },
      { label: text('\u041a\u043e\u043b-\u0432\u043e', 'Qty'), cell: (rfq) => h('td', { text: String(rfq.allocation?.quantity ?? rfq.targetQuantity) }) },
      { label: text('\u0421\u0442\u0430\u0440\u0442 \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0430', 'Production start'), cell: (rfq) => h('td', { text: rfq.allocation ? formatDate(rfq.allocation.productionStartAt) : '\u2014' }) },
      { label: text('\u0421\u0440\u043e\u043a \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'Delivery due'), cell: (rfq) => h('td', { text: rfq.allocation ? formatDate(rfq.allocation.deliveryDueAt) : formatDate(rfq.deliveryDueAt) }) },
      { label: text('\u0421\u0443\u043c\u043c\u0430 \u0440\u0430\u0437\u043c\u0435\u0449\u0435\u043d\u0438\u044f', 'Awarded total'), cell: (rfq, ctx) => h('td', { text: ctx.best ? formatMoneyMinor(ctx.best.totalCostMinor, rfq.bomCurrency) : '\u2014' }) },
      { label: text('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), cell: statusCell },
    ];
    return [
      { label: 'RFQ / SKU', cell: codeCell },
      { label: text('\u041a\u043e\u043b-\u0432\u043e', 'Qty'), cell: (rfq) => h('td', { text: String(rfq.targetQuantity) }) },
      { label: text('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u043e', 'Invited'), cell: (rfq) => h('td', { text: String(rfq.supplierCodes.length) }) },
      { label: text('\u041e\u0442\u0432\u0435\u0442\u043e\u0432', 'Quotes'), cell: (rfq) => h('td', { text: String(rfq.quotes.length) }) },
      { label: text('\u041b\u0443\u0447\u0448\u0430\u044f \u0441\u0443\u043c\u043c\u0430', 'Best total'), cell: (rfq, ctx) => h('td', { text: ctx.best ? formatMoneyMinor(ctx.best.totalCostMinor, rfq.bomCurrency) : '\u2014' }) },
      { label: text('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), cell: statusCell },
      { label: text('\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier'), cell: (rfq) => h('td', { text: rfq.selectedSupplierCode || '\u2014' }) },
      { label: text('\u041f\u043e\u0441\u0442\u0430\u0432\u043a\u0430', 'Delivery'), cell: (rfq) => h('td', { text: formatDate(rfq.deliveryDueAt) }) },
    ];
  }

  function renderRfqRegistry(view) {
    const values = rfqFilterValues(view);
    const columns = rfqColumns(view);
    const filter = h('select', { onchange: (event) => { ui.rfqStatus = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044b', 'All statuses') }), ...RFQ_STATUSES.map((status) => h('option', { value: status, text: statusLabel(status), selected: ui.rfqStatus === status }))]);
    filter.value = ui.rfqStatus;
    const rows = values.map((rfq) => {
      const quotes = core.rankQuotes(rfq);
      const best = quotes[0];
      const worst = quotes.length > 1 ? quotes[quotes.length - 1] : null;
      const comparison = best ? core.compareQuoteToBom(rfq, best) : null;
      const ctx = {
        best,
        overdue: core.isRfqOverdue(rfq, ui.referenceTime || new Date().toISOString()),
        spread: worst ? formatMoneyMinor(worst.totalCostMinor - best.totalCostMinor, rfq.bomCurrency) : '\u2014',
        deltaText: comparison && comparison.deltaPercent !== null ? `${comparison.deltaPercent >= 0 ? '+' : ''}${comparison.deltaPercent.toFixed(1)}%` : '\u2014',
      };
      const row = h('tr', { className: ui.selectedRfqCode === rfq.rfqCode ? 'selected' : '', tabindex: '0' }, columns.map((column) => column.cell(rfq, ctx)));
      const select = () => { ui.selectedRfqCode = rfq.rfqCode; renderApp(); };
      row.addEventListener('click', select);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
      return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: String(columns.length), className: 'sourcing-empty', text: ui.loading ? text('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026') : text('RFQ \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b.', 'No RFQs found.') })]));
    const heading = view === 'quotations' ? text('\u0421\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0435 \u043a\u043e\u0442\u0438\u0440\u043e\u0432\u043e\u043a', 'Quotation comparison') : view === 'production' ? text('\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0435 \u0440\u0430\u0437\u043c\u0435\u0449\u0435\u043d\u0438\u044f', 'Production allocations') : text('\u0420\u0435\u0435\u0441\u0442\u0440 RFQ', 'RFQ register');
    return h('div', { className: 'sourcing-grid' }, [h('section', { className: 'sourcing-panel' }, [h('div', { className: 'sourcing-toolbar' }, [h('h2', { text: heading }), filter]), h('div', { className: 'sourcing-table-wrap' }, [h('table', { className: 'sourcing-table' }, [h('thead', {}, [h('tr', {}, columns.map((column) => h('th', { text: column.label })))]), h('tbody', {}, rows)])])]), rfqInspector(selectedRfq())]);
  }

  function rfqInspector(rfq) {
    if (!rfq) return h('aside', { className: 'sourcing-inspector' }, [h('p', { className: 'muted', text: text('Выберите RFQ.', 'Select an RFQ.') })]);
    const permissions = { manage: can(rfq.brandId, caps.CAPABILITIES.SOURCING_MANAGE), award: can(rfq.brandId, caps.CAPABILITIES.SOURCING_AWARD), allocate: can(rfq.brandId, caps.CAPABILITIES.PRODUCTION_ALLOCATE) };
    const actions = core.allowedRfqActions(rfq, permissions);
    const quotes = core.rankQuotes(rfq);
    return h('aside', { className: 'sourcing-inspector' }, [
      h('div', { className: 'sourcing-inspector-title' }, [h('div', {}, [h('p', { className: 'eyebrow', text: rfq.rfqCode }), h('h2', { text: rfq.sku })]), badge(statusLabel(rfq.status), statusTone(rfq.status))]),
      h('dl', { className: 'sourcing-details' }, [detail(text('Количество', 'Quantity'), String(rfq.targetQuantity)), detail(text('BOM', 'BOM'), `v${rfq.bomVersion} · ${rfq.bomTotalCost} ${rfq.bomCurrency}`), detail('Incoterm', rfq.incoterm), detail(text('Ответ до', 'Response due'), formatDate(rfq.responseDueAt)), detail(text('Поставка до', 'Delivery due'), formatDate(rfq.deliveryDueAt)), detail(text('Выбран', 'Selected'), rfq.selectedSupplierCode || '—')]),
      quotes.length ? h('section', { className: 'quote-ranking' }, [h('h3', { text: text('Котировки', 'Quotations') }), ...quotes.map((quote) => quoteCard(rfq, quote))]) : h('p', { className: 'muted', text: text('Котировки пока не получены.', 'No quotations received yet.') }),
      rfq.allocation ? h('section', { className: 'allocation-card' }, [h('h3', { text: text('Производственная аллокация', 'Production allocation') }), h('strong', { text: rfq.allocation.purchaseOrderNumber }), h('p', { text: `${rfq.allocation.supplierCode} · ${rfq.allocation.quantity} · ${formatDate(rfq.allocation.productionStartAt)} → ${formatDate(rfq.allocation.deliveryDueAt)}` })]) : null,
      rfq.cancellationReason ? h('div', { className: 'sourcing-warning', text: rfq.cancellationReason }) : null,
      h('div', { className: 'sourcing-actions' }, actions.map((action) => rfqActionButton(action, rfq))),
    ]);
  }
  function quoteCard(rfq, quote) {
    const comparison = core.compareQuoteToBom(rfq, quote);
    const delta = comparison.deltaPercent === null ? '—' : `${comparison.deltaPercent >= 0 ? '+' : ''}${comparison.deltaPercent.toFixed(1)}%`;
    return h('article', { className: `quote-card ${rfq.selectedSupplierCode === quote.supplierCode ? 'selected' : ''}`.trim() }, [h('div', {}, [h('strong', { text: `#${quote.rank} ${quote.supplierName}` }), h('small', { text: `${quote.supplierCode} · rev ${quote.revision}` })]), h('div', {}, [h('strong', { text: formatMoneyMinor(quote.totalCostMinor, rfq.bomCurrency) }), h('small', { text: `${formatMoneyMinor(quote.unitPriceMinor, rfq.bomCurrency)} / ${text('шт.', 'unit')} · BOM ${delta}` })]), h('small', { text: `${quote.leadTimeDays} ${text('дн.', 'days')} · MOQ ${quote.minimumOrderQuantity}` })]);
  }
  function rfqActionButton(action, rfq) {
    const labels = { edit: [text('Редактировать', 'Edit'), 'secondary'], issue: [text('Отправить RFQ', 'Issue RFQ'), 'primary'], quote: [text('Добавить котировку', 'Add quotation'), 'primary'], award: [text('Выбрать победителя', 'Award supplier'), 'primary'], allocate: [text('Создать PO / разместить', 'Create PO / allocate'), 'primary'], cancel: [text('Отменить', 'Cancel'), 'danger'] };
    const handlers = { edit: () => openRfqDialog(rfq), issue: () => issueRfq(rfq), quote: () => openQuoteDialog(rfq), award: () => openAwardDialog(rfq), allocate: () => openAllocationDialog(rfq), cancel: () => openRfqCancelDialog(rfq) };
    return h('button', { type: 'button', className: labels[action][1], disabled: ui.busyKey === rfq.rfqCode, text: labels[action][0], onclick: handlers[action] });
  }
  function detail(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value ?? '—' })]); }

  function control(name, type, value, attrs = {}) { return h('input', { name, type, value: value ?? '', ...attrs }); }
  function textarea(name, value, attrs = {}) { return h('textarea', { name, text: value || '', ...attrs }); }
  function select(name, options, value, attrs = {}) { const node = h('select', { name, ...attrs }, options.map(([key, label]) => h('option', { value: key, text: label }))); node.value = value ?? options[0]?.[0] ?? ''; return node; }
  function field(label, input) { return h('label', { className: 'sourcing-field' }, [h('span', { text: label }), input]); }
  function localInput(value) { if (!value) return ''; const date = new Date(value); if (!Number.isFinite(date.getTime())) return ''; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
  function iso(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error(text('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443.', 'Enter a date.')); return date.toISOString(); }
  function daysFromNow(days) { return localInput(new Date(Date.now() + days * 86400000).toISOString()); }
  function list(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
  // This UI prints money as "21 250,00 €", so a Russian reader types 52,00 — and the form rejected it
  // with the bare code INVALID_MONEY. A comma is a decimal separator here, spaces group thousands, and
  // the message is a sentence.
  function decimalToMinor(value) {
    const normalized = String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new Error(text('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443, \u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 52,00 \u0438\u043b\u0438 52.', 'Enter an amount, for example 52,00 or 52.'));
    }
    const [whole, fraction = ''] = normalized.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }
  function dialog(title, fields, submitLabel, onSubmit, danger = false) {
    const modal = h('dialog', { className: 'sourcing-dialog' }); const form = h('form', { method: 'dialog' }, [h('header', {}, [h('h2', { text: title })]), h('div', { className: 'sourcing-form-grid' }, fields)]);
    const error = h('p', { className: 'sourcing-form-error', hidden: true });
    const cancel = h('button', { type: 'button', className: 'secondary', text: text('Закрыть', 'Close'), onclick: () => modal.close() });
    const submit = h('button', { type: 'submit', className: danger ? 'danger' : 'primary', text: submitLabel });
    form.append(error, h('footer', {}, [cancel, submit]));
    form.addEventListener('submit', async (event) => { event.preventDefault(); submit.disabled = true; error.hidden = true; try { const values = Object.fromEntries(new FormData(form).entries()); const done = await onSubmit(values); if (done) modal.close(); } catch (submitError) { error.textContent = submitError?.message || I18N.t('common.requestError'); error.hidden = false; } finally { if (submit.isConnected) submit.disabled = false; } });
    modal.addEventListener('close', () => modal.remove(), { once: true }); modal.append(form); document.body.append(modal); modal.showModal(); return modal;
  }

  function openSupplierDialog(supplier) {
    const brands = manageableBrands(caps.CAPABILITIES.SUPPLIER_MANAGE);
    if (!supplier && !brands.length) { toast(text('Нет доступного бренда.', 'No manageable brand is available.'), 'error'); return; }
    const brandId = supplier?.brandId || brands[0];
    const fields = {
      brandId: select('brandId', brands.map((id) => [id, brandName(id)]), brandId, { disabled: Boolean(supplier) }), supplierCode: control('supplierCode', 'text', supplier?.supplierCode || '', { required: true, maxlength: '64', disabled: Boolean(supplier) }),
      legalName: control('legalName', 'text', supplier?.legalName || '', { required: true, maxlength: '200' }), countryCode: control('countryCode', 'text', supplier?.countryCode || '', { required: true, minlength: '2', maxlength: '2' }), email: control('email', 'email', supplier?.email || '', { required: true }), currency: control('currency', 'text', supplier?.currency || 'EUR', { required: true, minlength: '3', maxlength: '3' }),
      incoterms: control('incoterms', 'text', (supplier?.incoterms || ['FOB']).join(', '), { required: true }), categories: control('categories', 'text', (supplier?.categories || []).join(', '), { required: true }), leadTimeDays: control('leadTimeDays', 'number', supplier?.leadTimeDays || 60, { min: '1', max: '730', required: true }), minimumOrderQuantity: control('minimumOrderQuantity', 'number', supplier?.minimumOrderQuantity || 100, { min: '1', required: true }), paymentTermsDays: control('paymentTermsDays', 'number', supplier?.paymentTermsDays ?? 30, { min: '0', max: '365', required: true }), auditExpiresAt: control('auditExpiresAt', 'datetime-local', localInput(supplier?.auditExpiresAt) || daysFromNow(365), { required: true }), notes: textarea('notes', supplier?.notes || '', { maxlength: '2000', rows: '4' }),
    };
    dialog(supplier ? text('Редактировать поставщика', 'Edit supplier') : text('Новый поставщик', 'New supplier'), [field(text('Бренд', 'Brand'), fields.brandId), field(text('Код', 'Code'), fields.supplierCode), field(text('Юридическое название', 'Legal name'), fields.legalName), field(text('Страна ISO', 'Country ISO'), fields.countryCode), field('Email', fields.email), field(text('Валюта', 'Currency'), fields.currency), field('Incoterms', fields.incoterms), field(text('Категории через запятую', 'Comma-separated categories'), fields.categories), field('Lead time', fields.leadTimeDays), field('MOQ', fields.minimumOrderQuantity), field(text('Отсрочка оплаты, дней', 'Payment terms, days'), fields.paymentTermsDays), field(text('Аудит действует до', 'Audit valid until'), fields.auditExpiresAt), field(text('Комментарий', 'Notes'), fields.notes)], text('Сохранить', 'Save'), async (values) => {
      const editable = { legalName: values.legalName.trim(), countryCode: values.countryCode.trim().toUpperCase(), email: values.email.trim(), currency: values.currency.trim().toUpperCase(), incoterms: list(values.incoterms).map((item) => item.toUpperCase()), categories: list(values.categories), leadTimeDays: Number(values.leadTimeDays), minimumOrderQuantity: Number(values.minimumOrderQuantity), paymentTermsDays: Number(values.paymentTermsDays), auditExpiresAt: iso(values.auditExpiresAt), notes: values.notes.trim() || null };
      if (supplier) return Boolean(await runMutation(supplier.supplierCode, `/v2/suppliers/${encodeURIComponent(supplier.supplierCode)}`, { expectedVersion: supplier.version, ...editable }, 'PATCH', 'supplier'));
      return Boolean(await runMutation(values.supplierCode.trim().toUpperCase(), '/v2/suppliers', { supplierCode: values.supplierCode.trim().toUpperCase(), brandId, ...editable }, 'POST', 'supplier'));
    });
  }
  // Confirmation is a dialog, not window.confirm: a native box cannot be translated, carries the
  // browser's own chrome and looked nothing like the styled confirmation every other destructive
  // action in the app already opened.
  function confirmDialog(title, question, submitLabel, run, danger = false) {
    // The dialog closes when the command succeeded. Returning true unconditionally meant a refused
    // action looked exactly like an accepted one.
    dialog(title, [h('p', { className: 'sourcing-confirm', text: question })], submitLabel, async () => Boolean(await run()), danger);
  }
  function qualifySupplier(supplier) {
    confirmDialog(text('Квалифицировать поставщика', 'Qualify supplier'), text(`${supplier.supplierCode} станет доступен для запросов цен.`, `${supplier.supplierCode} becomes available for requests for quotation.`), text('Квалифицировать', 'Qualify'),
      () => runMutation(supplier.supplierCode, `/v2/suppliers/${encodeURIComponent(supplier.supplierCode)}/qualify`, { expectedVersion: supplier.version }, 'POST', 'supplier'));
  }
  function openSupplierSuspendDialog(supplier) { dialog(text('Приостановить поставщика', 'Suspend supplier'), [field(text('Причина', 'Reason'), textarea('reason', '', { required: true, minlength: '5', maxlength: '500', rows: '4' }))], text('Приостановить', 'Suspend'), async (values) => Boolean(await runMutation(supplier.supplierCode, `/v2/suppliers/${encodeURIComponent(supplier.supplierCode)}/suspend`, { expectedVersion: supplier.version, reason: values.reason }, 'POST', 'supplier')), true); }
  function archiveSupplier(supplier) {
    confirmDialog(text('Переместить в архив', 'Archive supplier'), text(`${supplier.supplierCode} больше не появится в запросах цен.`, `${supplier.supplierCode} will no longer appear in requests for quotation.`), text('В архив', 'Archive'),
      () => runMutation(supplier.supplierCode, `/v2/suppliers/${encodeURIComponent(supplier.supplierCode)}/archive`, { expectedVersion: supplier.version }, 'POST', 'supplier'), true);
  }

  function openRfqDialog(rfq) {
    const skus = publishedSkuOptions(); if (!rfq && !skus.length) { toast(text('Нужен опубликованный SKU с опубликованной BOM.', 'A published SKU with a published BOM is required.'), 'error'); return; }
    const sku = rfq ? catalog().find((item) => item.sku === rfq.sku) : skus[0]; const suppliers = qualifiedSuppliers(rfq?.brandId || sku.brandId);
    if (!rfq && !suppliers.length) { toast(text('Сначала квалифицируйте поставщика.', 'Qualify a supplier first.'), 'error'); return; }
    const controls = { sku: select('sku', skus.map((item) => [item.sku, `${item.sku} · ${item.name || ''}`]), rfq?.sku || sku.sku, { disabled: Boolean(rfq) }), rfqCode: control('rfqCode', 'text', rfq?.rfqCode || `RFQ-${sku.sku}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`, { required: true, maxlength: '64', disabled: Boolean(rfq) }), targetQuantity: control('targetQuantity', 'number', rfq?.targetQuantity || 500, { min: '1', required: true }), responseDueAt: control('responseDueAt', 'datetime-local', localInput(rfq?.responseDueAt) || daysFromNow(7), { required: true }), deliveryDueAt: control('deliveryDueAt', 'datetime-local', localInput(rfq?.deliveryDueAt) || daysFromNow(90), { required: true }), incoterm: select('incoterm', INCOTERMS.map((item) => [item, item]), rfq?.incoterm || 'FOB'), supplierCodes: control('supplierCodes', 'text', (rfq?.supplierCodes || suppliers.map((item) => item.supplierCode)).join(', '), { required: true }), notes: textarea('notes', rfq?.notes || '', { maxlength: '2000', rows: '4' }) };
    dialog(rfq ? text('Редактировать RFQ', 'Edit RFQ') : text('Новый RFQ', 'New RFQ'), [field('SKU', controls.sku), field(text('Код RFQ', 'RFQ code'), controls.rfqCode), field(text('Целевое количество', 'Target quantity'), controls.targetQuantity), field(text('Ответ до', 'Response due'), controls.responseDueAt), field(text('Поставка до', 'Delivery due'), controls.deliveryDueAt), field('Incoterm', controls.incoterm), field(text('Коды поставщиков через запятую', 'Comma-separated supplier codes'), controls.supplierCodes), field(text('Комментарий', 'Notes'), controls.notes)], text('Сохранить', 'Save'), async (values) => {
      const editable = { targetQuantity: Number(values.targetQuantity), responseDueAt: iso(values.responseDueAt), deliveryDueAt: iso(values.deliveryDueAt), incoterm: values.incoterm, supplierCodes: list(values.supplierCodes).map((item) => item.toUpperCase()), notes: values.notes.trim() || null };
      if (rfq) return Boolean(await runMutation(rfq.rfqCode, `/v2/rfqs/${encodeURIComponent(rfq.rfqCode)}`, { expectedVersion: rfq.version, ...editable }, 'PATCH'));
      return Boolean(await runMutation(values.rfqCode.trim().toUpperCase(), '/v2/rfqs', { rfqCode: values.rfqCode.trim().toUpperCase(), sku: values.sku, ...editable }));
    });
  }
  function issueRfq(rfq) {
    confirmDialog(text('Отправить запрос', 'Issue request'), text(`${rfq.rfqCode} будет отправлен приглашённым поставщикам и станет доступен им в портале.`, `${rfq.rfqCode} goes to the invited suppliers and becomes visible to them in the portal.`), text('Отправить', 'Issue'),
      () => runMutation(rfq.rfqCode, `/v2/rfqs/${encodeURIComponent(rfq.rfqCode)}/issue`, { expectedVersion: rfq.version }));
  }
  function openQuoteDialog(rfq) {
    const suppliers = rfq.supplierCodes.map(supplierByCode).filter(Boolean); if (!suppliers.length) { toast(text('Приглашённые поставщики не найдены.', 'Invited suppliers were not found.'), 'error'); return; }
    dialog(text('Полученная котировка', 'Received quotation'), [field(text('Поставщик', 'Supplier'), select('supplierCode', suppliers.map((item) => [item.supplierCode, `${item.supplierCode} · ${item.legalName}`]), suppliers[0].supplierCode)), field(text('Цена за единицу', 'Unit price'), control('unitPrice', 'text', '', { required: true, inputmode: 'decimal' })), field(text('Фиксированные затраты', 'Fixed cost'), control('fixedCost', 'text', '0', { required: true, inputmode: 'decimal' })), field('Lead time', control('leadTimeDays', 'number', suppliers[0].leadTimeDays, { min: '1', max: '730', required: true })), field('MOQ', control('minimumOrderQuantity', 'number', suppliers[0].minimumOrderQuantity, { min: '1', required: true })), field(text('Действует до', 'Valid until'), control('validUntil', 'datetime-local', daysFromNow(21), { required: true })), field(text('Комментарий', 'Notes'), textarea('notes', '', { maxlength: '1000', rows: '4' }))], text('Записать котировку', 'Record quotation'), async (values) => Boolean(await runMutation(rfq.rfqCode, `/v2/rfqs/${encodeURIComponent(rfq.rfqCode)}/quotes`, { expectedVersion: rfq.version, supplierCode: values.supplierCode, unitPriceMinor: decimalToMinor(values.unitPrice), fixedCostMinor: decimalToMinor(values.fixedCost), leadTimeDays: Number(values.leadTimeDays), minimumOrderQuantity: Number(values.minimumOrderQuantity), validUntil: iso(values.validUntil), notes: values.notes.trim() || null })));
  }
  function openAwardDialog(rfq) {
    const quotes = core.rankQuotes(rfq); if (!quotes.length) return;
    dialog(text('Выбор победителя RFQ', 'Award RFQ'), [field(text('Поставщик / сумма', 'Supplier / total'), select('supplierCode', quotes.map((quote) => [quote.supplierCode, `#${quote.rank} ${quote.supplierName} · ${formatMoneyMinor(quote.totalCostMinor, rfq.bomCurrency)}`]), quotes[0].supplierCode))], text('Подтвердить выбор', 'Confirm award'), async (values) => Boolean(await runMutation(rfq.rfqCode, `/v2/rfqs/${encodeURIComponent(rfq.rfqCode)}/award`, { expectedVersion: rfq.version, supplierCode: values.supplierCode })));
  }
  // Allocating a request and opening the production order it allocates to are two commands, and they
  // stay two: they need different standing, and the second is the factory's copy of the deal. What
  // they are not is two screens. The wizard used to finish by saying "PO-… created", leave nothing in
  // Производственные заказы, and require the buyer to retype that same code by hand into a bare text
  // box in another section. So the allocation now opens the order in the same step, and when the
  // actor may allocate but not open orders it says who has to.
  function openAllocationDialog(rfq) {
    dialog(text('PO и размещение производства', 'PO and production allocation'), [field(text('Номер PO', 'PO number'), control('purchaseOrderNumber', 'text', `PO-${rfq.rfqCode}`, { required: true, maxlength: '80' })), field(text('Количество', 'Quantity'), control('quantity', 'number', rfq.targetQuantity, { min: '1', required: true, readonly: true })), field(text('Старт производства', 'Production start'), control('productionStartAt', 'datetime-local', daysFromNow(1), { required: true })), field(text('Поставка', 'Delivery due'), control('deliveryDueAt', 'datetime-local', localInput(rfq.deliveryDueAt), { required: true })), field(text('Комментарий', 'Notes'), textarea('notes', '', { maxlength: '1000', rows: '4' }))], text('Создать PO и разместить', 'Create PO and allocate'), async (values) => {
      const allocated = await runMutation(rfq.rfqCode, `/v2/rfqs/${encodeURIComponent(rfq.rfqCode)}/allocate`, { expectedVersion: rfq.version, purchaseOrderNumber: values.purchaseOrderNumber.trim().toUpperCase(), quantity: Number(values.quantity), productionStartAt: iso(values.productionStartAt), deliveryDueAt: iso(values.deliveryDueAt), notes: values.notes.trim() || null });
      if (!allocated) return false;
      if (!can(rfq.brandId, caps.CAPABILITIES.PRODUCTION_ORDER_MANAGE)) {
        toast(text(
          `Размещение выполнено. Производственный заказ откроет тот, у кого есть право на производственные заказы — код запроса ${rfq.rfqCode}.`,
          `Allocated. Someone with production-order rights opens the order itself — request code ${rfq.rfqCode}.`,
        ));
        return true;
      }
      await openProductionOrder(rfq.rfqCode);
      return true;
    });
  }

  async function openProductionOrder(rfqCode) {
    try {
      const order = await mutate(`/v2/production-orders/from-allocation/${encodeURIComponent(rfqCode)}`, {}, 'POST');
      toast(text(`Производственный заказ ${order.productionOrderNumber} открыт.`, `Production order ${order.productionOrderNumber} is open.`));
    } catch (error) {
      // The allocation succeeded and must not be reported as a failure; what failed is the step after
      // it, and the message says which step and what to do about it.
      toast(text(
        `Размещение выполнено, но производственный заказ не открылся: ${errorMessage(error)} Откройте его в разделе «Производственные заказы» по коду ${rfqCode}.`,
        `Allocated, but the production order did not open: ${errorMessage(error)} Open it in Production orders using code ${rfqCode}.`,
      ), 'error');
    }
  }

  function openRfqCancelDialog(rfq) { dialog(text('Отменить RFQ', 'Cancel RFQ'), [field(text('Причина', 'Reason'), textarea('reason', '', { required: true, minlength: '5', maxlength: '500', rows: '4' }))], text('Отменить RFQ', 'Cancel RFQ'), async (values) => Boolean(await runMutation(rfq.rfqCode, `/v2/rfqs/${encodeURIComponent(rfq.rfqCode)}/cancel`, { expectedVersion: rfq.version, reason: values.reason })), true); }

  const previousRenderView = renderView;
  renderView = (...args) => SOURCING_VIEWS.has(state.view) ? renderSourcing() : previousRenderView(...args);
  global.SynthaSourcingWorkspace.fetchAllPages = fetchAllPages;
})(window);
