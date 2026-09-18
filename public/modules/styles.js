(function installStyleMasterV6() {
  'use strict';

  const core = window.SynthaStylesCore;
  if (!core) throw new Error('SynthaStylesCore must load before styles.js');
  const nav = OD_V5_GROUPS.flatMap((group) => group.items).find((item) => item.en === 'Styles and colourways' || item.en === 'Styles / SKU');
  if (nav) { nav.view = 'styles'; nav.ru = 'Модели'; nav.en = 'Product Master'; nav.planned = false; }

  function text(ru, en) { return localText(ru, en); }
  function title(product) { return I18N.getLocale?.() === 'en' ? (product.titleEn || product.titleRu || product.styleCode) : (product.titleRu || product.titleEn || product.styleCode); }
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
    node.append(bar, el('strong', { rawText: item.product.readinessSnapshotId ? `${item.readinessPercent}%` : '—' }));
    return node;
  }

  function readinessBadge(item) {
    if (!item.product.readinessSnapshotId) return statusBadge('not_assessed');
    return statusBadge(item.product.readinessStatus);
  }

  // Governed product dimensions. They are written as MDM-referenced attribute values on the style
  // version and projected by product_master_workspace with both names resolved, so the section reads
  // them without knowing anything about the dictionary they came from.
  function dimension(product, attributeCode) {
    const value = product?.dimensions?.[attributeCode];
    if (!value) return '';
    const name = I18N.getLocale?.() === 'en' ? value.nameEn : value.nameRu;
    return name || value.code || '';
  }
  function gender(product) {
    const name = I18N.getLocale?.() === 'en' ? product.genderNameEn : product.genderNameRu;
    return name || product.genderCode || '';
  }

  function projectionBadge(item) {
    return item.projected ? statusBadge('published') : statusBadge('not_published');
  }

  function inspector(item) {
    const product = item.product;
    const risks = item.risks.length
      ? odMiniTable([text('Проверка', 'Gate'), text('Уровень', 'Severity')], item.risks.map((risk) => [riskLabel(risk.code), statusBadge(risk.severity)]))
      : notice(text('Цепочка Product Master → Readiness → Commercial Projection замкнута.', 'Product Master → Readiness → Commercial Projection chain is complete.'), 'success');
    return odInspector({
      title: title(product),
      subtitle: `${product.styleCode} · v${product.styleVersionNo || '—'}`,
      status: product.lifecycleStatus,
      preview: true,
      tabs: [
        {
          label: text('Продукт', 'Product'),
          fields: [
            { label: text('Артикул', 'Style code'), value: product.styleCode || '—' },
            { label: text('Идентификатор', 'Identifier'), value: shortId(product.id), title: product.id },
            { label: text('Версия', 'Version'), value: product.styleVersionNo ? `v${product.styleVersionNo}` : '—', title: product.styleVersionId || '' },
            { label: text('Цветовые решения', 'Colorways'), value: item.colorwayCount },
            { label: text('Товарные SKU', 'Product SKU'), value: item.productSkuCount },
            { label: text('Пол', 'Gender'), value: gender(product) || '—' },
            { label: text('Возрастная группа', 'Age group'), value: dimension(product, 'common.age_group') || '—' },
            { label: text('Посадка', 'Fit'), value: dimension(product, 'apparel.fit') || '—' },
            { label: text('Новизна', 'Novelty'), value: dimension(product, 'common.novelty') || '—' },
            { label: text('Сезон', 'Season'), value: dimension(product, 'common.operating_season') || '—' },
          ],
        },
        {
          label: text('Готовность', 'Readiness'),
          fields: [
            { label: text('Оценка готовности', 'Readiness'), value: product.readinessSnapshotId ? `${statusLabel(product.readinessStatus)} · ${item.readinessPercent}%` : text('Не оценён', 'Not assessed') },
            { label: text('Связка с каталогом', 'Catalogue link'), value: `${item.legacyCatalogLinkCount}/${item.productSkuCount}` },
          ],
          content: [risks],
        },
        {
          label: text('Коммерция', 'Commercial'),
          fields: [
            { label: text('Коммерческая проекция', 'Commercial projection'), value: product.commercialProjectionId ? `v${product.commercialProjectionVersionNo} · ${statusLabel(product.commercialProjectionStatus)}` : text('Не опубликована', 'Not published') },
          ],
        },
      ],
      actions: [],
    });
  }

  function renderStyles() {
    const registry = core.buildRegistry(state.workspace);
    const header = odHeader('styles', [
      { id: 'registry', label: text('Реестр моделей', 'Product Master') },
      { id: 'readiness', label: text('Готовность', 'Readiness') },
      { id: 'publication', label: text('Коммерческая проекция', 'Commercial projection') },
      { id: 'exceptions', label: text('Исключения', 'Exceptions') },
    ], [
      { label: text('Модели', 'Styles'), value: registry.summary.total, detail: `${registry.summary.productSkus} ${text('товарных SKU', 'product SKU')}` },
      { label: text('Готовы', 'Ready'), value: registry.summary.ready, detail: `${registry.summary.averageReadiness}% ${text('средняя готовность', 'average readiness')}` },
      { label: text('Проекции', 'Projected'), value: registry.summary.projected, detail: text('опубликованы неизменяемо', 'immutable published') },
      { label: text('Заблокированы', 'Blocked'), value: registry.summary.blocked, detail: `${registry.summary.notAssessed} ${text('не оценено', 'not assessed')}` },
      { label: text('Связка с каталогом', 'Catalogue bridge'), value: registry.summary.bridgeIncomplete, detail: text('неполные связи legacy SKU', 'incomplete legacy SKU links') },
    ], [], text('Поиск модели или версии', 'Search style or version'), null);

    let rows = registry.styles;
    if (header.active === 'readiness') rows = rows.filter((item) => item.product.readinessStatus !== 'ready');
    if (header.active === 'publication') rows = rows.filter((item) => item.readinessReady && !item.projected);
    if (header.active === 'exceptions') rows = rows.filter((item) => item.risks.length);

    const content = odRegistry({
      scope: 'od-styles', filterScope: 'styles', rows, rowKey: (item) => item.product.id,
      statusAccessor: (item) => item.product.lifecycleStatus,
      columns: [
        { key: 'styleCode', label: text('Код модели', 'Style code'), value: (item) => item.product.styleCode },
        { key: 'title', label: text('Название', 'Title'), value: (item) => title(item.product) },
        { key: 'version', label: text('Версия', 'Version'), value: (item) => `v${item.product.styleVersionNo || '—'}` },
        { key: 'lifecycle', label: text('Статус', 'Lifecycle'), render: (item) => statusBadge(item.product.lifecycleStatus) },
        { key: 'fit', label: text('Посадка', 'Fit'), value: (item) => dimension(item.product, 'apparel.fit') || '—' },
        { key: 'novelty', label: text('Новизна', 'Novelty'), value: (item) => dimension(item.product, 'common.novelty') || '—' },
        { key: 'gender', label: text('Пол', 'Gender'), value: (item) => gender(item.product) || '—' },
        { key: 'ageGroup', label: text('Возрастная группа', 'Age group'), value: (item) => dimension(item.product, 'common.age_group') || '—' },
        { key: 'season', label: text('Сезон', 'Season'), value: (item) => dimension(item.product, 'common.operating_season') || '—' },
        { key: 'colorways', label: text('Цвета', 'Colorways'), value: (item) => item.colorwayCount },
        { key: 'productSkus', label: text('Товарные SKU', 'Product SKU'), value: (item) => item.productSkuCount },
        { key: 'readiness', label: text('Готовность', 'Readiness'), render: readiness },
        { key: 'gate', label: text('Проверка', 'Gate'), render: readinessBadge },
        { key: 'projection', label: text('Проекция', 'Projection'), render: projectionBadge },
      ],
      inspector,
    });
    return odPage(text('Канонический Product Master', 'Canonical Product Master'), header, content);
  }

  const previousRenderView = renderView;
  renderView = function renderStyleView() { return state.view === 'styles' ? renderStyles() : previousRenderView(); };
})();
