(function installLinesheetsWorkspace(global) {
  'use strict';

  const Matrix = global.SynthaLinesheetMatrix;
  if (!Matrix) throw new Error('LINESHEET_MATRIX_CORE_REQUIRED: Buyer order matrix core must load before linesheets');

  const LS = global.SynthaLinesheets || (global.SynthaLinesheets = {});
  const defaults = {
    mode: '',
    collectionId: '', selectedId: '', query: '', items: [], nextCursor: null,
    loadedCollectionId: '', loading: false, loadingMore: false, error: '', requestToken: 0,
    buyerAccessKey: '', cycleId: '', buyerCatalog: null, matrices: [], buyerLoadedKey: '', buyerLoading: false, buyerError: '', buyerRequestToken: 0,
    selectedStyleId: '', quantities: {}, quantityCatalogId: '', quantitySelectionId: '', dirty: false,
  };
  for (const [key, fallback] of Object.entries(defaults)) if (LS[key] === undefined) LS[key] = structuredClone(fallback);

  function text(ru, en) { return localText(ru, en); }
  function list(input) { return Array.isArray(input) ? input : []; }
  function value(input) { return String(input ?? '').trim(); }
  function workspace() { return state.workspace || {}; }
  function collections() { return list(workspace().collections); }
  function collectionById(id) { return collections().find(item => item.id === id); }
  function showroomById(id) { return list(workspace().showrooms).find(item => item.id === id); }
  function organisationById(id) { return list(workspace().organisations).find(item => item.id === id); }
  function collectionName(collection) { return value(collection?.name || collection?.title || collection?.code || collection?.id) || text('Коллекция', 'Collection'); }
  function organisationName(id) { const item = organisationById(id); return value(item?.name || item?.legalName || item?.id || id) || '—'; }
  function showroomName(id) { const item = showroomById(id); return value(item?.name || item?.id || id) || '—'; }

  function formatDate(raw) {
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(I18N.getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  }

  function formatMoney(amount, currency) {
    const number = Number(amount);
    if (!Number.isFinite(number)) return '—';
    try {
      return new Intl.NumberFormat(I18N.getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
        style: 'currency', currency: value(currency) || 'USD', maximumFractionDigits: 4,
      }).format(number);
    } catch { return `${number.toFixed(2)} ${value(currency)}`.trim(); }
  }

  function shortHash(hash) {
    const normalized = value(hash);
    return normalized ? `${normalized.slice(0, 10)}…${normalized.slice(-6)}` : '—';
  }

  function statePanel(className, title, description, action) {
    const panel = el('section', { className: `ls9-state ${className}`.trim(), 'data-od14-component': className.includes('error') ? 'alert' : 'empty' });
    panel.append(el('h3', { rawText: title }), el('p', { rawText: description }));
    if (action) panel.append(action);
    return panel;
  }

  function modeTabs(hasBuyerAccess) {
    const tabs = el('div', { className: 'ls9-tabs', 'data-od14-component': 'tabs', ariaLabel: text('Режим листов коллекций', 'Linesheet mode') });
    if (hasBuyerAccess) tabs.append(modeButton('buyer', text('Каталог покупателя', 'Buyer catalog')));
    tabs.append(modeButton('registry', text('Реестр публикаций', 'Publication registry')));
    return tabs;
  }

  function modeButton(mode, label) {
    const active = LS.mode === mode;
    const button = el('button', { className: `ls9-tab ${active ? 'active' : ''}`.trim(), type: 'button', rawText: label, ariaPressed: active, 'data-od14-component': 'tab', 'data-od14-active': active });
    button.addEventListener('click', () => {
      if (LS.mode === mode) return;
      LS.mode = mode;
      renderApp();
    });
    return button;
  }

  function ensureMode() {
    const buyer = buyerAccesses();
    if (!LS.mode || (LS.mode === 'buyer' && buyer.length === 0)) LS.mode = buyer.length ? 'buyer' : 'registry';
    return buyer;
  }

  function buyerAccesses() {
    const caps = global.SynthaUiCapabilities;
    const shopIds = new Set(caps?.organisationIds?.(workspace(), caps.CAPABILITIES.DEAL_READ, 'shop') || []);
    const showrooms = new Map(list(workspace().showrooms).map(item => [item.id, item]));
    return list(workspace().invitations)
      .filter(invitation => invitation?.status === 'accepted' && shopIds.has(invitation.shopId) && showrooms.has(invitation.showroomId))
      .map(invitation => {
        const showroom = showrooms.get(invitation.showroomId);
        return Object.freeze({
          key: `${showroom.id}::${invitation.shopId}`,
          invitationId: invitation.id,
          showroomId: showroom.id,
          showroomStatus: showroom.status,
          shopId: invitation.shopId,
          brandId: showroom.brandId || invitation.brandId,
          collectionId: showroom.collectionId,
        });
      })
      .sort((left, right) => buyerAccessLabel(left).localeCompare(buyerAccessLabel(right)) || left.key.localeCompare(right.key));
  }

  function buyerAccessLabel(access) {
    return `${collectionName(collectionById(access.collectionId))} · ${showroomName(access.showroomId)} · ${organisationName(access.shopId)}`;
  }

  function cyclesForAccess(access) {
    const selectionByCycle = new Map(list(workspace().selections).filter(item => item.showroomId === access.showroomId).map(item => [item.cycleId, item]));
    const rank = cycle => {
      const selection = selectionByCycle.get(cycle.id);
      if (selection?.status === 'draft') return 0;
      if (cycle.stage === 'showroom') return 1;
      if (cycle.stage === 'selection') return 2;
      if (selection) return 3;
      return 4;
    };
    return list(workspace().cycles)
      .filter(cycle => cycle.brandId === access.brandId && cycle.shopId === access.shopId && cycle.collectionId === access.collectionId)
      .sort((left, right) => rank(left) - rank(right) || value(left.id).localeCompare(value(right.id)));
  }

  function currentBuyerContext() {
    const accesses = buyerAccesses();
    if (!accesses.length) return Object.freeze({ accesses, access: null, cycles: [], cycle: null, selection: null });
    if (!LS.buyerAccessKey || !accesses.some(item => item.key === LS.buyerAccessKey)) LS.buyerAccessKey = accesses[0].key;
    const access = accesses.find(item => item.key === LS.buyerAccessKey) || accesses[0];
    const cycles = cyclesForAccess(access);
    if (!LS.cycleId || !cycles.some(item => item.id === LS.cycleId)) LS.cycleId = cycles[0]?.id || '';
    const cycle = cycles.find(item => item.id === LS.cycleId) || null;
    const selection = cycle ? list(workspace().selections).find(item => item.cycleId === cycle.id && item.showroomId === access.showroomId) || null : null;
    return Object.freeze({ accesses, access, cycles, cycle, selection });
  }

  function resetBuyerCatalog({ preserveQuantities = false } = {}) {
    LS.buyerCatalog = null;
    LS.matrices = [];
    LS.buyerLoadedKey = '';
    LS.buyerLoading = false;
    LS.buyerError = '';
    LS.selectedStyleId = '';
    LS.buyerRequestToken += 1;
    if (!preserveQuantities) {
      LS.quantities = {};
      LS.quantityCatalogId = '';
      LS.quantitySelectionId = '';
      LS.dirty = false;
    }
  }

  function buyerCatalogRequest(context) {
    if (!context.access) return null;
    const pinned = value(context.selection?.buyerCatalogVersionId);
    if (pinned) return Object.freeze({
      key: `${context.access.key}|${context.cycle?.id || 'no-cycle'}|pinned:${pinned}`,
      path: `/v2/buyer-catalog-versions/${encodeURIComponent(pinned)}`,
    });
    return Object.freeze({
      key: `${context.access.key}|${context.cycle?.id || 'no-cycle'}|latest`,
      path: `/v2/showrooms/${encodeURIComponent(context.access.showroomId)}/buyer-catalog?shopId=${encodeURIComponent(context.access.shopId)}`,
    });
  }

  function ensureBuyerLoad(context) {
    const request = buyerCatalogRequest(context);
    if (!request || LS.buyerLoading || LS.buyerLoadedKey === request.key) return;
    void loadBuyerCatalog(context, request);
  }

  async function loadBuyerCatalog(context, request = buyerCatalogRequest(context)) {
    if (!request || LS.buyerLoading) return;
    const requestToken = ++LS.buyerRequestToken;
    LS.buyerLoading = true;
    LS.buyerError = '';
    try {
      const catalog = await api(request.path);
      if (requestToken !== LS.buyerRequestToken || buyerCatalogRequest(currentBuyerContext())?.key !== request.key) return;
      if (!Matrix.isRichBuyerCatalog(catalog)) throw uiError('BUYER_CATALOG_RICH_REQUIRED', text('Опубликованная версия каталога не содержит иерархию Style → Colorway → Size → SKU.', 'Published buyer catalog does not contain the Style → Colorway → Size → SKU hierarchy.'));
      const matrices = Matrix.buildStyleMatrices(catalog);
      if (!matrices.length) throw uiError('BUYER_CATALOG_EMPTY', text('В каталоге покупателя нет доступных моделей.', 'Buyer catalog contains no available styles.'));
      LS.buyerCatalog = catalog;
      LS.matrices = matrices;
      LS.buyerLoadedKey = request.key;
      if (!LS.selectedStyleId || !matrices.some(style => style.styleId === LS.selectedStyleId)) LS.selectedStyleId = matrices[0].styleId;
      synchronizeQuantities(context.selection, catalog, matrices);
    } catch (error) {
      if (requestToken !== LS.buyerRequestToken) return;
      LS.buyerCatalog = null;
      LS.matrices = [];
      LS.buyerLoadedKey = request.key;
      LS.buyerError = buyerLoadMessage(error);
    } finally {
      if (requestToken === LS.buyerRequestToken) {
        LS.buyerLoading = false;
        if (state.view === 'linesheets') renderApp();
      }
    }
  }

  function synchronizeQuantities(selection, catalog, matrices) {
    const selectionId = value(selection?.id);
    if (LS.quantityCatalogId === catalog.id && LS.quantitySelectionId === selectionId) return;
    const next = {};
    if (selection && selection.buyerCatalogVersionId === catalog.id) {
      const cells = Matrix.matrixCellsBySku(matrices);
      for (const line of list(selection.lines)) {
        if (!cells.has(line.sku)) throw uiError('SELECTION_MATRIX_LINEAGE_MISMATCH', text(`SKU ${line.sku} из подборки отсутствует в зафиксированном каталоге покупателя.`, `Selection SKU ${line.sku} is missing from its pinned buyer catalog.`));
        next[line.sku] = String(line.quantity);
      }
    }
    LS.quantities = next;
    LS.quantityCatalogId = catalog.id;
    LS.quantitySelectionId = selectionId;
    LS.dirty = false;
  }

  function buyerLoadMessage(error) {
    if (error?.code === 'BUYER_CATALOG_NOT_FOUND' || error?.status === 404) return text('Для этого шоурума ещё не опубликован каталог покупателя.', 'No buyer catalog has been published for this showroom yet.');
    if (error?.code === 'SHOWROOM_ACCESS_EXPIRED' || error?.code === 'SHOWROOM_ACCESS_NOT_ACCEPTED') return text('Доступ к шоуруму больше не активен.', 'Showroom access is no longer active.');
    return value(error?.message) || text('Не удалось загрузить каталог покупателя.', 'Could not load buyer catalog.');
  }

  function uiError(code, message) { const error = new Error(`${code}: ${message}`); error.code = code; return error; }

  function canWriteSelection(context) {
    const caps = global.SynthaUiCapabilities;
    return Boolean(context.access && caps?.hasForOrganisation?.(workspace(), context.access.shopId, caps.CAPABILITIES.SELECTION_WRITE));
  }

  function canCreateSelection(context) {
    return canWriteSelection(context) && !context.selection && context.cycle?.stage === 'showroom' && context.access?.showroomStatus === 'open' && Boolean(LS.buyerCatalog);
  }

  function canEditMatrix(context) {
    return canWriteSelection(context)
      && context.selection?.status === 'draft'
      && context.selection?.buyerCatalogVersionId === LS.buyerCatalog?.id
      && context.selection?.commercialBasisHash === LS.buyerCatalog?.contentHash;
  }

  function buyerToolbar(context) {
    const bar = el('section', { className: 'toolbar', 'data-od14-component': 'toolbar' });
    bar.append(selectField(text('Доступ покупателя', 'Buyer access'), context.accesses, context.access?.key || '', buyerAccessLabel, next => {
      LS.buyerAccessKey = next;
      LS.cycleId = '';
      resetBuyerCatalog();
      renderApp();
    }));
    bar.append(selectField(text('Коммерческий цикл', 'Commercial cycle'), context.cycles, context.cycle?.id || '', cycle => `${value(cycle.id)} · ${stageText(cycle.stage)}`, next => {
      LS.cycleId = next;
      resetBuyerCatalog();
      renderApp();
    }, text('Цикл не найден', 'No cycle')));

    const refresh = el('button', { className: 'button', type: 'button', rawText: text('Обновить каталог', 'Refresh catalog') });
    refresh.addEventListener('click', () => { resetBuyerCatalog({ preserveQuantities: false }); renderApp(); });
    bar.append(refresh);
    return bar;
  }

  function selectField(labelText, items, selected, formatter, onChange, emptyLabel = text('Нет доступных значений', 'No available values')) {
    const label = el('label', { className: 'ls9-field', 'data-od14-component': 'field-group' });
    label.append(el('span', { className: 'ls9-field-label', rawText: labelText }));
    const select = el('select', { className: 'ls9-select', ariaLabel: labelText, 'data-od14-component': 'field' });
    if (!items.length) {
      select.append(el('option', { value: '', rawText: emptyLabel }));
      select.disabled = true;
    } else {
      items.forEach(item => {
        const optionValue = item.key || item.id;
        const option = el('option', { value: optionValue, rawText: formatter(item) });
        if (optionValue === selected) option.selected = true;
        select.append(option);
      });
    }
    select.addEventListener('change', () => onChange(select.value));
    label.append(select);
    return label;
  }

  function stageText(stage) {
    const labels = {
      showroom: ["Шоурум", 'Showroom'], selection: ['Подборка', 'Selection'], 'order-builder': ['Сборка заказа', 'Order builder'],
      order: ['Заказ', 'Order'], confirmation: ['Подтверждение', 'Confirmation'], 'deal-space': ['DealSpace', 'DealSpace'], collection: ['Коллекция', 'Collection'],
    };
    const pair = labels[stage];
    return pair ? text(pair[0], pair[1]) : value(stage) || '—';
  }

  function buyerMetrics(context) {
    const matrices = list(LS.matrices);
    const skuCount = matrices.reduce((sum, style) => sum + style.rows.reduce((rowSum, row) => rowSum + Object.keys(row.cells).length, 0), 0);
    const selectionStatus = context.selection ? selectionStatusText(context.selection.status) : text('Не создана', 'Not created');
    const strip = el('section', { className: 'ls9-metrics', 'data-od14-component': 'metrics', ariaLabel: text('Сводка каталога покупателя', 'Buyer catalog summary') });
    [
      [text('Модели', 'Styles'), matrices.length],
      [text('SKU', 'SKUs'), skuCount],
      [text('Валюта', 'Currency'), value(LS.buyerCatalog?.currency) || '—'],
      [text('Подборка', 'Selection'), selectionStatus],
    ].forEach(([label, metric]) => {
      const card = el('div', { className: 'ls9-metric', 'data-od14-component': 'metric' });
      card.append(el('span', { className: 'ls9-metric-label', rawText: label }), el('strong', { rawText: String(metric) }));
      strip.append(card);
    });
    return strip;
  }

  function selectionStatusText(status) {
    if (status === 'draft') return text('Черновик', 'Draft');
    if (status === 'submitted') return text('Отправлена', 'Submitted');
    return value(status) || '—';
  }

  function buyerContent(context) {
    if (!context.accesses.length) return statePanel('ls9-empty', text('Нет активного доступа покупателя', 'No buyer access'), text('Примите приглашение в шоурум, чтобы открыть зафиксированный каталог покупателя.', 'Accept a showroom invitation to open the pinned buyer catalog.'));
    if (LS.buyerLoading && !LS.buyerCatalog) return statePanel('ls9-loading', text('Загрузка каталога покупателя…', 'Loading buyer catalog...'), text('Читаем опубликованную BuyerCatalogVersion без обращения к изменяемому Product Master.', 'Reading the published BuyerCatalogVersion without consulting mutable Product Master data.'));
    if (LS.buyerError && !LS.buyerCatalog) {
      const retry = el('button', { className: 'button', type: 'button', rawText: text('Повторить', 'Retry') });
      retry.addEventListener('click', () => { LS.buyerLoadedKey = ''; LS.buyerError = ''; renderApp(); });
      return statePanel('ls9-error', text('Каталог покупателя недоступен', 'Buyer catalog unavailable'), LS.buyerError, retry);
    }
    if (!LS.buyerCatalog) return statePanel('ls9-empty', text('Каталог покупателя не загружен', 'Buyer catalog not loaded'), text('Выберите доступ и коммерческий цикл.', 'Select buyer access and a commercial cycle.'));

    const wrapper = el('div', { className: 'stack' });
    if (!context.cycle) wrapper.append(noticePanel(text('Матрица доступна для просмотра, но подборку нельзя создать без коммерческого цикла этой коллекции.', 'The matrix is available for viewing, but a selection cannot be created without a commercial cycle for this collection.')));
    if (context.selection && !context.selection.buyerCatalogVersionId) wrapper.append(noticePanel(text('Текущая подборка создана по legacy-каталогу. Она доступна только для просмотра в новом rich-каталоге и не может быть перепривязана молча.', 'The current selection was created from a legacy catalog. It is read-only in the new rich catalog and cannot be silently rebound.'), 'warning'));
    if (LS.buyerError) wrapper.append(noticePanel(LS.buyerError, 'warning'));
    wrapper.append(buyerCatalogIdentity(context), styleTabs(), styleWorkspace(context));
    return wrapper;
  }

  function noticePanel(message, tone = 'info') {
    const panel = el('div', { className: `notice ${tone}`.trim(), 'data-od14-component': 'alert', rawText: message });
    return panel;
  }

  function buyerCatalogIdentity(context) {
    const card = el('section', { className: 'card', 'data-od14-component': 'card' });
    card.append(el('h3', { rawText: text('Зафиксированный коммерческий контекст', 'Pinned commercial context') }));
    const info = el('dl', { className: 'ls9-info-grid', 'data-od14-component': 'definition-grid' });
    const values = [
      [text('BuyerCatalogVersion', 'BuyerCatalogVersion'), value(LS.buyerCatalog.id) || '—'],
      [text('Публикация', 'Publication'), value(LS.buyerCatalog.publicationId) || '—'],
      [text('Прайс-лист', 'Price list'), value(LS.buyerCatalog.priceListVersionId) || '—'],
      [text('Шоурум', 'Showroom'), showroomName(context.access.showroomId)],
      [text('Магазин', 'Shop'), organisationName(context.access.shopId)],
      [text('Контрольная сумма', 'Checksum'), shortHash(LS.buyerCatalog.contentHash)],
    ];
    values.forEach(([label, content]) => {
      const item = el('div', { className: 'ls9-info-item', 'data-od14-component': 'definition-item' });
      item.append(el('dt', { rawText: label }), el('dd', { rawText: content }));
      info.append(item);
    });
    card.append(info);
    return card;
  }

  function styleTabs() {
    const tabs = el('div', { className: 'ls9-tabs', 'data-od14-component': 'tabs', ariaLabel: text('Модели каталога покупателя', 'Buyer catalog styles') });
    list(LS.matrices).forEach(style => {
      const active = style.styleId === LS.selectedStyleId;
      const title = localized(style.titleRu, style.titleEn) || style.styleCode;
      const button = el('button', { className: `ls9-tab ${active ? 'active' : ''}`.trim(), type: 'button', rawText: `${style.styleCode} · ${title}`, ariaPressed: active, 'data-od14-component': 'tab', 'data-od14-active': active });
      button.addEventListener('click', () => { LS.selectedStyleId = style.styleId; renderApp(); });
      tabs.append(button);
    });
    return tabs;
  }

  function localized(ru, en) { return I18N.getLocale() === 'en' ? value(en || ru) : value(ru || en); }

  function styleWorkspace(context) {
    const style = LS.matrices.find(item => item.styleId === LS.selectedStyleId) || LS.matrices[0];
    if (!style) return statePanel('ls9-empty', text('Модели отсутствуют', 'No styles'), text('Опубликованный каталог не содержит моделей.', 'Published catalog contains no styles.'));
    const layout = el('section', { 'data-od14-component': 'layout' });
    layout.append(styleSummary(style), matrixPanel(style, context));
    return layout;
  }

  function styleSummary(style) {
    const card = el('article', { className: 'card', 'data-od14-component': 'card' });
    card.append(el('span', { className: 'ls9-eyebrow', rawText: text('Модель', 'Style') }), el('h3', { rawText: `${style.styleCode} · ${localized(style.titleRu, style.titleEn) || style.styleId}` }));
    const media = firstMedia(style);
    if (media) card.append(mediaNode(media, `${style.styleCode} ${localized(style.titleRu, style.titleEn)}`));
    const description = localized(style.descriptionRu, style.descriptionEn);
    if (description) card.append(el('p', { rawText: description }));
    const facts = el('dl', { className: 'ls9-info-grid', 'data-od14-component': 'definition-grid' });
    [
      [text('StyleVersion', 'StyleVersion'), style.styleVersionNo == null ? style.styleVersionId : `${style.styleVersionNo} · ${style.styleVersionId}`],
      [text('Состав', 'Composition'), localized(style.compositionRu, style.compositionEn) || '—'],
      [text('Страна происхождения', 'Country of origin'), style.countryOfOrigin || '—'],
      [text('Цветов', 'Colorways'), String(style.rows.length)],
    ].forEach(([label, content]) => {
      const item = el('div', { className: 'ls9-info-item', 'data-od14-component': 'definition-item' });
      item.append(el('dt', { rawText: label }), el('dd', { rawText: content })); facts.append(item);
    });
    card.append(facts);
    return card;
  }

  function firstMedia(style) {
    const direct = list(style.media).find(item => safeMediaUri(item));
    if (direct) return direct;
    for (const row of style.rows) {
      const nested = list(row.media).find(item => safeMediaUri(item));
      if (nested) return nested;
    }
    return null;
  }

  function safeMediaUri(media) {
    const raw = value(media?.uri);
    if (!raw) return '';
    try {
      const parsed = new URL(raw, global.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      return parsed.href;
    } catch { return ''; }
  }

  function mediaNode(media, alt) {
    const uri = safeMediaUri(media);
    if (!uri) return el('div', { className: 'muted', rawText: text('Медиа недоступно', 'Media unavailable') });
    const figure = el('figure', { 'data-od14-component': 'card' });
    const image = el('img', { src: uri, alt: value(alt) || text('Изображение модели', 'Style image'), loading: 'lazy', decoding: 'async', width: '220' });
    figure.append(image);
    if (media.mediaRole || media.id) figure.append(el('figcaption', { className: 'muted', rawText: [media.mediaRole, media.id].filter(Boolean).join(' · ') }));
    return figure;
  }

  function matrixPanel(style, context) {
    const surface = el('section', { 'data-od14-component': 'surface' });
    const head = el('div', { 'data-od14-component': 'section-head' });
    const copy = el('div');
    copy.append(el('h3', { rawText: text('Матрица заказа Color × Size', 'Color × Size order matrix') }), el('p', { className: 'muted', rawText: text('Каждая ячейка — точный SKU из неизменяемой BuyerCatalogVersion. Цена и товарная иерархия повторно проверяются сервером.', 'Every cell is an exact SKU from immutable BuyerCatalogVersion. Price and product lineage are revalidated by the server.') }));
    head.append(copy, matrixActions(context));
    surface.append(head, orderMatrixTable(style, context));
    return surface;
  }

  function matrixActions(context) {
    const actions = el('div', { className: 'ls9-actions', 'data-od14-component': 'toolbar' });
    if (canCreateSelection(context)) {
      const create = el('button', { className: 'button primary', type: 'button', rawText: text('Создать подборку', 'Create selection') });
      create.addEventListener('click', () => runAction(() => createBuyerSelection(context), create));
      actions.append(create);
      return actions;
    }
    if (canEditMatrix(context)) {
      const save = el('button', { className: 'button primary', type: 'button', rawText: text('Сохранить матрицу', 'Save matrix') });
      save.disabled = !LS.dirty;
      save.addEventListener('click', () => runAction(() => saveBuyerMatrix(context), save));
      const submit = el('button', { className: 'button', type: 'button', rawText: text('Отправить подборку', 'Submit selection') });
      submit.disabled = LS.dirty || list(context.selection.lines).length === 0;
      submit.addEventListener('click', () => runAction(() => submitBuyerSelection(context), submit));
      actions.append(save, submit);
      return actions;
    }
    const badge = el('span', { className: 'badge', rawText: context.selection ? selectionStatusText(context.selection.status) : text('Только просмотр', 'Read only') });
    actions.append(badge);
    return actions;
  }

  function orderMatrixTable(style, context) {
    const wrap = el('div', { 'data-od14-component': 'table-wrap' });
    const table = el('table', { 'data-od14-component': 'table', ariaLabel: text('Матрица количества по цветам и размерам', 'Color and size quantity matrix') });
    const thead = el('thead');
    const headRow = el('tr');
    headRow.append(el('th', { rawText: text('Цвет', 'Color') }));
    style.sizes.forEach(size => headRow.append(el('th', { rawText: localized(size.labelRu, size.labelEn) || size.code, title: `${size.code} · ${size.id}` })));
    thead.append(headRow);
    const tbody = el('tbody');
    const editable = canEditMatrix(context) || canCreateSelection(context);
    style.rows.forEach(row => {
      const tr = el('tr');
      const color = el('td');
      color.append(colorLabel(row));
      tr.append(color);
      style.sizes.forEach(size => {
        const cell = row.cells[size.key];
        const td = el('td');
        if (!cell) {
          td.append(el('span', { className: 'muted', rawText: '—' }));
        } else {
          td.append(matrixCell(cell, editable));
        }
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }

  function colorLabel(row) {
    const block = el('div');
    const name = localized(row.nameRu, row.nameEn) || row.code;
    const firstLine = el('strong', { rawText: name });
    if (/^#[0-9A-Fa-f]{6}$/.test(row.swatchHex || '')) {
      const swatch = el('span', { rawText: ' ●', ariaLabel: `${text('Цвет', 'Color')} ${row.swatchHex}` });
      swatch.style.color = row.swatchHex;
      firstLine.append(swatch);
    }
    block.append(firstLine, el('small', { rawText: `${row.code} · ${row.id}` }));
    return block;
  }

  function matrixCell(cell, editable) {
    const block = el('div');
    block.append(el('small', { rawText: cell.sku, title: `${cell.productSkuId} · ${cell.sizeValueId}` }));
    const input = el('input', {
      type: 'number', min: String(cell.minimumOrderQuantity), step: '1', value: LS.quantities[cell.sku] ?? '',
      ariaLabel: `${cell.sku} · ${text('Количество', 'Quantity')}`,
      placeholder: String(cell.minimumOrderQuantity),
      'data-sku': cell.sku,
      'data-od14-component': 'field',
    });
    if (cell.availableToSell !== null) input.max = String(cell.availableToSell);
    if (!editable || cell.availableToSell === 0 || (cell.availableToSell !== null && cell.availableToSell < cell.minimumOrderQuantity)) input.disabled = true;
    input.addEventListener('input', () => {
      LS.quantities[cell.sku] = input.value;
      LS.dirty = true;
    });
    block.append(input);
    const availability = cell.availableToSell === null ? text('Доступность: по условиям', 'Availability: per terms') : `${text('ATS', 'ATS')}: ${cell.availableToSell}`;
    block.append(el('small', { rawText: `${formatMoney(cell.unitPrice, cell.currency)} · MOQ ${cell.minimumOrderQuantity} · ${availability}` }));
    return block;
  }

  async function createBuyerSelection(context) {
    const catalog = LS.buyerCatalog;
    if (!catalog || !context.cycle || !context.access) throw uiError('BUYER_MATRIX_CONTEXT_REQUIRED', text('Не выбран коммерческий контекст.', 'Commercial context is not selected.'));
    const request = Matrix.createSelectionRequest(context.cycle.id, context.access.showroomId);
    const result = await mutate(request.path, request.body, request.method);
    const created = result?.selection;
    if (!created?.id) throw uiError('BUYER_MATRIX_SELECTION_CREATE_FAILED', text('Сервер не вернул созданную подборку.', 'Server did not return the created selection.'));
    if (created.buyerCatalogVersionId !== catalog.id || created.commercialBasisHash !== catalog.contentHash) {
      LS.quantities = {};
      LS.quantityCatalogId = '';
      LS.quantitySelectionId = '';
      LS.dirty = false;
      LS.buyerLoadedKey = '';
      await reload();
      renderApp();
      throw uiError('BUYER_MATRIX_CATALOG_CHANGED', text('Каталог покупателя изменился во время создания подборки. Загружена новая зафиксированная версия — проверьте количества заново.', 'Buyer catalog changed while creating the selection. The newly pinned version is being loaded; review quantities again.'));
    }
    LS.quantityCatalogId = catalog.id;
    LS.quantitySelectionId = created.id;
    await reload();
    LS.buyerLoadedKey = '';
    renderApp();
    toast(text('Подборка создана. Теперь сохраните количества матрицы.', 'Selection created. Save the matrix quantities next.'), 'success');
  }

  async function saveBuyerMatrix(context) {
    const selection = context.selection;
    if (!selection || !LS.buyerCatalog) throw uiError('BUYER_MATRIX_SELECTION_REQUIRED', text('Сначала создайте подборку.', 'Create a selection first.'));
    const request = Matrix.selectionMatrixRequest(selection.id, LS.matrices, LS.quantities);
    const updated = await mutate(request.path, request.body, request.method);
    if (updated?.buyerCatalogVersionId !== LS.buyerCatalog.id || updated?.commercialBasisHash !== LS.buyerCatalog.contentHash) throw uiError('BUYER_MATRIX_CATALOG_CHANGED', text('Сервер вернул подборку с другим коммерческим снимком.', 'Server returned a selection bound to a different commercial snapshot.'));
    LS.quantities = Object.fromEntries(list(updated.lines).map(line => [line.sku, String(line.quantity)]));
    LS.quantityCatalogId = updated.buyerCatalogVersionId;
    LS.quantitySelectionId = updated.id;
    LS.dirty = false;
    await reload();
    renderApp();
    toast(text('Матрица сохранена атомарно.', 'Matrix saved atomically.'), 'success');
  }

  async function submitBuyerSelection(context) {
    if (!context.selection || context.selection.status !== 'draft') return;
    if (LS.dirty) throw uiError('BUYER_MATRIX_UNSAVED_CHANGES', text('Сначала сохраните изменения матрицы.', 'Save matrix changes first.'));
    await mutate(`/v2/selections/${encodeURIComponent(context.selection.id)}/submit`, {});
    await reload();
    LS.buyerLoadedKey = '';
    renderApp();
    toast(text('Подборка отправлена.', 'Selection submitted.'), 'success');
  }

  function resetForCollection(collectionId) {
    LS.collectionId = collectionId; LS.selectedId = ''; LS.items = []; LS.nextCursor = null;
    LS.loadedCollectionId = ''; LS.loading = false; LS.loadingMore = false; LS.error = ''; LS.requestToken += 1;
  }

  async function loadPublications({ append = false } = {}) {
    const collectionId = value(LS.collectionId);
    if (!collectionId || LS.loading || LS.loadingMore) return;
    const requestToken = ++LS.requestToken;
    if (append) LS.loadingMore = true; else LS.loading = true;
    LS.error = '';
    try {
      const cursor = append && LS.nextCursor ? `&cursor=${encodeURIComponent(LS.nextCursor)}` : '';
      const page = await api(`/v2/collections/${encodeURIComponent(collectionId)}/commercial-publications?limit=50${cursor}`);
      if (requestToken !== LS.requestToken || collectionId !== LS.collectionId) return;
      const incoming = list(page?.items);
      LS.items = append ? [...LS.items, ...incoming] : incoming;
      LS.nextCursor = page?.nextCursor || null;
      LS.loadedCollectionId = collectionId;
      if (!LS.selectedId || !LS.items.some(item => item.id === LS.selectedId)) LS.selectedId = LS.items[0]?.id || '';
    } catch (error) {
      if (requestToken !== LS.requestToken || collectionId !== LS.collectionId) return;
      LS.error = value(error?.message) || text('Не удалось загрузить опубликованные листы.', 'Could not load published linesheets.');
      LS.loadedCollectionId = collectionId;
      if (!append) LS.items = [];
    } finally {
      if (requestToken === LS.requestToken) {
        LS.loading = false; LS.loadingMore = false;
        if (state.view === 'linesheets') renderApp();
      }
    }
  }

  function ensureRegistryLoad() {
    const available = collections();
    if (!LS.collectionId && available.length) LS.collectionId = value(available[0].id);
    if (!LS.collectionId || LS.loading || LS.loadedCollectionId === LS.collectionId) return;
    void loadPublications();
  }

  function filteredPublications() {
    const query = value(LS.query).toLocaleLowerCase();
    if (!query) return LS.items;
    return LS.items.filter(publication => [publication.id, publication.currency, publication.contentHash,
      ...list(publication.lines).flatMap(line => [line.sku, line.name])].join(' ').toLocaleLowerCase().includes(query));
  }

  function registryToolbar() {
    const available = collections();
    const bar = el('section', { className: 'ls9-commandbar' });
    const collectionLabel = el('label', { className: 'ls9-field' });
    collectionLabel.append(el('span', { className: 'ls9-field-label', rawText: text('Коллекция', 'Collection') }));
    const select = el('select', { className: 'ls9-select', ariaLabel: text('Выберите коллекцию', 'Select collection') });
    if (!available.length) {
      select.append(el('option', { value: '', rawText: text('Нет доступных коллекций', 'No collections available') }));
      select.disabled = true;
    }
    available.forEach(collection => {
      const option = el('option', { value: value(collection.id), rawText: collectionName(collection) });
      if (value(collection.id) === LS.collectionId) option.selected = true;
      select.append(option);
    });
    select.addEventListener('change', () => { resetForCollection(select.value); renderApp(); });
    collectionLabel.append(select);

    const searchLabel = el('label', { className: 'ls9-search' });
    searchLabel.append(icon('search'));
    const search = el('input', { type: 'search', value: LS.query, placeholder: text('Поиск по публикации, SKU или товару…', 'Search publication, SKU or product...'), ariaLabel: text('Поиск опубликованных листов', 'Search published linesheets') });
    search.addEventListener('input', () => { LS.query = search.value; });
    search.addEventListener('change', () => renderApp());
    search.addEventListener('keydown', event => { if (event.key === 'Enter') renderApp(); });
    searchLabel.append(search);

    const refresh = el('button', { className: 'ls9-filter-button', type: 'button' });
    refresh.append(icon('refresh'), el('span', { rawText: text('Обновить', 'Refresh') }));
    refresh.addEventListener('click', () => { LS.loadedCollectionId = ''; LS.nextCursor = null; LS.selectedId = ''; void loadPublications(); renderApp(); });
    bar.append(collectionLabel, searchLabel, refresh);
    return bar;
  }

  function registryMetrics() {
    const publications = LS.items.length;
    const lines = LS.items.reduce((sum, publication) => sum + list(publication.lines).length, 0);
    const currencies = new Set(LS.items.map(publication => publication.currency).filter(Boolean)).size;
    const strip = el('section', { className: 'ls9-metrics', ariaLabel: text('Сводка опубликованных листов', 'Published linesheet summary') });
    [[text('Публикации', 'Publications'), publications], [text('Строки ассортимента', 'Assortment lines'), lines], [text('Валюты', 'Currencies'), currencies], [text('Режим', 'Mode'), text('Только чтение', 'Read only')]]
      .forEach(([label, metric]) => { const card = el('div', { className: 'ls9-metric' }); card.append(el('span', { className: 'ls9-metric-label', rawText: label }), el('strong', { rawText: String(metric) })); strip.append(card); });
    return strip;
  }

  function publicationTable(publications) {
    const wrap = el('div', { className: 'ls9-table-wrap' });
    const table = el('table', { className: 'ls9-table' });
    const head = el('thead'); const headRow = el('tr');
    [text('Публикация', 'Publication'), text('Статус', 'Status'), text('Опубликовано', 'Published'), text('Валюта', 'Currency'), text('Позиций', 'Lines'), text('Контрольная сумма', 'Checksum')]
      .forEach(label => headRow.append(el('th', { rawText: label })));
    head.append(headRow);
    const body = el('tbody');
    publications.forEach(publication => {
      const row = el('tr', { className: `ls9-row ${LS.selectedId === publication.id ? 'selected' : ''}`.trim(), tabindex: '0' });
      const choose = () => { LS.selectedId = publication.id; renderApp(); };
      row.addEventListener('click', choose);
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
      const status = el('td'); status.append(el('span', { className: 'ls9-status ls9-status-published', rawText: text('Опубликовано', 'Published') }));
      row.append(el('td', { rawText: value(publication.id) || '—' }), status, el('td', { rawText: formatDate(publication.publishedAt) }), el('td', { rawText: value(publication.currency) || '—' }), el('td', { rawText: String(list(publication.lines).length) }), el('td', { rawText: shortHash(publication.contentHash), title: value(publication.contentHash) }));
      body.append(row);
    });
    table.append(head, body); wrap.append(table); return wrap;
  }

  function publicationLineTable(publication) {
    const wrap = el('div', { className: 'ls9-table-wrap ls9-line-table-wrap' });
    const table = el('table', { className: 'ls9-table ls9-line-table' });
    const head = el('thead'); const row = el('tr');
    [text('SKU', 'SKU'), text('Наименование', 'Name'), text('Версия', 'Version'), text('Цена', 'Price'), text('Мин. заказ', 'MOQ')]
      .forEach(label => row.append(el('th', { rawText: label })));
    head.append(row); const body = el('tbody');
    list(publication.lines).forEach(line => { const tr = el('tr'); tr.append(el('td', { rawText: value(line.sku) || '—' }), el('td', { rawText: value(line.name) || '—' }), el('td', { rawText: line.catalogVersion == null ? '—' : String(line.catalogVersion) }), el('td', { rawText: formatMoney(line.unitPrice, line.currency || publication.currency) }), el('td', { rawText: line.minimumOrderQuantity == null ? '—' : String(line.minimumOrderQuantity) })); body.append(tr); });
    table.append(head, body); wrap.append(table); return wrap;
  }

  function registryInspector(publication) {
    const aside = el('aside', { className: 'ls9-inspector' });
    if (!publication) { aside.append(el('div', { className: 'ls9-empty', rawText: text('Выберите опубликованный лист.', 'Select a published linesheet.') })); return aside; }
    const header = el('div', { className: 'ls9-inspector-head' }); const title = el('div');
    title.append(el('span', { className: 'ls9-eyebrow', rawText: text('Неизменяемый коммерческий снимок', 'Immutable commercial snapshot') }), el('h3', { rawText: value(publication.id) || text('Публикация', 'Publication') }));
    header.append(title, el('span', { className: 'ls9-status ls9-status-published', rawText: text('Опубликовано', 'Published') }));
    const info = el('dl', { className: 'ls9-info-grid' });
    [[text('Коллекция', 'Collection'), value(publication.collectionId) || '—'], [text('Валюта', 'Currency'), value(publication.currency) || '—'], [text('Опубликовано', 'Published'), formatDate(publication.publishedAt)], [text('Позиций', 'Lines'), String(list(publication.lines).length)], [text('Контрольная сумма', 'Checksum'), value(publication.contentHash) || '—']]
      .forEach(([label, content]) => { const item = el('div', { className: 'ls9-info-item' }); item.append(el('dt', { rawText: label }), el('dd', { rawText: content })); info.append(item); });
    const sectionTitle = el('div', { className: 'ls9-section-title' }); sectionTitle.append(el('h4', { rawText: text('Опубликованный ассортимент', 'Published assortment') }), el('span', { rawText: text('Только чтение', 'Read only') }));
    const actions = el('div', { className: 'ls9-actions' });
    const printButton = el('button', { className: 'button', type: 'button', rawText: text('Печать', 'Print') }); printButton.addEventListener('click', () => global.print());
    const exportButton = el('button', { className: 'button primary', type: 'button', rawText: text('Экспорт CSV', 'Export CSV') }); exportButton.addEventListener('click', () => exportPublication(publication));
    actions.append(printButton, exportButton); aside.append(header, info, sectionTitle, publicationLineTable(publication), actions); return aside;
  }

  function exportPublication(publication) {
    const headers = ['sku', 'name', 'catalogVersion', 'unitPrice', 'currency', 'minimumOrderQuantity'];
    const escapeCsv = input => `"${String(input ?? '').replaceAll('"', '""')}"`;
    const rows = list(publication.lines).map(line => headers.map(key => escapeCsv(line[key])).join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
    link.download = `${value(publication.id) || 'commercial-publication'}.csv`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function registryContent() {
    if (!collections().length) return statePanel('ls9-empty', text('Нет доступных коллекций', 'No collections available'), text('Сначала создайте или откройте коллекцию. Раздел листов не создаёт демонстрационные коммерческие данные.', 'Create or open a collection first. Linesheets does not create demonstration commercial data.'));
    if (LS.loading && !LS.items.length) return statePanel('ls9-loading', text('Загрузка опубликованных листов…', 'Loading published linesheets...'), text('Получаем неизменяемые коммерческие снимки из серверного реестра.', 'Fetching immutable commercial snapshots from the server registry.'));
    if (LS.error && !LS.items.length) { const retry = el('button', { className: 'button', type: 'button', rawText: text('Повторить', 'Retry') }); retry.addEventListener('click', () => { LS.loadedCollectionId = ''; void loadPublications(); renderApp(); }); return statePanel('ls9-error', text('Не удалось загрузить публикации', 'Could not load publications'), LS.error, retry); }
    if (!LS.items.length) return statePanel('ls9-empty', text('Опубликованных листов пока нет', 'No published linesheets yet'), text('После коммерческой публикации коллекции неизменяемый снимок появится здесь автоматически.', 'After the collection is commercially published, its immutable snapshot will appear here automatically.'));
    const filtered = filteredPublications(); const selected = LS.items.find(item => item.id === LS.selectedId) || LS.items[0] || null;
    const layout = el('section', { className: 'ls9-layout' }); const registry = el('div', { className: 'ls9-registry' }); const registryHead = el('div', { className: 'ls9-section-title' });
    registryHead.append(el('h3', { rawText: text('Реестр публикаций', 'Publication registry') }), el('span', { rawText: `${filtered.length}/${LS.items.length}` })); registry.append(registryHead);
    registry.append(filtered.length ? publicationTable(filtered) : el('div', { className: 'ls9-empty', rawText: text('По вашему запросу ничего не найдено.', 'No publications match your search.') }));
    if (LS.nextCursor) { const loadMore = el('button', { className: 'button ls9-load-more', type: 'button', rawText: LS.loadingMore ? text('Загрузка…', 'Loading...') : text('Загрузить ещё', 'Load more') }); loadMore.disabled = LS.loadingMore; loadMore.addEventListener('click', () => { void loadPublications({ append: true }); renderApp(); }); registry.append(loadMore); }
    if (LS.error) registry.append(el('div', { className: 'ls9-inline-error', rawText: LS.error }));
    layout.append(registry, registryInspector(selected)); return layout;
  }

  function renderLinesheets() {
    const accesses = ensureMode();
    let buyerContext = null;
    if (LS.mode === 'buyer') {
      buyerContext = currentBuyerContext();
      ensureBuyerLoad(buyerContext);
    } else {
      ensureRegistryLoad();
    }

    const page = el('div', { className: 'ls9-view' });
    const header = el('header', { className: 'ls9-header' });
    const copy = el('div');
    copy.append(el('span', { className: 'ls9-eyebrow', rawText: LS.mode === 'buyer' ? text('Wholesale / Buyer Experience', 'Wholesale / Buyer Experience') : text('Коммерческая публикация', 'Commercial Publication') }),
      el('h2', { rawText: text('Листы коллекций', 'Linesheets') }),
      el('p', { rawText: LS.mode === 'buyer'
        ? text('Опубликованный BuyerCatalogVersion превращён в Style → Colorway → Size матрицу заказа без live-чтения PLM и без клиентского управления ценой.', 'Published BuyerCatalogVersion rendered as a Style → Colorway → Size order matrix without live PLM reads or client-controlled pricing.')
        : text('Реестр неизменяемых коммерческих публикаций коллекции. Данные только для чтения и не вычисляются в браузере.', 'Registry of immutable commercial collection publications. Data is read-only and is never derived in the browser.') }));
    header.append(copy, el('div', { className: 'ls9-header-actions' }));
    page.append(header, modeTabs(accesses.length > 0));
    if (LS.mode === 'buyer') {
      page.append(buyerToolbar(buyerContext));
      if (LS.buyerCatalog) page.append(buyerMetrics(buyerContext));
      page.append(buyerContent(buyerContext));
    } else {
      page.append(registryToolbar(), registryMetrics(), registryContent());
    }
    return page;
  }

  const previousRenderView = renderView;
  renderView = function renderViewWithLinesheets() { if (state.view === 'linesheets') return renderLinesheets(); return previousRenderView(); };
  global.SynthaLinesheetsWorkspace = Object.freeze({
    render: renderLinesheets,
    rows: () => LS.mode === 'buyer' ? LS.matrices : LS.items,
    reload: async () => {
      resetBuyerCatalog();
      LS.loadedCollectionId = '';
      if (LS.mode === 'buyer') return loadBuyerCatalog(currentBuyerContext());
      return loadPublications();
    },
  });
})(window);
