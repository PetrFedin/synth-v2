(function installLinesheetsWorkspace(global) {
  'use strict';

  const Matrix = global.SynthaLinesheetMatrix;
  if (!Matrix) throw new Error('LINESHEET_MATRIX_CORE_REQUIRED: Buyer order matrix core must load before linesheets');
  const Grid = global.SynthaOrderGrid;
  if (!Grid) throw new Error('ORDER_GRID_CORE_REQUIRED: Order grid core must load before linesheets');

  const LS = global.SynthaLinesheets || (global.SynthaLinesheets = {});
  const defaults = {
    mode: '',
    collectionId: '', selectedId: '', query: '', items: [], nextCursor: null,
    loadedCollectionId: '', loading: false, loadingMore: false, error: '', requestToken: 0,
    buyerAccessKey: '', cycleId: '', buyerCatalog: null, matrices: [], buyerLoadedKey: '', buyerLoading: false, buyerError: '', buyerRequestToken: 0,
    buyerDoorId: '', buyerDoors: [], buyerDoorShopId: '', buyerDoorLoading: false, buyerDoorError: '', buyerDoorRequestToken: 0,
    selectedStyleId: '', quantities: {}, quantityCatalogId: '', quantitySelectionId: '', dirty: false,
    lastPaste: null, saveState: '', savedAt: '', autosave: true,
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
  function retailDoorLabel(door) {
    if (!door) return '—';
    const identity = [value(door.code), value(door.name)].filter(Boolean).join(' · ') || value(door.id) || '—';
    const city = value(door.shipToAddress?.city);
    return city ? `${identity} · ${city}` : identity;
  }
  function retailDoorAddressLabel(address) {
    if (!address) return '—';
    return [address.countryCode, address.postalCode, address.city, address.region, address.line1, address.line2].map(value).filter(Boolean).join(', ') || '—';
  }
  function pinnedRetailDoor(selection) {
    const snapshot = selection?.buyerCommercialSnapshot;
    if (!selection?.retailDoorId || !snapshot) return null;
    return Object.freeze({
      id: selection.retailDoorId,
      code: snapshot.doorCode,
      name: snapshot.doorName,
      version: selection.retailDoorVersion,
      status: 'pinned',
      shipToAddress: snapshot.shipToAddress,
      billToAddress: snapshot.billToAddress,
    });
  }

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
      // A published price is money, and a buyer reads it as money: two decimals, in their locale.
      return new Intl.NumberFormat(I18N.localeTag(), {
        style: 'currency', currency: value(currency) || 'EUR',
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(number);
    } catch { return `${number.toFixed(2)} ${value(currency)}`.trim(); }
  }

  function shortHash(hash) {
    const normalized = value(hash);
    return normalized ? `${normalized.slice(0, 10)}…${normalized.slice(-6)}` : '—';
  }

  // The buyer's catalogue is the most customer-facing screen in the product, and it was printing
  // raw aggregate keys — "buyer-catalog-version_72842dd6-41a7-4795-95a3-f736d510a1de" — under
  // labels that were class names. These are pinned commercial facts a buyer may genuinely need to
  // quote in an audit, so the value stays reachable: the tail that tells two of them apart is
  // shown, and the whole key is on hover, which is what every other register here already does.
  function shortRef(id) {
    const normalized = value(id);
    if (!normalized) return '—';
    const tail = normalized.includes('_') ? normalized.slice(normalized.lastIndexOf('_') + 1) : normalized;
    const compact = tail.replace(/-/g, '');
    return compact.length >= 8 ? compact.slice(0, 8).toUpperCase() : normalized;
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
    if (!accesses.length) return Object.freeze({ accesses, access: null, cycles: [], cycle: null, selection: null, retailDoors: [], retailDoor: null });
    if (!LS.buyerAccessKey || !accesses.some(item => item.key === LS.buyerAccessKey)) LS.buyerAccessKey = accesses[0].key;
    const access = accesses.find(item => item.key === LS.buyerAccessKey) || accesses[0];
    const cycles = cyclesForAccess(access);
    if (!LS.cycleId || !cycles.some(item => item.id === LS.cycleId)) LS.cycleId = cycles[0]?.id || '';
    const cycle = cycles.find(item => item.id === LS.cycleId) || null;
    const selection = cycle ? list(workspace().selections).find(item => item.cycleId === cycle.id && item.showroomId === access.showroomId) || null : null;
    const retailDoors = LS.buyerDoorShopId === access.shopId ? list(LS.buyerDoors) : [];
    const retailDoor = pinnedRetailDoor(selection) || retailDoors.find(item => item.id === LS.buyerDoorId) || null;
    return Object.freeze({ accesses, access, cycles, cycle, selection, retailDoors, retailDoor });
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

  function resetBuyerDoor() {
    LS.buyerDoorId = '';
    LS.buyerDoors = [];
    LS.buyerDoorShopId = '';
    LS.buyerDoorLoading = false;
    LS.buyerDoorError = '';
    LS.buyerDoorRequestToken += 1;
  }

  function buyerDoorRequest(context) {
    if (!context.access || context.selection?.retailDoorId) return null;
    return Object.freeze({
      key: context.access.shopId,
      path: `/v2/shops/${encodeURIComponent(context.access.shopId)}/doors`,
    });
  }

  function ensureBuyerDoorLoad(context) {
    const request = buyerDoorRequest(context);
    if (!request || LS.buyerDoorLoading || LS.buyerDoorShopId === request.key) return;
    void loadBuyerDoors(context, request);
  }

  async function loadBuyerDoors(context, request = buyerDoorRequest(context)) {
    if (!request || LS.buyerDoorLoading) return;
    const requestToken = ++LS.buyerDoorRequestToken;
    LS.buyerDoorLoading = true;
    LS.buyerDoorError = '';
    try {
      const doors = list(await api(request.path))
        .filter(door => door?.status === 'active')
        .sort((left, right) => retailDoorLabel(left).localeCompare(retailDoorLabel(right)) || value(left.id).localeCompare(value(right.id)));
      if (requestToken !== LS.buyerDoorRequestToken || buyerDoorRequest(currentBuyerContext())?.key !== request.key) return;
      LS.buyerDoors = doors;
      LS.buyerDoorShopId = request.key;
      if (!doors.some(door => door.id === LS.buyerDoorId)) LS.buyerDoorId = doors.length === 1 ? doors[0].id : '';
    } catch (error) {
      if (requestToken !== LS.buyerDoorRequestToken) return;
      LS.buyerDoors = [];
      LS.buyerDoorId = '';
      LS.buyerDoorShopId = request.key;
      LS.buyerDoorError = value(error?.message) || text('Не удалось загрузить торговые точки покупателя.', 'Could not load the buyer’s retail doors.');
    } finally {
      if (requestToken === LS.buyerDoorRequestToken) {
        LS.buyerDoorLoading = false;
        if (state.view === 'linesheets') renderApp();
      }
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
    return canWriteSelection(context) && !context.selection && context.cycle?.stage === 'showroom' && context.access?.showroomStatus === 'open' && Boolean(LS.buyerCatalog) && Boolean(context.retailDoor?.id);
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
      resetBuyerDoor();
      renderApp();
    }));
    bar.append(selectField(text('Коммерческий цикл', 'Commercial cycle'), context.cycles, context.cycle?.id || '', cycle => `${objectReference(cycle.id)} · ${stageText(cycle.stage)}`, next => {
      LS.cycleId = next;
      resetBuyerCatalog();
      renderApp();
    }, text('Цикл не найден', 'No cycle')));
    bar.append(retailDoorField(context));

    const refresh = el('button', { className: 'button', type: 'button', rawText: text('Обновить каталог', 'Refresh catalog') });
    refresh.addEventListener('click', () => { resetBuyerCatalog({ preserveQuantities: false }); renderApp(); });
    bar.append(refresh);
    return bar;
  }

  function retailDoorField(context) {
    const labelText = text('Торговая точка', 'Retail door');
    const label = el('label', { className: 'ls9-field', 'data-od14-component': 'field-group' });
    label.append(el('span', { className: 'ls9-field-label', rawText: labelText }));
    const select = el('select', { className: 'ls9-select', ariaLabel: labelText, 'data-od14-component': 'field' });
    if (context.selection?.retailDoorId && context.retailDoor) {
      select.append(el('option', { value: context.retailDoor.id, rawText: `${retailDoorLabel(context.retailDoor)} · v${context.retailDoor.version}` }));
      select.disabled = true;
    } else {
      const placeholder = LS.buyerDoorLoading
        ? text('Загрузка торговых точек…', 'Loading retail doors…')
        : context.retailDoors.length
          ? text('Выберите торговую точку', 'Select a retail door')
          : text('Нет активных торговых точек', 'No active retail doors');
      const emptyOption = el('option', { value: '', rawText: placeholder });
      if (!LS.buyerDoorId) emptyOption.selected = true;
      select.append(emptyOption);
      context.retailDoors.forEach(door => {
        const option = el('option', { value: door.id, rawText: retailDoorLabel(door) });
        if (door.id === LS.buyerDoorId) option.selected = true;
        select.append(option);
      });
      select.disabled = LS.buyerDoorLoading || context.retailDoors.length === 0;
      select.addEventListener('change', () => {
        LS.buyerDoorId = select.value;
        renderApp();
      });
    }
    label.append(select);
    return label;
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
      showroom: ['Шоурум', 'Showroom'], selection: ['Подборка', 'Selection'], 'order-builder': ['Сборка заказа', 'Order builder'],
      order: ['Заказ', 'Order'], confirmation: ['Подтверждение', 'Confirmation'], 'deal-space': ['Пространство сделки', 'Deal space'], collection: ['Коллекция', 'Collection'],
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
      [text('Торговая точка', 'Retail door'), value(context.retailDoor?.code) || text('Не выбрана', 'Not selected')],
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
    if (LS.buyerLoading && !LS.buyerCatalog) return statePanel('ls9-loading', text('Загрузка каталога покупателя…', 'Loading buyer catalog...'), text('Читаем опубликованную версию каталога — рабочие данные моделей не затрагиваются.', 'Reading the published catalogue version without consulting mutable product data.'));
    if (LS.buyerError && !LS.buyerCatalog) {
      const retry = el('button', { className: 'button', type: 'button', rawText: text('Повторить', 'Retry') });
      retry.addEventListener('click', () => { LS.buyerLoadedKey = ''; LS.buyerError = ''; renderApp(); });
      return statePanel('ls9-error', text('Каталог покупателя недоступен', 'Buyer catalog unavailable'), LS.buyerError, retry);
    }
    if (!LS.buyerCatalog) return statePanel('ls9-empty', text('Каталог покупателя не загружен', 'Buyer catalog not loaded'), text('Выберите доступ и коммерческий цикл.', 'Select buyer access and a commercial cycle.'));

    const wrapper = el('div', { className: 'stack' });
    // What the brand composed comes before the grid. A buyer opening a season should meet the
    // collection first and the spreadsheet second; until now they only ever met the spreadsheet.
    const looks = window.SynthaShowroomLooks;
    if (looks?.panel && context.access?.showroomId) {
      const showroom = list(workspace().showrooms).find(item => item.id === context.access.showroomId);
      if (showroom) wrapper.append(looks.panel(showroom, { manage: false }));
    }
    if (!context.cycle) wrapper.append(noticePanel(text('Матрица доступна для просмотра, но подборку нельзя создать без коммерческого цикла этой коллекции.', 'The matrix is available for viewing, but a selection cannot be created without a commercial cycle for this collection.')));
    if (!context.selection && LS.buyerDoorLoading) wrapper.append(noticePanel(text('Загружаем активные торговые точки покупателя…', 'Loading active buyer Retail Doors...')));
    if (!context.selection && LS.buyerDoorError) wrapper.append(noticePanel(LS.buyerDoorError, 'warning'));
    if (!context.selection && !LS.buyerDoorLoading && !LS.buyerDoorError && !context.retailDoors.length) wrapper.append(noticePanel(text('Для магазина нет активной торговой точки. Сначала добавьте или активируйте её — без точки коммерческий контекст не будет зафиксирован.', 'This shop has no active Retail Door. Add or reactivate one before Selection so the commercial context can be frozen.'), 'warning'));
    if (!context.selection && context.retailDoors.length > 1 && !context.retailDoor) wrapper.append(noticePanel(text('Выберите торговую точку в верхней панели. Она будет зафиксирована в подборке и унаследована заказом без повторного выбора.', 'Select a Retail Door in the toolbar. It will be frozen in Selection and inherited by the order without another choice.')));
    if (context.selection && !context.selection.buyerCatalogVersionId) wrapper.append(noticePanel(text('Текущая подборка создана по legacy-каталогу. Она доступна только для просмотра в новом rich-каталоге и не может быть перепривязана молча.', 'The current selection was created from a legacy catalog. It is read-only in the new rich catalog and cannot be silently rebound.'), 'warning'));
    if (LS.buyerError) wrapper.append(noticePanel(LS.buyerError, 'warning'));
    wrapper.append(buyerCatalogIdentity(context), styleTabs(), styleWorkspace(context));
    return wrapper;
  }

  function noticePanel(message, tone = 'info') {
    return el('div', { className: `notice ${tone}`.trim(), 'data-od14-component': 'alert', rawText: message });
  }

  function buyerCatalogIdentity(context) {
    const card = el('section', { className: 'card', 'data-od14-component': 'card' });
    card.append(el('h3', { rawText: text('Зафиксированный коммерческий контекст', 'Pinned commercial context') }));
    const info = el('dl', { className: 'ls9-info-grid', 'data-od14-component': 'definition-grid' });
    const door = context.retailDoor;
    const values = [
      [text('Версия каталога', 'Catalogue version'), shortRef(LS.buyerCatalog.id), value(LS.buyerCatalog.id)],
      [text('Публикация', 'Publication'), shortRef(LS.buyerCatalog.publicationId), value(LS.buyerCatalog.publicationId)],
      [text('Прайс-лист', 'Price list'), shortRef(LS.buyerCatalog.priceListVersionId), value(LS.buyerCatalog.priceListVersionId)],
      [text('Шоурум', 'Showroom'), showroomName(context.access.showroomId)],
      [text('Магазин', 'Shop'), organisationName(context.access.shopId)],
      [text('Торговая точка', 'Retail door'), retailDoorLabel(door)],
      [text('Версия точки', 'Door version'), door?.version ? `v${door.version}` : '—'],
      [text('Адрес поставки', 'Ship-to'), retailDoorAddressLabel(door?.shipToAddress)],
      [text('Контрольная сумма', 'Checksum'), shortHash(LS.buyerCatalog.contentHash)],
    ];
    values.forEach(([label, content, hover]) => {
      const item = el('div', { className: 'ls9-info-item', 'data-od14-component': 'definition-item' });
      const definition = el('dd', { rawText: content });
      if (hover) definition.title = String(hover);
      item.append(el('dt', { rawText: label }), definition);
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
      [text('Версия модели', 'Style version'), style.styleVersionNo == null ? shortRef(style.styleVersionId) : `v${style.styleVersionNo}`, style.styleVersionId],
      [text('Состав', 'Composition'), localized(style.compositionRu, style.compositionEn) || '—'],
      [text('Страна происхождения', 'Country of origin'), style.countryOfOrigin || '—'],
      [text('Цветов', 'Colorways'), String(style.rows.length)],
    ].forEach(([label, content, hover]) => {
      const item = el('div', { className: 'ls9-info-item', 'data-od14-component': 'definition-item' });
      const definition = el('dd', { rawText: content });
      if (hover) definition.title = String(hover);
      item.append(el('dt', { rawText: label }), definition); facts.append(item);
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

  // The catalogue stores a media role as a token. "hero" under a photograph is a word from our
  // schema, not from the reader's trade.
  function mediaRoleLabel(role) {
    const labels = {
      hero: ['Основное фото', 'Hero'], front: ['Вид спереди', 'Front'], back: ['Вид сзади', 'Back'],
      side: ['Вид сбоку', 'Side'], detail: ['Деталь', 'Detail'], flat: ['Выкладка', 'Flat'],
      sketch: ['Эскиз', 'Sketch'], fabric: ['Ткань', 'Fabric'],
    };
    const key = value(role);
    if (!key) return '';
    const pair = labels[key.toLowerCase()];
    return pair ? text(pair[0], pair[1]) : key;
  }

  function mediaNode(media, alt) {
    const uri = safeMediaUri(media);
    if (!uri) return el('div', { className: 'muted', rawText: text('Медиа недоступно', 'Media unavailable') });
    const figure = el('figure', { className: 'ls9-media', 'data-od14-component': 'card' });
    const image = el('img', { src: uri, alt: value(alt) || text('Изображение модели', 'Style image'), loading: 'lazy', decoding: 'async', width: '220' });
    // A link that does not resolve left the browser's broken-image glyph with the alt text
    // spilling out beside it, on the buyer's own product card. Say what happened instead, the
    // way the showroom's look cards already do.
    image.addEventListener('error', () => {
      if (!image.isConnected) return;
      image.replaceWith(el('span', { className: 'ls9-media-missing muted', rawText: text('Изображение не загрузилось', 'Image did not load'), title: uri }));
    }, { once: true });
    figure.append(image);
    if (media.mediaRole || media.id) figure.append(el('figcaption', { className: 'muted', rawText: mediaRoleLabel(media.mediaRole) || shortRef(media.id), title: value(media.id) }));
    return figure;
  }

  function matrixPanel(style, context) {
    const surface = el('section', { 'data-od14-component': 'surface' });
    const head = el('div', { 'data-od14-component': 'section-head' });
    const copy = el('div');
    copy.append(el('h3', { rawText: text('Матрица заказа: цвет × размер', 'Colour × size order matrix') }), el('p', { className: 'muted', rawText: text('Каждая ячейка — точный SKU из неизменяемой версии каталога. Цену и товарную иерархию сервер проверяет заново.', 'Every cell is an exact SKU from the immutable catalogue version. Price and product lineage are revalidated by the server.') }));
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
    if (!context.selection && context.cycle?.stage === 'showroom' && LS.buyerCatalog && !context.retailDoor) {
      return statusLine(el('span', { className: 'badge', rawText: text('Выберите торговую точку', 'Select a retail door') }));
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
    return statusLine(el('span', { className: 'badge', rawText: context.selection ? selectionStatusText(context.selection.status) : text('Только просмотр', 'Read only') }));
  }

  // When there is nothing to press, the row is a statement, not a toolbar. Returning it as one
  // drew a bordered, padded, rounded box around a single rounded pill — two nested containers
  // for one word.
  function statusLine(badge) {
    const line = el('div', { className: 'ls9-standing' });
    line.append(badge);
    return line;
  }

  // The grid an order is actually written in (JOOR §64.2). It is the one surface in the product
  // where a person types a hundred numbers in a row, so it earns: totals down every column and
  // along every row, a paste from a spreadsheet that is shown before it is applied, an undo for
  // that paste, cells that go red for the same reasons the server would refuse them, arrow keys
  // that move between cells, and a save status that is always on screen.
  function orderMatrixTable(style, context) {
    const wrap = el('div', { 'data-od14-component': 'table-wrap' });
    const table = el('table', { className: 'ls9-matrix', 'data-od14-component': 'table', ariaLabel: text('Матрица количества по цветам и размерам', 'Colour and size quantity matrix') });
    const thead = el('thead');
    const headRow = el('tr');
    headRow.append(el('th', { rawText: text('Цвет', 'Colour') }));
    style.sizes.forEach(size => headRow.append(el('th', { rawText: localized(size.labelRu, size.labelEn) || size.code, title: `${size.code} · ${size.id}` })));
    headRow.append(el('th', { className: 'ls9-total-head', rawText: text('Итого', 'Total') }));
    thead.append(headRow);
    const tbody = el('tbody');
    const editable = canEditMatrix(context) || canCreateSelection(context);
    style.rows.forEach((row, rowIndex) => {
      const tr = el('tr');
      const color = el('td');
      color.append(colorLabel(row));
      tr.append(color);
      style.sizes.forEach((size, sizeIndex) => {
        const cell = row.cells[size.key];
        const td = el('td');
        if (!cell) td.append(el('span', { className: 'muted', rawText: '—' }));
        else td.append(matrixCell(cell, editable, style, rowIndex, sizeIndex));
        tr.append(td);
      });
      tr.append(el('td', { className: 'ls9-total-cell', 'data-row-total': String(rowIndex), rawText: '0' }));
      tbody.append(tr);
    });
    const tfoot = el('tfoot');
    const footRow = el('tr');
    footRow.append(el('th', { rawText: text('Всего по размеру', 'Per size') }));
    style.sizes.forEach((size, sizeIndex) => footRow.append(el('td', { className: 'ls9-total-cell', 'data-column-total': String(sizeIndex), rawText: '0' })));
    footRow.append(el('td', { className: 'ls9-total-cell ls9-total-grand', 'data-grand-total': 'units', rawText: '0' }));
    tfoot.append(footRow);
    table.append(thead, tbody, tfoot);
    wrap.append(table);
    const frame = el('div', { className: 'ls9-grid' });
    frame.append(wrap, gridSummary(style, editable));
    refreshTotals(style, frame);
    return frame;
  }

  // Units, lines and money for the style, plus the save state and the undo. Everything a person
  // needs to know they are done is on one line under the grid.
  function gridSummary(style, editable) {
    const summary = el('div', { className: 'ls9-gridfoot' });
    summary.append(el('span', { className: 'ls9-gridfoot-figure', 'data-summary': 'units' }));
    summary.append(el('span', { className: 'ls9-gridfoot-figure', 'data-summary': 'lines' }));
    summary.append(el('span', { className: 'ls9-gridfoot-figure ls9-gridfoot-amount', 'data-summary': 'amount' }));
    const tail = el('div', { className: 'ls9-gridfoot-tail' });
    if (editable) {
      tail.append(el('span', { className: 'muted ls9-gridfoot-hint', rawText: text('Вставьте блок из таблицы прямо в ячейку — сначала покажем, что изменится.', 'Paste a block from a spreadsheet straight into a cell — we show what would change first.') }));
      const undo = el('button', { className: 'button small', type: 'button', rawText: text('Отменить вставку', 'Undo paste'), 'data-summary': 'undo' });
      undo.hidden = !LS.lastPaste;
      undo.addEventListener('click', () => undoLastPaste(style));
      tail.append(undo);
    }
    tail.append(el('span', { className: 'ls9-save-state', 'data-summary': 'save' }));
    summary.append(tail);
    return summary;
  }

  function saveStateText() {
    if (LS.saveState === 'saving') return text('Сохраняется…', 'Saving…');
    if (LS.saveState === 'error') return text('Не сохранено', 'Not saved');
    if (LS.dirty) return text('Есть несохранённые изменения', 'Unsaved changes');
    if (LS.savedAt) return `${text('Сохранено', 'Saved')} ${LS.savedAt}`;
    return '';
  }

  // Redrawn in place after every keystroke and every paste, because re-rendering the whole view
  // would take the caret out of the cell the person is typing in.
  function refreshTotals(style, root) {
    const frame = root || document.querySelector('.ls9-grid');
    if (!frame) return;
    const totals = Grid.styleTotals(style, LS.quantities);
    totals.rows.forEach((row, index) => {
      const node = frame.querySelector(`[data-row-total="${index}"]`);
      if (node) { node.textContent = String(row.units); node.classList.toggle('ls9-total-zero', row.units === 0); }
    });
    totals.columns.forEach((column, index) => {
      const node = frame.querySelector(`[data-column-total="${index}"]`);
      if (node) { node.textContent = String(column.units); node.classList.toggle('ls9-total-zero', column.units === 0); }
    });
    const grand = frame.querySelector('[data-grand-total="units"]');
    if (grand) grand.textContent = String(totals.units);
    const units = frame.querySelector('[data-summary="units"]');
    if (units) units.textContent = `${text('Единиц', 'Units')}: ${totals.units}`;
    const lines = frame.querySelector('[data-summary="lines"]');
    if (lines) lines.textContent = `${text('Позиций', 'Lines')}: ${totals.lines}`;
    const amount = frame.querySelector('[data-summary="amount"]');
    if (amount) amount.textContent = `${text('Сумма', 'Value')}: ${formatMoney(totals.amountMinor, totals.currency || LS.buyerCatalog?.currency)}`;
    const save = frame.querySelector('[data-summary="save"]');
    if (save) {
      save.textContent = saveStateText();
      save.dataset.state = LS.saveState || (LS.dirty ? 'dirty' : 'clean');
    }
    const undo = frame.querySelector('[data-summary="undo"]');
    if (undo) undo.hidden = !LS.lastPaste;
  }

  const CELL_MESSAGE = Object.freeze({
    MOQ_NOT_MET: (cell) => text(`Минимум ${cell.minimumOrderQuantity}`, `Minimum ${cell.minimumOrderQuantity}`),
    AVAILABILITY_EXCEEDED: (cell) => text(`Доступно ${cell.availableToSell}`, `Available ${cell.availableToSell}`),
    QUANTITY_INVALID: () => text('Целое число', 'Whole number'),
    REMOVED: () => text('Не заказываем', 'Not ordered'),
    SKU_UNKNOWN: () => text('Нет такого SKU', 'Unknown SKU'),
  });

  const CLOSED_MESSAGE = Object.freeze({
    SOLD_OUT: () => text('Распродано', 'Sold out'),
    BELOW_MOQ_STOCK: (cell) => text(`Остаток меньше минимума ${cell.minimumOrderQuantity}`, `Stock below the minimum of ${cell.minimumOrderQuantity}`),
    NO_SKU: () => text('Нет SKU', 'No SKU'),
  });

  // Mark one cell against its own price line, and say why in the cell rather than at save time.
  function markCell(block, cell, raw) {
    const verdict = Grid.evaluateCell(cell, raw);
    const note = block.querySelector('[data-cell-note]');
    block.classList.toggle('ls9-cell-error', verdict.level === 'error');
    block.classList.toggle('ls9-cell-removed', verdict.code === 'REMOVED');
    block.classList.toggle('ls9-cell-filled', verdict.kind === 'number');
    if (note) {
      const message = CELL_MESSAGE[verdict.code];
      note.textContent = message ? message(cell) : '';
      note.hidden = !message;
    }
    return verdict;
  }

  function quantityInputs(root) {
    return [...(root || document).querySelectorAll('.ls9-grid input[data-sku]:not([disabled])')];
  }

  // Arrow keys, Enter and Tab move between cells. A grid you have to reach for the mouse in is
  // not a grid anybody enters a season's buy into.
  function moveFocus(input, rowDelta, columnDelta) {
    const table = input.closest('table');
    if (!table) return;
    const row = Number(input.dataset.gridRow);
    const column = Number(input.dataset.gridColumn);
    const target = table.querySelector(`input[data-grid-row="${row + rowDelta}"][data-grid-column="${column + columnDelta}"]:not([disabled])`);
    if (target) { target.focus(); target.select?.(); }
  }

  function colorLabel(row) {
    const block = el('div');
    const name = localized(row.nameRu, row.nameEn) || row.code;
    const firstLine = el('strong', { rawText: name });
    if (/^#[0-9A-Fa-f]{6}$/.test(row.swatchHex || '')) {
      firstLine.append(' ', colourSwatch(row.swatchHex, `${text('Цвет', 'Color')} ${row.swatchHex}`));
    }
    block.append(firstLine, el('small', { rawText: row.code, title: row.id }));
    return block;
  }

  function matrixCell(cell, editable, style, rowIndex, sizeIndex) {
    const block = el('div', { className: 'ls9-cell' });
    block.append(el('small', { rawText: cell.sku, title: `${cell.productSkuId} · ${cell.sizeValueId}` }));
    const input = el('input', {
      // A quantity is a whole number of garments, so the cell accepts text and judges it here.
      // A number input silently swallows what a spreadsheet pastes — "1 200", "12,00" — and
      // reports an empty string for it, which is how a pasted column used to vanish.
      type: 'text', inputmode: 'numeric', autocomplete: 'off', value: LS.quantities[cell.sku] ?? '',
      ariaLabel: `${cell.sku} · ${text('Количество', 'Quantity')}`,
      placeholder: String(cell.minimumOrderQuantity),
      'data-sku': cell.sku,
      'data-grid-row': String(rowIndex),
      'data-grid-column': String(sizeIndex),
      'data-od14-component': 'field',
    });
    const closed = Grid.cellClosedReason(cell);
    if (!editable || closed) input.disabled = true;
    input.addEventListener('input', () => {
      LS.quantities[cell.sku] = input.value;
      LS.dirty = true;
      LS.saveState = '';
      markCell(block, cell, input.value);
      refreshTotals(style);
      scheduleAutosave();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); moveFocus(input, 1, 0); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(input, -1, 0); }
      else if (event.key === 'ArrowRight' && input.selectionStart === input.value.length) { event.preventDefault(); moveFocus(input, 0, 1); }
      else if (event.key === 'ArrowLeft' && input.selectionStart === 0) { event.preventDefault(); moveFocus(input, 0, -1); }
    });
    input.addEventListener('paste', (event) => {
      const clipboard = event.clipboardData?.getData('text/plain') ?? '';
      if (!/[\t\n\r]/.test(clipboard)) return;
      event.preventDefault();
      const grid = Grid.parseClipboardGrid(clipboard);
      if (!grid.length) return;
      void openPastePreview(style, cell.sku, grid);
    });
    block.append(input);
    block.append(el('small', { className: 'ls9-cell-note', 'data-cell-note': 'true', hidden: true }));
    if (closed) {
      const reason = CLOSED_MESSAGE[closed];
      block.append(el('small', { className: 'ls9-cell-closed', rawText: reason ? reason(cell) : '' }));
    }
    // "MOQ 12 · ATS: 600" is trade shorthand a brand's own planner reads fluently and a shop
    // assistant does not. The showroom's look cards already say «мин. 6» in words; the cell the
    // order is actually written in says the same.
    const availability = cell.availableToSell === null ? text('доступность по условиям', 'availability per terms') : `${text('доступно', 'available')} ${cell.availableToSell}`;
    block.append(el('small', { rawText: `${formatMoney(cell.unitPrice, cell.currency)} · ${text('мин.', 'min.')} ${cell.minimumOrderQuantity} · ${availability}` }));
    markCell(block, cell, LS.quantities[cell.sku] ?? '');
    return block;
  }

  // A paste is shown before it is applied.
  //
  // A spreadsheet pasted one column out of line silently rewrites a season's buy, and the person
  // who did it finds out at the brand's confirmation. So: what lands where, what each cell was
  // and becomes, which cells the brand's own rules would refuse, and how much of the block fell
  // off the edge of the style. Nothing is written until the reader says so.
  function openPastePreview(style, anchorSku, grid) {
    const plan = Grid.planPaste({ style, anchorSku, grid, quantities: LS.quantities });
    if (!plan.anchor) return;
    if (!plan.changes.length) {
      toast(plan.unchanged
        ? text('Вставка ничего не меняет: значения совпадают.', 'The paste changes nothing: the values already match.')
        : text('В буфере нет значений для этой матрицы.', 'The clipboard holds nothing this matrix can take.'), 'info');
      return;
    }
    const modal = el('dialog', { className: 'app-confirm ls9-paste-preview' });
    const form = el('form', { method: 'dialog' });
    const heading = el('header');
    heading.append(el('h2', { rawText: text('Проверьте вставку', 'Review the paste') }));
    const ok = plan.changes.length - plan.errors;
    const counts = [
      text(`Изменится ячеек: ${ok}`, `Cells to change: ${ok}`),
      plan.errors ? text(`Отклонено правилами: ${plan.errors}`, `Refused by the rules: ${plan.errors}`) : '',
      plan.unchanged ? text(`Без изменений: ${plan.unchanged}`, `Unchanged: ${plan.unchanged}`) : '',
      plan.outside ? text(`Не поместилось в матрицу: ${plan.outside}`, `Fell outside the matrix: ${plan.outside}`) : '',
    ].filter(Boolean).join(' · ');
    heading.append(el('p', { className: 'muted', rawText: counts }));

    const wrap = el('div', { className: 'ls9-paste-rows' });
    const table = el('table', { 'data-od14-component': 'table' });
    const thead = el('thead');
    const headRow = el('tr');
    [text('Цвет', 'Colour'), text('Размер', 'Size'), 'SKU', text('Было', 'Was'), text('Станет', 'Becomes'), text('Примечание', 'Note')]
      .forEach(label => headRow.append(el('th', { rawText: label })));
    thead.append(headRow);
    const tbody = el('tbody');
    plan.changes.forEach(change => {
      const tr = el('tr', { className: change.level === 'error' ? 'ls9-paste-refused' : '' });
      tr.append(el('td', { rawText: change.rowLabel || '—' }));
      tr.append(el('td', { rawText: change.sizeLabel || '—' }));
      tr.append(el('td', { rawText: change.sku }));
      tr.append(el('td', { rawText: change.before === '' ? '—' : change.before }));
      tr.append(el('td', { rawText: change.kind === 'remove' ? text('убрать', 'remove') : (change.after === '' ? '—' : change.after) }));
      const note = change.level === 'error'
        ? (CELL_MESSAGE[change.code] ? CELL_MESSAGE[change.code]({ minimumOrderQuantity: change.minimumOrderQuantity, availableToSell: change.availableToSell }) : change.code)
        : '';
      tr.append(el('td', { className: 'muted', rawText: note }));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);

    const footer = el('footer');
    const cancel = el('button', { className: 'button secondary', type: 'button', rawText: text('Отмена', 'Cancel') });
    const accept = el('button', { className: 'button primary', type: 'submit', rawText: ok
      ? text(`Вставить ${ok}`, `Paste ${ok}`)
      : text('Нечего вставлять', 'Nothing to paste') });
    accept.disabled = ok === 0;
    cancel.addEventListener('click', () => modal.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const applied = Grid.applyPlan(LS.quantities, plan);
      LS.quantities = applied.next;
      LS.lastPaste = { previous: applied.previous, applied: applied.applied };
      LS.dirty = true;
      LS.saveState = '';
      modal.close();
      renderApp();
      toast(text(`Вставлено ячеек: ${applied.applied}. Можно отменить одной кнопкой.`, `${applied.applied} cell(s) pasted. One button undoes it.`), 'success');
      scheduleAutosave();
    });
    modal.addEventListener('close', () => modal.remove(), { once: true });
    footer.append(cancel, accept);
    form.append(heading, wrap, footer);
    modal.append(form);
    document.body.append(modal);
    modal.showModal();
    accept.focus();
    return modal;
  }

  // Undo restores the map the paste replaced, rather than trying to reverse each cell.
  function undoLastPaste() {
    if (!LS.lastPaste) return;
    LS.quantities = { ...LS.lastPaste.previous };
    LS.lastPaste = null;
    LS.dirty = true;
    LS.saveState = '';
    renderApp();
    toast(text('Вставка отменена.', 'The paste has been undone.'), 'info');
    scheduleAutosave();
  }

  // Autosave, with the state always on screen. It only ever runs on a draft selection the reader
  // may edit, it waits for them to stop typing, and it never runs while another save is in
  // flight; a failure leaves the work in the grid and says so rather than discarding it.
  let autosaveTimer = null;
  function scheduleAutosave() {
    if (!LS.autosave) { refreshTotals(currentStyle()); return; }
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { autosaveTimer = null; void runAutosave(); }, 2000);
    refreshTotals(currentStyle());
  }

  function currentStyle() {
    return list(LS.matrices).find(item => item.styleId === LS.selectedStyleId) || list(LS.matrices)[0] || null;
  }

  async function runAutosave() {
    const context = currentContext?.();
    if (!context || !LS.dirty || LS.saveState === 'saving') return;
    if (!canEditMatrix(context)) return;
    // A cell the rules refuse is not sent. The reader keeps it on screen, in red, and the rest
    // of their work is still saved.
    LS.saveState = 'saving';
    refreshTotals(currentStyle());
    try {
      await saveBuyerMatrix(context, { silent: true });
    } catch (error) {
      LS.saveState = 'error';
      refreshTotals(currentStyle());
      toast(error?.message || text('Автосохранение не прошло. Нажмите «Сохранить матрицу».', 'Autosave did not go through. Use “Save matrix”.'), 'error');
    }
  }

  async function createBuyerSelection(context) {
    const catalog = LS.buyerCatalog;
    if (!catalog || !context.cycle || !context.access) throw uiError('BUYER_MATRIX_CONTEXT_REQUIRED', text('Не выбран коммерческий контекст.', 'Commercial context is not selected.'));
    if (!context.retailDoor?.id) throw uiError('BUYER_MATRIX_RETAIL_DOOR_REQUIRED', text('Выберите торговую точку до создания подборки.', 'Select a retail door before creating the selection.'));
    const pinnedRetailDoorId = context.retailDoor.id;
    const request = Matrix.createSelectionRequest(context.cycle.id, context.access.showroomId, pinnedRetailDoorId);
    const result = await mutate(request.path, request.body, request.method);
    const created = result?.selection;
    if (!created?.id) throw uiError('BUYER_MATRIX_SELECTION_CREATE_FAILED', text('Сервер не вернул созданную подборку.', 'Server did not return the created selection.'));
    if (created.retailDoorId !== pinnedRetailDoorId || !created.buyerCommercialSnapshot) throw uiError('BUYER_MATRIX_RETAIL_DOOR_PIN_FAILED', text('Сервер не зафиксировал выбранную торговую точку в подборке.', 'The server did not freeze the selected retail door in the selection.'));
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
    toast(text('Подборка создана. Торговая точка зафиксирована; теперь сохраните количества матрицы.', 'Selection created with the Retail Door pinned. Save the matrix quantities next.'), 'success');
  }

  async function saveBuyerMatrix(context, { silent = false } = {}) {
    const selection = context.selection;
    if (!selection || !LS.buyerCatalog) throw uiError('BUYER_MATRIX_SELECTION_REQUIRED', text('Сначала создайте подборку.', 'Create a selection first.'));
    // A cell the rules refuse never reaches the server: the grid already says why, in red, in
    // the cell. Sending it would trade a precise complaint for a single error at the top of the
    // page and lose the rest of the buy with it.
    const cells = new Map();
    list(LS.matrices).forEach(style => list(style.rows).forEach(row => Object.values(row.cells || {}).forEach(cell => { if (cell?.sku) cells.set(cell.sku, cell); })));
    const sendable = {};
    let refused = 0;
    Object.entries(LS.quantities).forEach(([sku, raw]) => {
      const verdict = Grid.evaluateCell(cells.get(sku), raw);
      if (verdict.level === 'error') { refused += 1; return; }
      if (verdict.kind === 'number') sendable[sku] = String(verdict.quantity);
    });
    const request = Matrix.selectionMatrixRequest(selection.id, LS.matrices, sendable);
    const updated = await mutate(request.path, request.body, request.method);
    if (updated?.buyerCatalogVersionId !== LS.buyerCatalog.id || updated?.commercialBasisHash !== LS.buyerCatalog.contentHash) throw uiError('BUYER_MATRIX_CATALOG_CHANGED', text('Сервер вернул подборку с другим коммерческим снимком.', 'Server returned a selection bound to a different commercial snapshot.'));
    // What the grid shows after a save is what the server stored, plus the cells it refused,
    // which stay on screen in red so the reader can fix them rather than lose them.
    const stored = Object.fromEntries(list(updated.lines).map(line => [line.sku, String(line.quantity)]));
    Object.entries(LS.quantities).forEach(([sku, raw]) => {
      const verdict = Grid.evaluateCell(cells.get(sku), raw);
      if (verdict.level === 'error') stored[sku] = String(raw);
    });
    LS.quantities = stored;
    LS.quantityCatalogId = updated.buyerCatalogVersionId;
    LS.quantitySelectionId = updated.id;
    LS.dirty = refused > 0;
    LS.saveState = refused > 0 ? 'error' : '';
    LS.savedAt = new Intl.DateTimeFormat(I18N.localeTag(), { hour: '2-digit', minute: '2-digit' }).format(new Date());
    await reload();
    renderApp();
    if (silent) return;
    toast(refused
      ? text(`Сохранено. Не принято ячеек: ${refused} — они остались в сетке красными.`, `Saved. ${refused} cell(s) were not accepted and remain in the grid in red.`)
      : text('Матрица сохранена атомарно.', 'Matrix saved atomically.'), refused ? 'info' : 'success');
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
    refresh.addEventListener('click', () => {
      LS.loadedCollectionId = ''; LS.nextCursor = null; LS.selectedId = '';
      loadPublications()
        .then(() => toast(text('\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b.', 'Data refreshed.')))
        .catch((error) => toast(error?.message || text('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435.', 'The data could not be refreshed.'), 'error'));
      renderApp();
    });
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
    if (LS.error && !LS.items.length) {
      const retry = el('button', { className: 'button', type: 'button', rawText: text('Повторить', 'Retry') });
      retry.addEventListener('click', () => { LS.loadedCollectionId = ''; void loadPublications(); renderApp(); });
      return statePanel('ls9-error', text('Не удалось загрузить публикации', 'Could not load publications'), LS.error, retry);
    }
    if (!LS.items.length) return statePanel('ls9-empty', text('Опубликованных листов пока нет', 'No published linesheets yet'), text('После коммерческой публикации коллекции неизменяемый снимок появится здесь автоматически.', 'After the collection is commercially published, its immutable snapshot will appear here automatically.'));
    const filtered = filteredPublications(); const selected = LS.items.find(item => item.id === LS.selectedId) || LS.items[0] || null;
    const layout = el('section', { className: 'ls9-layout' }); const registry = el('div', { className: 'ls9-registry' }); const registryHead = el('div', { className: 'ls9-section-title' });
    registryHead.append(el('h3', { rawText: text('Реестр публикаций', 'Publication registry') }), el('span', { rawText: `${filtered.length}/${LS.items.length}` })); registry.append(registryHead);
    registry.append(filtered.length ? publicationTable(filtered) : el('div', { className: 'ls9-empty', rawText: text('По вашему запросу ничего не найдено.', 'No publications match your search.') }));
    if (LS.nextCursor) {
      const loadMore = el('button', { className: 'button ls9-load-more', type: 'button', rawText: LS.loadingMore ? text('Загрузка…', 'Loading...') : text('Загрузить ещё', 'Load more') });
      loadMore.disabled = LS.loadingMore;
      loadMore.addEventListener('click', () => { void loadPublications({ append: true }); renderApp(); });
      registry.append(loadMore);
    }
    if (LS.error) registry.append(el('div', { className: 'ls9-inline-error', rawText: LS.error }));
    layout.append(registry, registryInspector(selected)); return layout;
  }

  function renderLinesheets() {
    const accesses = ensureMode();
    let buyerContext = null;
    if (LS.mode === 'buyer') {
      buyerContext = currentBuyerContext();
      ensureBuyerDoorLoad(buyerContext);
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
        ? text('Каталог покупателя, торговая точка и матрица «цвет × размер» работают как единый коммерческий контекст: точка фиксируется до подборки и дальше наследуется заказом.', 'Buyer Catalog, Retail Door, and the colour × size matrix operate as one commercial context: the door is pinned before Selection and then inherited by the order.')
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