(function installStylesModule() {
  'use strict';

  const core = window.SynthaStylesCore;
  if (!core) throw new Error('SynthaStylesCore must load before styles.js');

  const stylesNav = OD_V5_GROUPS.flatMap((group) => group.items)
    .find((item) => item.en === 'Styles and colourways' || item.en === 'Styles / SKU');
  if (stylesNav) {
    stylesNav.view = 'styles';
    stylesNav.ru = '\u041c\u043e\u0434\u0435\u043b\u0438 / SKU';
    stylesNav.en = 'Styles / SKU';
    stylesNav.planned = false;
  }

  function stylesText(ru, en) { return localText(ru, en); }

  function styleRiskLabel(code) {
    const labels = {
      INVALID_STYLE_IDENTITY: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 SKU \u0438\u043b\u0438 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Invalid SKU or name'],
      MISSING_COLLECTION: ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430', 'Collection not found'],
      BRAND_MISMATCH: ['\u0411\u0440\u0435\u043d\u0434 SKU \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 \u0441 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0435\u0439', 'SKU brand differs from collection'],
      CURRENCY_MISMATCH: ['\u0412\u0430\u043b\u044e\u0442\u0430 SKU \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 \u0441 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0435\u0439', 'SKU currency differs from collection'],
      INVALID_WHOLESALE_PRICE: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f wholesale-\u0446\u0435\u043d\u0430', 'Invalid wholesale price'],
      INVALID_MOQ: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 MOQ', 'Invalid MOQ'],
      INVENTORY_INCONSISTENT: ['\u041e\u0441\u0442\u0430\u0442\u043e\u043a, \u0440\u0435\u0437\u0435\u0440\u0432 \u0438 ATS \u043d\u0435 \u0441\u0432\u043e\u0434\u044f\u0442\u0441\u044f', 'Available, reserved and ATS do not reconcile'],
      PUBLISHED_WITHOUT_COLLECTION: ['SKU \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d \u0431\u0435\u0437 \u0433\u043e\u0442\u043e\u0432\u043e\u0439 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'SKU published without a published collection'],
      STYLE_NOT_PUBLISHED: ['SKU \u043d\u0435 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d', 'SKU is not published'],
      NO_OPEN_LINESHEET: ['SKU \u043d\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0432 \u043e\u0442\u043a\u0440\u044b\u0442\u043e\u043c linesheet', 'SKU is not enabled in an open linesheet'],
      ATS_BELOW_MOQ: ['ATS \u043d\u0438\u0436\u0435 MOQ', 'ATS is below MOQ'],
      NO_COMMERCIAL_USAGE: ['SKU \u043d\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043b\u0441\u044f \u0432 \u043e\u0442\u0431\u043e\u0440\u0430\u0445 \u0438 \u0437\u0430\u043a\u0430\u0437\u0430\u0445', 'SKU has no selection or order usage'],
    };
    const pair = labels[code] || [code, code];
    return stylesText(pair[0], pair[1]);
  }

  function styleReadinessBadge(value) {
    const tone = value >= 80 ? 'success' : value >= 55 ? 'warning' : 'danger';
    return el('span', { className: `style-readiness ${tone}`, rawText: `${value}%` });
  }

  function styleGateRow(label, value, maximum) {
    const row = el('div', { className: 'style-gate-row' });
    const track = el('span', { className: 'style-gate-track' });
    track.append(el('span', { className: 'style-gate-fill', style: `width:${maximum ? Math.round((value / maximum) * 100) : 0}%` }));
    row.append(el('span', { rawText: label }), track, el('strong', { rawText: `${value}/${maximum}` }));
    return row;
  }

  function styleRiskList(item) {
    const list = el('div', { className: 'style-risk-list' });
    if (!item.risks.length) {
      list.append(el('div', { className: 'style-risk-empty', rawText: stylesText('\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0439 \u043d\u0435\u0442', 'No exceptions') }));
      return list;
    }
    item.risks.forEach((risk) => {
      const row = el('div', { className: `style-risk ${risk.severity}` });
      row.append(
        el('span', { className: 'style-risk-severity', rawText: statusLabel(risk.severity) }),
        el('strong', { rawText: styleRiskLabel(risk.code) }),
      );
      list.append(row);
    });
    return list;
  }

  function styleGates(item) {
    const node = el('section', { className: 'style-gates' });
    node.append(
      styleGateRow(stylesText('\u0418\u0434\u0435\u043d\u0442\u0438\u0447\u043d\u043e\u0441\u0442\u044c', 'Identity'), item.gateScores.identity, 15),
      styleGateRow(stylesText('\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collection context'), item.gateScores.collectionContext, 15),
      styleGateRow(stylesText('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0443\u0441\u043b\u043e\u0432\u0438\u044f', 'Commercial terms'), item.gateScores.commercialTerms, 20),
      styleGateRow(stylesText('\u0417\u0430\u043f\u0430\u0441', 'Inventory'), item.gateScores.inventory, 20),
      styleGateRow(stylesText('\u041f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u044f', 'Publication'), item.gateScores.publication, 15),
      styleGateRow('Linesheet', item.gateScores.salesEnablement, 15),
    );
    return node;
  }

  function styleUsageTable(item) {
    return odMiniTable([
      stylesText('\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u044c', 'Metric'),
      stylesText('\u0417\u043d\u0430\u0447\u0435\u043d\u0438\u0435', 'Value'),
    ], [
      [stylesText('\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435 linesheets', 'Open linesheets'), item.openShowrooms.length],
      [stylesText('\u041e\u0442\u0431\u043e\u0440\u044b', 'Selections'), item.usage.selections.length],
      [stylesText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), item.usage.orders.length],
      [stylesText('\u0412\u044b\u0431\u0440\u0430\u043d\u043e, \u0435\u0434.', 'Selected units'), item.usage.selectedUnits],
      [stylesText('\u0417\u0430\u043a\u0430\u0437\u0430\u043d\u043e, \u0435\u0434.', 'Ordered units'), item.usage.orderedUnits],
    ]);
  }

  function styleInspector(item) {
    const actions = typeof odSkuActions === 'function' ? odSkuActions(item.sku) : [];
    return odInspector({
      title: item.sku.name || item.sku.sku,
      subtitle: `${item.sku.sku} \u00b7 ${item.collection?.name || item.sku.collectionId || '\u2014'}`,
      status: item.sku.status,
      tabs: [stylesText('\u041c\u0430\u0441\u0442\u0435\u0440-\u0434\u0430\u043d\u043d\u044b\u0435', 'Master data'), stylesText('\u041a\u043e\u043c\u043c\u0435\u0440\u0446\u0438\u044f', 'Commerce'), stylesText('\u0420\u0438\u0441\u043a\u0438', 'Risks')],
      fields: [
        { label: 'SKU', value: item.sku.sku },
        { label: stylesText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item.collection?.name || item.sku.collectionId },
        { label: stylesText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: orgName(item.sku.brandId) },
        { label: stylesText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), value: `${item.readiness}%` },
        { label: stylesText('\u0426\u0435\u043d\u0430', 'Price'), value: `${money(item.sku.wholesalePrice)} ${item.sku.currency || ''}`.trim() },
        { label: 'MOQ', value: item.sku.minimumOrderQuantity },
        { label: stylesText('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e', 'Available'), value: item.sku.availableQuantity },
        { label: stylesText('\u0420\u0435\u0437\u0435\u0440\u0432', 'Reserved'), value: item.sku.reservedQuantity || 0 },
        { label: 'ATS', value: item.ats },
        { label: stylesText('\u0412\u0435\u0440\u0441\u0438\u044f', 'Version'), value: item.sku.version },
      ],
      content: [styleGates(item), styleUsageTable(item), styleRiskList(item)],
      actions,
    });
  }

  function styleRegistry(rows) {
    return odRegistry({
      scope: 'style-master',
      filterScope: 'styles',
      rows,
      rowKey: (item) => item.sku.sku,
      statusAccessor: (item) => item.sku.status,
      columns: [
        { label: 'SKU', value: (item) => item.sku.sku },
        { label: stylesText('\u041c\u043e\u0434\u0435\u043b\u044c', 'Style'), value: (item) => item.sku.name },
        { label: stylesText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: (item) => item.collection?.name || item.sku.collectionId },
        { label: stylesText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), render: (item) => styleReadinessBadge(item.readiness) },
        { label: 'ATS', value: (item) => item.ats },
        { label: stylesText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: (item) => item.usage.orders.length },
        { label: stylesText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: (item) => statusBadge(item.sku.status) },
      ],
      inspector: styleInspector,
    });
  }

  function styleQualityView(registry) {
    const rows = registry.styles.flatMap((item) => item.risks.map((risk) => ({ item, risk })));
    return odTable('style-quality', rows, [
      { label: 'SKU', value: (row) => row.item.sku.sku },
      { label: stylesText('\u041c\u043e\u0434\u0435\u043b\u044c', 'Style'), value: (row) => row.item.sku.name },
      { label: stylesText('\u0423\u0440\u043e\u0432\u0435\u043d\u044c', 'Severity'), render: (row) => statusBadge(row.risk.severity) },
      { label: stylesText('\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0435', 'Exception'), value: (row) => styleRiskLabel(row.risk.code) },
      { label: stylesText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), render: (row) => styleReadinessBadge(row.item.readiness) },
    ], (row) => `${row.item.sku.sku}:${row.risk.code}`).node;
  }

  function renderStyles() {
    const registry = core.buildRegistry(state.workspace);
    const caps = window.SynthaUiCapabilities;
    const canCreate = caps?.hasAny?.(state.workspace, caps.CAPABILITIES.CATALOG_MANAGE, 'brand')
      && state.workspace.collections.some((collection) => caps.hasForOrganisation(state.workspace, collection.brandId, caps.CAPABILITIES.CATALOG_MANAGE));
    const header = odHeader('styles', [
      { id: 'master', label: 'Style & SKU Master' },
      { id: 'publication', label: stylesText('\u041e\u0447\u0435\u0440\u0435\u0434\u044c \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438', 'Publication queue') },
      { id: 'quality', label: stylesText('\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e \u0434\u0430\u043d\u043d\u044b\u0445', 'Data quality') },
      { id: 'usage', label: stylesText('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435', 'Commercial usage') },
    ], [
      { label: stylesText('\u041c\u043e\u0434\u0435\u043b\u0438 / SKU', 'Styles / SKU'), value: registry.summary.total, detail: `${registry.summary.published} ${stylesText('\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e', 'published')}` },
      { label: stylesText('\u0413\u043e\u0442\u043e\u0432\u044b \u043a \u043f\u0440\u043e\u0434\u0430\u0436\u0435', 'Sale-ready'), value: registry.summary.saleReady, detail: `${registry.summary.averageReadiness}% ${stylesText('\u0441\u0440\u0435\u0434\u043d\u044f\u044f \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'average readiness')}` },
      { label: stylesText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: registry.summary.draft, detail: stylesText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438', 'require publication') },
      { label: stylesText('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435', 'Critical'), value: registry.summary.critical, detail: stylesText('\u0431\u043b\u043e\u043a\u0438\u0440\u0443\u044e\u0442 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435', 'block usage'), tone: registry.summary.critical ? 'warning' : 'success' },
      { label: 'ATS < MOQ', value: registry.summary.lowAts, detail: stylesText('\u0440\u0438\u0441\u043a \u043d\u0435\u0434\u043e\u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'availability risk'), tone: registry.summary.lowAts ? 'warning' : 'success' },
    ], ['draft', 'published'], stylesText('\u041f\u043e\u0438\u0441\u043a SKU, \u043c\u043e\u0434\u0435\u043b\u0438 \u0438\u043b\u0438 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Search SKU, style or collection'), canCreate ? odAction(stylesText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU', 'Create SKU'), catalogSkuForm) : null);

    let content;
    if (header.active === 'quality') content = styleQualityView(registry);
    else if (header.active === 'publication') content = styleRegistry(registry.styles.filter((item) => item.sku.status !== 'published'));
    else if (header.active === 'usage') content = styleRegistry([...registry.styles].sort((a, b) => (b.usage.orders.length - a.usage.orders.length) || (b.usage.selectedUnits - a.usage.selectedUnits)));
    else content = styleRegistry(registry.styles);
    scheduleStylesV5Context();
    return odPage(stylesText('\u041c\u0430\u0441\u0442\u0435\u0440-\u0440\u0435\u0435\u0441\u0442\u0440 \u043c\u043e\u0434\u0435\u043b\u0435\u0439 \u0438 SKU', 'Style and SKU master'), header, content);
  }

  const baseRenderView = renderView;
  renderView = function renderStylesIndustrialView() {
    return state.view === 'styles' ? renderStyles() : baseRenderView();
  };

  const baseViewTitle = viewTitle;
  viewTitle = function stylesViewTitle(view) {
    return view === 'styles' ? stylesText('\u041c\u043e\u0434\u0435\u043b\u0438 / SKU', 'Styles / SKU') : baseViewTitle(view);
  };

  const baseViewSectionName = viewSectionName;
  viewSectionName = function stylesViewSectionName(view) {
    return view === 'styles' ? 'PLM / Product' : baseViewSectionName(view);
  };

  function scheduleStylesV5Context() {
    if (typeof queueMicrotask === 'function') queueMicrotask(applyStylesV5Context);
    else Promise.resolve().then(applyStylesV5Context);
  }

  function applyStylesV5Context() {
    if (state.view !== 'styles') return;
    const copy = document.querySelector('.od-v5-page-context .od-v5-context-copy');
    if (!copy) return;
    const kicker = copy.querySelector('.od-v5-context-kicker');
    const title = copy.querySelector('h2');
    const description = copy.querySelector('p');
    if (kicker) kicker.textContent = 'PLM / STYLE MASTER';
    if (title) title.textContent = stylesText('\u041c\u043e\u0434\u0435\u043b\u0438 \u0438 SKU', 'Styles and SKU');
    if (description) description.textContent = stylesText(
      '\u0415\u0434\u0438\u043d\u044b\u0439 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u0438\u0440\u0443\u0435\u043c\u044b\u0439 \u0440\u0435\u0435\u0441\u0442\u0440 SKU: \u043c\u0430\u0441\u0442\u0435\u0440-\u0434\u0430\u043d\u043d\u044b\u0435, \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u044f, \u0437\u0430\u043f\u0430\u0441\u044b, linesheets \u0438 \u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435 \u0432 \u0437\u0430\u043a\u0430\u0437\u0430\u0445.',
      'A governed SKU master covering data quality, publication, inventory, linesheets and actual order usage.',
    );
  }
})();
