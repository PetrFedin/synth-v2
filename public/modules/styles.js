(function installStyleMasterV6() {
  'use strict';

  const core = window.SynthaStylesCore;
  if (!core) throw new Error('SynthaStylesCore must load before styles.js');
  const nav = OD_V5_GROUPS.flatMap((group) => group.items).find((item) => item.en === 'Styles and colourways' || item.en === 'Styles / SKU');
  if (nav) { nav.view = 'styles'; nav.ru = 'Модели'; nav.en = 'Product Master'; nav.planned = false; }

  function text(ru, en) { return localText(ru, en); }
  function title(style) { return I18N.getLocale?.() === 'en' ? (style.titleEn || style.titleRu || style.styleCode) : (style.titleRu || style.titleEn || style.styleCode); }
  function riskLabel(code) {
    const labels = {
      STYLE_VERSION_MISSING: ['Нет канонической версии модели', 'Canonical StyleVersion is missing'],
      COLORWAYS_MISSING: ['Нет цветовых вариантов', 'No Colorways'],
      PRODUCT_SKUS_MISSING: ['Нет канонических Product SKU', 'No canonical Product SKUs'],
      READINESS_NOT_ASSESSED: ['Product Readiness не оценён', 'Product Readiness not assessed'],
      READINESS_BLOCKED: ['Product Readiness заблокирован', 'Product Readiness is blocked'],
      COMMERCIAL_PROJECTION_MISSING: ['Нет Commercial Projection', 'Commercial Projection is missing'],
      LEGACY_BRIDGE_INCOMPLETE: ['Миграционный SKU bridge неполный', 'Legacy SKU migration bridge incomplete'],
    };
    const pair = labels[code] || [code, code];
    return text(pair[0], pair[1]);
  }

  function readiness(item) {
    const node = el('div', { className: 'industrial-readiness', 'data-ods-part': 'progress' });
    const bar = el('progress', { className: 'industrial-readiness-bar' });
    bar.max = 100;
    bar.value = Math.max(0, Math.min(100, item.readinessPercent));
    bar.setAttribute('aria-label', 'Product Readiness');
    node.append(bar, el('strong', { rawText: item.style.readinessSnapshotId ? `${item.readinessPercent}%` : '—' }));
    return node;
  }

  function readinessBadge(item) {
    if (!item.style.readinessSnapshotId) return statusBadge('not_assessed');
    return statusBadge(item.style.readinessStatus);
  }

  function projectionBadge(item) {
    return item.projected ? statusBadge('published') : statusBadge('not_published');
  }

  function inspector(item) {
    const style = item.style;
    const risks = item.risks.length
      ? odMiniTable([text('Проверка', 'Gate'), text('Уровень', 'Severity')], item.risks.map((risk) => [riskLabel(risk.code), statusBadge(risk.severity)]))
      : notice(text('Цепочка Product Master → Readiness → Commercial Projection замкнута.', 'Product Master → Readiness → Commercial Projection chain is complete.'), 'success');
    return odInspector({
      title: title(style),
      subtitle: `${style.styleCode} · v${style.styleVersionNo || '—'}`,
      status: style.lifecycleStatus,
      preview: true,
      tabs: [text('Продукт', 'Product'), text('Готовность', 'Readiness'), text('Коммерция', 'Commercial')],
      fields: [
        { label: 'Style ID', value: style.id },
        { label: 'StyleVersion', value: style.styleVersionId || '—' },
        { label: text('Версия', 'Version'), value: style.styleVersionNo || '—' },
        { label: text('Цвета', 'Colorways'), value: item.colorwayCount },
        { label: 'Product SKU', value: item.productSkuCount },
        { label: 'Product Readiness', value: style.readinessSnapshotId ? `${style.readinessStatus} · ${item.readinessPercent}%` : text('Не оценён', 'Not assessed') },
        { label: 'Commercial Projection', value: style.commercialProjectionId ? `v${style.commercialProjectionVersionNo} · ${style.commercialProjectionStatus}` : text('Не опубликован', 'Not published') },
        { label: 'Legacy SKU bridge', value: `${item.legacyCatalogLinkCount}/${item.productSkuCount}` },
      ],
      content: [risks],
      actions: [],
    });
  }

  function renderStyles() {
    const registry = core.buildRegistry(state.workspace);
    const header = odHeader('styles', [
      { id: 'registry', label: 'Product Master' },
      { id: 'readiness', label: text('Готовность', 'Readiness') },
      { id: 'publication', label: text('Коммерческая проекция', 'Commercial projection') },
      { id: 'exceptions', label: text('Исключения', 'Exceptions') },
    ], [
      { label: text('Модели', 'Styles'), value: registry.summary.total, detail: `${registry.summary.productSkus} Product SKU` },
      { label: text('Готовы', 'Ready'), value: registry.summary.ready, detail: `${registry.summary.averageReadiness}% ${text('средняя готовность', 'average readiness')}` },
      { label: text('Проекции', 'Projected'), value: registry.summary.projected, detail: 'immutable published' },
      { label: text('Заблокированы', 'Blocked'), value: registry.summary.blocked, detail: `${registry.summary.notAssessed} ${text('не оценено', 'not assessed')}` },
      { label: 'Migration bridge', value: registry.summary.bridgeIncomplete, detail: text('неполные связи legacy SKU', 'incomplete legacy SKU links') },
    ], [], text('Поиск модели или StyleVersion', 'Search style or StyleVersion'), null);

    let rows = registry.styles;
    if (header.active === 'readiness') rows = rows.filter((item) => item.style.readinessStatus !== 'ready');
    if (header.active === 'publication') rows = rows.filter((item) => item.readinessReady && !item.projected);
    if (header.active === 'exceptions') rows = rows.filter((item) => item.risks.length);

    const content = odRegistry({
      scope: 'od-styles', filterScope: 'styles', rows, rowKey: (item) => item.style.id,
      statusAccessor: (item) => item.style.lifecycleStatus,
      columns: [
        { label: text('Код модели', 'Style code'), value: (item) => item.style.styleCode },
        { label: text('Название', 'Title'), value: (item) => title(item.style) },
        { label: 'StyleVersion', value: (item) => `v${item.style.styleVersionNo || '—'}` },
        { label: text('Статус', 'Lifecycle'), render: (item) => statusBadge(item.style.lifecycleStatus) },
        { label: text('Цвета', 'Colorways'), value: (item) => item.colorwayCount },
        { label: 'Product SKU', value: (item) => item.productSkuCount },
        { label: 'Readiness', render: readiness },
        { label: 'Gate', render: readinessBadge },
        { label: 'Projection', render: projectionBadge },
      ],
      inspector,
    });
    return odPage(text('Канонический Product Master', 'Canonical Product Master'), header, content);
  }

  const previousRenderView = renderView;
  renderView = function renderStyleView() { return state.view === 'styles' ? renderStyles() : previousRenderView(); };
})();
