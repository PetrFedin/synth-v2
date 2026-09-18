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
  // The desks that answer for a style. A register in this industry is read by asking "which of these
  // are mine", so every role is a column of its own and therefore filterable like any other.
  const ROLE_LABELS = [
    ['buyer', 'Байер', 'Buyer'],
    ['product_manager', 'Продуктовый менеджер', 'Product manager'],
    ['fabric_manager', 'Менеджер по тканям', 'Fabric manager'],
    ['technologist', 'Технолог', 'Technologist'],
    ['designer', 'Дизайнер', 'Designer'],
  ];
  function people(product, role) {
    const list = product?.responsibilities?.[role];
    if (!Array.isArray(list) || !list.length) return '';
    return list.map((person) => person.displayName || person.email || person.userId).join(', ');
  }

  // Every governed attribute the style carries, labelled by the catalogue rather than by a hardcoded
  // list here, so a card can show an attribute nobody thought to write a label for.
  // The lifecycle comes from the server so this screen offers exactly the steps the domain allows and
  // cannot drift from them. It is the same for every style, so it is fetched once.
  const lifecycle = { statuses: [], transitions: null, loading: false, error: '' };
  // The main line of development, in order. The remaining states (on hold, rejected, superseded) are
  // exits from it rather than steps along it, so they are shown as where the style is, not as a rail.
  const LIFECYCLE_MAIN_LINE = [
    'draft', 'in_development', 'sample_review', 'technically_approved', 'sourcing_approved',
    'purchase_or_production_ready', 'compliance_ready', 'commercial_ready', 'active',
  ];
  function ensureLifecycle() {
    if (lifecycle.transitions || lifecycle.loading) return;
    lifecycle.loading = true;
    api('/v2/product/lifecycle')
      .then((result) => { lifecycle.statuses = result.statuses || []; lifecycle.transitions = result.transitions || {}; })
      .catch((error) => { lifecycle.error = error?.message || ''; })
      .finally(() => { lifecycle.loading = false; renderApp(); });
  }
  function lifecycleRail(product) {
    const rail = el('div', { className: 'od-lifecycle-rail' });
    const currentIndex = LIFECYCLE_MAIN_LINE.indexOf(product.lifecycleStatus);
    LIFECYCLE_MAIN_LINE.forEach((status, index) => {
      const step = el('span', {
        className: `od-lifecycle-step${index === currentIndex ? ' current' : ''}${currentIndex >= 0 && index < currentIndex ? ' passed' : ''}`,
        rawText: statusLabel(status),
      });
      step.title = statusLabel(status);
      rail.append(step);
    });
    return rail;
  }
  function transitionButtons(item) {
    const product = item.product;
    const next = lifecycle.transitions?.[product.lifecycleStatus] || [];
    if (!lifecycle.transitions) return [notice(text('Загрузка жизненного цикла…', 'Loading the lifecycle…'))];
    if (!next.length) {
      return [notice(text(
        `Состояние «${statusLabel(product.lifecycleStatus)}» конечное: дальше модель не переводится.`,
        `"${statusLabel(product.lifecycleStatus)}" is a final state: the style goes no further.`,
      ))];
    }
    const row = el('div', { className: 'od-lifecycle-actions' });
    next.forEach((status) => {
      const button = el('button', { className: 'button small', type: 'button', rawText: statusLabel(status) });
      button.addEventListener('click', () => runAction(async () => {
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/transition`, {
          expectedVersion: product.styleHeadVersion,
          nextStatus: status,
        });
        await reload();
        renderApp();
        toast(text(`Модель переведена в «${statusLabel(status)}».`, `The style moved to "${statusLabel(status)}".`), 'success');
      }, button));
      row.append(button);
    });
    return [row];
  }

  function dimensionLabel(product) {
    return (I18N.getLocale?.() === 'en' ? product.categoryNameEn : product.categoryNameRu) || product.categoryCode || '—';
  }
  function attributeValue(item) {
    const named = I18N.getLocale?.() === 'en' ? item.nameEn : item.nameRu;
    if (named) return named;
    // A boolean false is an answer, not a missing value: showing it as a dash said "not filled in"
    // about a field that said "no".
    if (typeof item.value === 'boolean') return item.value ? text('Да', 'Yes') : text('Нет', 'No');
    if (Array.isArray(item.value)) return item.value.length ? item.value.join(', ') : '—';
    if (item.value === null || item.value === undefined || item.value === '') return '—';
    return String(item.value);
  }
  function categoryAttributes(product) {
    const values = product?.dimensions || {};
    return Object.entries(values).map(([code, item]) => ({
      code,
      label: (I18N.getLocale?.() === 'en' ? item.labelEn : item.labelRu) || code,
      value: attributeValue(item),
    })).sort((left, right) => left.label.localeCompare(right.label));
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
          label: text('Состояние', 'State'),
          fields: [
            { label: text('Текущее состояние', 'Current state'), value: statusLabel(product.lifecycleStatus) },
            { label: text('Версия карточки', 'Card version'), value: product.styleHeadVersion ?? '—' },
          ],
          content: [lifecycleRail(product), ...transitionButtons(item)],
        },
        {
          label: text('Атрибуты категории', 'Category attributes'),
          fields: categoryAttributes(product).length
            ? categoryAttributes(product).map((item) => ({ label: item.label, value: item.value }))
            : [],
          content: [
            product.categoryAttributeExpected
              ? notice(text(
                `Заполнено ${categoryAttributes(product).length} из ${product.categoryAttributeExpected} полей, которые предполагает категория «${dimensionLabel(product)}».`,
                `${categoryAttributes(product).length} of ${product.categoryAttributeExpected} fields expected by the ${dimensionLabel(product)} category are filled.`,
              ), categoryAttributes(product).length ? 'success' : 'warning')
              : notice(text('У модели не выбрана категория, поэтому набор полей ещё не определён.', 'This style has no category yet, so the field set is not decided.'), 'warning'),
          ],
        },
        {
          label: text('Команда', 'Team'),
          fields: ROLE_LABELS.map(([role, ru, en]) => ({ label: text(ru, en), value: people(product, role) || '—' })),
          content: [
            Object.keys(product.responsibilities || {}).length
              ? null
              : notice(text('Ответственные не назначены. Пока стол пуст, вопрос по модели некому адресовать.', 'No desks are assigned yet. While a desk is empty there is nobody to address a question about this style to.'), 'warning'),
          ],
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
    ensureLifecycle();
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
        { key: 'placeholder', label: text('Плейсхолдер', 'Placeholder'), value: (item) => item.product.placeholderCode || '—', title: (item) => item.product.placeholderNameRu || '' },
        { key: 'buyer', label: text('Байер', 'Buyer'), value: (item) => people(item.product, 'buyer') || '—' },
        { key: 'productManager', label: text('Продуктовый менеджер', 'Product manager'), value: (item) => people(item.product, 'product_manager') || '—' },
        { key: 'fabricManager', label: text('Менеджер по тканям', 'Fabric manager'), value: (item) => people(item.product, 'fabric_manager') || '—' },
        { key: 'technologist', label: text('Технолог', 'Technologist'), value: (item) => people(item.product, 'technologist') || '—' },
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
