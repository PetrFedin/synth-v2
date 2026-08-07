(function installStyleMasterV6() {
  'use strict';

  const core = window.SynthaStylesCore;
  if (!core) throw new Error('SynthaStylesCore must load before styles.js');
  const nav = OD_V5_GROUPS.flatMap((group) => group.items).find((item) => item.en === 'Styles and colourways' || item.en === 'Styles / SKU');
  if (nav) { nav.view = 'styles'; nav.ru = '\u041c\u043e\u0434\u0435\u043b\u0438 / SKU'; nav.en = 'Styles / SKU'; nav.planned = false; }
  function text(ru, en) { return localText(ru, en); }
  function riskLabel(code) {
    const labels = {
      INVALID_STYLE_IDENTITY: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 SKU \u0438\u043b\u0438 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Invalid SKU or name'],
      MISSING_COLLECTION: ['\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430', 'Collection not found'],
      BRAND_MISMATCH: ['\u0411\u0440\u0435\u043d\u0434 SKU \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 \u0441 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0435\u0439', 'SKU brand differs from collection'],
      CURRENCY_MISMATCH: ['\u0412\u0430\u043b\u044e\u0442\u0430 SKU \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442', 'SKU currency differs from collection'],
      INVALID_WHOLESALE_PRICE: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u043e\u043f\u0442\u043e\u0432\u0430\u044f \u0446\u0435\u043d\u0430', 'Invalid wholesale price'],
      INVALID_MOQ: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 MOQ', 'Invalid MOQ'],
      INVENTORY_INCONSISTENT: ['\u0420\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u0435 \u043e\u0441\u0442\u0430\u0442\u043a\u043e\u0432', 'Inventory mismatch'],
      PUBLISHED_WITHOUT_COLLECTION: ['SKU \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d \u0434\u043e \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'SKU published before collection'],
      STYLE_NOT_PUBLISHED: ['SKU \u043d\u0435 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d', 'SKU not published'],
      NO_OPEN_LINESHEET: ['\u041d\u0435\u0442 \u043e\u0442\u043a\u0440\u044b\u0442\u043e\u0433\u043e linesheet', 'No open linesheet'],
      ATS_BELOW_MOQ: ['ATS \u043d\u0438\u0436\u0435 MOQ', 'ATS below MOQ'],
      NO_COMMERCIAL_USAGE: ['\u041d\u0435\u0442 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f', 'No commercial usage'],
    };
    const pair = labels[code] || [code, code];
    return text(pair[0], pair[1]);
  }
  function readiness(item) {
    const node = el('div', { className: 'industrial-readiness' });
    const bar = el('progress', { className: 'industrial-readiness-bar' });
    bar.max = 100;
    bar.value = Math.max(0, Math.min(100, Number(item.readiness) || 0));
    bar.setAttribute('aria-label', text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'));
    node.append(bar, el('strong', { rawText: `${item.readiness}%` }));
    return node;
  }
  function riskBadge(item) { return el('span', { className: `badge industrial-risk ${item.highestRisk}`, rawText: item.risks.length ? riskLabel(item.risks[0].code) : text('\u0413\u043e\u0442\u043e\u0432', 'Ready') }); }
  function inspector(item) {
    const risks = item.risks.length
      ? odMiniTable([text('\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u0430', 'Issue'), text('\u0423\u0440\u043e\u0432\u0435\u043d\u044c', 'Severity')], item.risks.map((risk) => [riskLabel(risk.code), statusBadge(risk.severity)]))
      : notice(text('\u0411\u043b\u043e\u043a\u0438\u0440\u0443\u044e\u0449\u0438\u0445 \u043f\u0440\u043e\u0431\u043b\u0435\u043c \u043d\u0435\u0442', 'No blocking issues'), 'success');
    return odInspector({
      title: item.sku.name,
      subtitle: item.sku.sku,
      status: item.sku.status,
      preview: true,
      tabs: [text('\u041e\u0431\u0437\u043e\u0440', 'Overview'), text('\u041e\u0441\u0442\u0430\u0442\u043a\u0438', 'Inventory'), text('\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435', 'Usage')],
      fields: [
        { label: text('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item.collection?.name || item.sku.collectionId },
        { label: text('\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u0446\u0435\u043d\u0430', 'Wholesale'), value: `${money(item.sku.wholesalePrice)} ${item.sku.currency}` },
        { label: 'MOQ', value: item.sku.minimumOrderQuantity },
        { label: 'ATS', value: item.ats },
        { label: text('\u041e\u0442\u0431\u043e\u0440\u044b', 'Selections'), value: item.usage.selections.length },
        { label: text('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: item.usage.orders.length },
        { label: text('\u0417\u0430\u043a\u0430\u0437\u0430\u043d\u043e \u0435\u0434\u0438\u043d\u0438\u0446', 'Ordered units'), value: item.usage.orderedUnits },
        { label: text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), value: `${item.readiness}%` },
      ],
      content: [risks],
      actions: odSkuActions(item.sku),
    });
  }
  function renderStyles() {
    const registry = core.buildRegistry(state.workspace);
    const caps = window.SynthaUiCapabilities;
    const header = odHeader('styles', [
      { id: 'registry', label: text('\u0420\u0435\u0435\u0441\u0442\u0440', 'Registry') },
      { id: 'publication', label: text('\u041f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u044f', 'Publication') },
      { id: 'exceptions', label: text('\u0418\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f', 'Exceptions') },
      { id: 'usage', label: text('\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435', 'Usage') },
    ], [
      { label: 'SKU', value: registry.summary.total, detail: `${registry.summary.published} ${text('\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e', 'published')}` },
      { label: text('\u0413\u043e\u0442\u043e\u0432\u044b \u043a \u043f\u0440\u043e\u0434\u0430\u0436\u0435', 'Sale ready'), value: registry.summary.saleReady, detail: `${registry.summary.averageReadiness}%` },
      { label: text('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: registry.summary.draft, detail: text('\u043e\u0447\u0435\u0440\u0435\u0434\u044c \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438', 'publication queue') },
      { label: text('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435', 'Critical'), value: registry.summary.critical, detail: text('\u0431\u043b\u043e\u043a\u0435\u0440\u044b', 'blockers') },
      { label: text('\u041d\u0438\u0437\u043a\u0438\u0439 ATS', 'Low ATS'), value: registry.summary.lowAts, detail: `${registry.summary.commerciallyUsed} ${text('\u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u044e\u0442\u0441\u044f', 'used')}` },
    ], ['draft', 'published'], text('\u041f\u043e\u0438\u0441\u043a SKU, \u043c\u043e\u0434\u0435\u043b\u0438 \u0438\u043b\u0438 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Search SKU, style or collection'), caps.hasAny(state.workspace, caps.CAPABILITIES.CATALOG_MANAGE, 'brand') && state.workspace.collections.length ? odAction(text('\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU', 'Create SKU'), catalogSkuForm) : null);
    let rows = registry.styles;
    if (header.active === 'publication') rows = rows.filter((item) => item.sku.status === 'draft');
    if (header.active === 'exceptions') rows = rows.filter((item) => item.risks.length);
    if (header.active === 'usage') rows = [...rows].sort((left, right) => right.usage.orderedUnits - left.usage.orderedUnits || String(left.sku.sku).localeCompare(String(right.sku.sku)));
    const content = odRegistry({
      scope: 'od-styles', filterScope: 'styles', rows, rowKey: (item) => item.sku.sku,
      statusAccessor: (item) => item.sku.status,
      columns: [
        { label: 'SKU', value: (item) => item.sku.sku },
        { label: text('\u041c\u043e\u0434\u0435\u043b\u044c', 'Style'), value: (item) => item.sku.name },
        { label: text('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: (item) => item.collection?.name || item.sku.collectionId },
        { label: text('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: (item) => statusBadge(item.sku.status) },
        { label: text('\u041e\u043f\u0442. \u0446\u0435\u043d\u0430', 'Wholesale'), value: (item) => `${money(item.sku.wholesalePrice)} ${item.sku.currency}` },
        { label: 'MOQ', value: (item) => item.sku.minimumOrderQuantity },
        { label: 'ATS', value: (item) => item.ats },
        { label: text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), render: readiness },
        { label: text('\u0420\u0438\u0441\u043a', 'Risk'), render: riskBadge },
      ],
      inspector,
    });
    return odPage(text('\u041c\u0430\u0441\u0442\u0435\u0440-\u0440\u0435\u0435\u0441\u0442\u0440 \u043c\u043e\u0434\u0435\u043b\u0435\u0439 \u0438 SKU', 'Style and SKU master'), header, content);
  }
  const previousRenderView = renderView;
  renderView = function renderStyleView() { return state.view === 'styles' ? renderStyles() : previousRenderView(); };
  const previousViewTitle = viewTitle;
  viewTitle = function styleViewTitle(view) { return view === 'styles' ? text('\u041c\u043e\u0434\u0435\u043b\u0438 / SKU', 'Styles / SKU') : previousViewTitle(view); };
  const previousViewSectionName = viewSectionName;
  viewSectionName = function styleSection(view) { return view === 'styles' ? 'PLM / Product' : previousViewSectionName(view); };
})();