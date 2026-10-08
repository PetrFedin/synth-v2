(function installAwaitingAction(global) {
  'use strict';

  // «Ждёт вас» — ответ на вопрос «что мне сделать сейчас». Уведомления говорят, что что-то
  // случилось; этот экран говорит, чей сейчас ход. Список не хранится нигде и не отмечается
  // «прочитанным»: пункт исчезает сам, как только сущность вышла из состояния, которое ждёт
  // человека, — то есть когда ход сделан.
  //
  // Сервер уже отобрал только то, что человек вправе сделать по своей роли, поэтому здесь нет ни
  // одной проверки прав: показывается ровно то, что пришло.
  const ui = global.SynthaAwaitingAction || (global.SynthaAwaitingAction = {
    total: 0, overdue: 0, counts: {}, countsLoaded: false,
    items: [], loadedKey: '', loading: false, error: '',
    group: 'all', type: 'all', checkedFor: null, timer: null, inflight: false,
    // Человек уходил с экрана: при возврате показанный ранее список не показывается, а читается заново.
    away: true, generation: 0, reloadRequested: false,
  });

  const VIEW = 'awaiting-action';
  const POLL_MS = 60_000;
  const GROUPS = Object.freeze({
    orders: ['Заказы', 'Orders'],
    partners: ['Партнёры', 'Partners'],
    sourcing: ['Закупки', 'Sourcing'],
    production: ['Производство', 'Production'],
    quality: ['Качество', 'Quality'],
    finance: ['Платежи', 'Payments'],
    compliance: ['Документы', 'Documents'],
    exceptions: ['Исключения', 'Exceptions'],
  });

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function english() { return typeof I18N !== 'undefined' && I18N.getLocale?.() === 'en'; }
  function actorId() { return state.user?.actorId || state.user?.id || null; }

  function pluralDays(days) {
    if (english()) return `${days} d`;
    return `${days} дн.`;
  }

  // Возраст говорится человеческими единицами: «сегодня» и «3 дн.» читаются, 259200 секунд — нет.
  function ageLabel(seconds) {
    const value = Number(seconds) || 0;
    if (value < 3600) return text('меньше часа', 'under an hour');
    if (value < 86_400) return english() ? `${Math.floor(value / 3600)} h` : `${Math.floor(value / 3600)} ч`;
    return pluralDays(Math.floor(value / 86_400));
  }

  function dueLabel(item) {
    if (!item.dueAt) return '';
    if (item.overdue) return text(`просрочено на ${pluralDays(Math.max(1, Math.floor((item.overdueSeconds || 0) / 86_400)))}`, `${pluralDays(Math.max(1, Math.floor((item.overdueSeconds || 0) / 86_400)))} overdue`);
    const date = new Date(item.dueAt);
    if (!Number.isFinite(date.getTime())) return '';
    return text('срок: ', 'due: ') + new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  // «Документ соответствия» — подпись для любого из трёх видов, а вид в данных есть: УПД, декларация
  // и сертификат ждут проверки и выпуска каждый под своим названием. Чужой или пустой вид оставляет
  // подпись сервера.
  const COMPLIANCE_DOCUMENT_TITLES = {
    upd: ['УПД — черновик ждёт проверки и выпуска', 'UPD draft awaits review and issue'],
    eaeu_declaration_of_conformity: ['Декларация соответствия ЕАЭС — черновик ждёт проверки и выпуска', 'EAEU declaration of conformity draft awaits review and issue'],
    eaeu_certificate_of_conformity: ['Сертификат соответствия ЕАЭС — черновик ждёт проверки и выпуска', 'EAEU certificate of conformity draft awaits review and issue'],
  };
  function itemTitle(item) {
    const typed = item?.type === 'compliance-document-issue' ? COMPLIANCE_DOCUMENT_TITLES[item.detail?.documentType] : null;
    return typed ? text(typed[0], typed[1]) : text(item.titleRu, item.titleEn);
  }

  function detailLine(item) {
    const detail = item.detail || {};
    const parts = [];
    if (detail.counterpartyName) parts.push(detail.counterpartyName);
    if (detail.sku) parts.push(detail.sku);
    if (detail.materialCode && !detail.sku) parts.push(detail.materialCode);
    if (detail.supplierCode) parts.push(detail.supplierCode);
    if (Number.isInteger(detail.quoteCount)) parts.push(text(`котировок: ${detail.quoteCount}`, `quotations: ${detail.quoteCount}`));
    if (Number.isInteger(detail.amountMinor)) parts.push(I18N.formatMoney(detail.amountMinor, detail.currency || 'EUR', { minor: true }));
    else if (typeof detail.totalAmount === 'number') parts.push(I18N.formatMoney(detail.totalAmount, detail.currency || 'EUR'));
    if (Number.isInteger(detail.proposedQuantity)) parts.push(`${detail.currentQuantity} → ${detail.proposedQuantity}`);
    // Экономика или исполнение заказа уже начаты: правку принять нельзя, остаётся отклонить.
    if (detail.acceptBlock) parts.push(text('принять нельзя, можно отклонить', 'cannot be accepted, can be rejected'));
    return parts.join(' · ');
  }

  function query(extra, path = '/v2/inbox/awaiting-action') {
    const params = new URLSearchParams(extra);
    return `${path}?${params.toString()}`;
  }

  // Откуда читается «ждёт вас». Член организации — из реестра дел по членству; поставщик — не член
  // ничего, его единственное основание грант портала, и дела берутся из портала
  // (`/v2/supplier-portal/awaiting-action`). Человек может быть и тем и другим: тогда читаются оба
  // источника и сливаются. Пока портал не опознан, читается обычный источник: для того, у кого нет
  // членства, он честно отвечает «ничего».
  const BRAND_SOURCE = Object.freeze({ id: 'brand', path: '/v2/inbox/awaiting-action' });
  const PORTAL_SOURCE = Object.freeze({ id: 'portal', path: '/v2/supplier-portal/awaiting-action' });
  const PORTAL_GROUPS = Object.freeze(['sourcing', 'production']);
  function portalSuppliers() { return global.SynthaSupplierPortal?.suppliers || []; }
  function hasMemberships() { return (state.workspace?.memberships || []).length > 0; }
  function sources() {
    const out = [];
    if (hasMemberships() || !portalSuppliers().length) out.push(BRAND_SOURCE);
    if (portalSuppliers().length) out.push(PORTAL_SOURCE);
    return out;
  }
  function sourcesKey() { return sources().map((source) => source.id).join('+'); }

  // Какой источник отвечает за запрошенный тип или группу: чужой тип источник отвергает как неизвестный.
  function accepts(source, params) {
    if (params.type) {
      const known = ui.counts[params.type]?.source;
      return known ? known === source.id : source.id === 'brand';
    }
    if (params.group && source.id === 'portal') return PORTAL_GROUPS.includes(params.group);
    return true;
  }

  function byUrgency(left, right) {
    return (Number(Boolean(right.overdue)) - Number(Boolean(left.overdue)))
      || String(left.waitingSince || '').localeCompare(String(right.waitingSince || ''));
  }

  async function fetchMerged(params) {
    const chosen = sources().filter((source) => accepts(source, params));
    const results = await Promise.all(chosen.map((source) => api(query(params, source.path))));
    const merged = { total: 0, overdue: 0, counts: {}, items: [] };
    results.forEach((result, index) => {
      merged.total += result.total || 0;
      merged.overdue += result.overdue || 0;
      Object.entries(result.counts || {}).forEach(([type, entry]) => { merged.counts[type] = { ...entry, source: chosen[index].id }; });
      merged.items.push(...(result.items || []));
    });
    if (results.length > 1) merged.items.sort(byUrgency);
    return merged;
  }

  // Счётчик для значка — отдельный дешёвый вызов: limit=0 возвращает только числа, и стоимость
  // значка в шапке не растёт с числом дел.
  async function refreshCounters({ force = false } = {}) {
    const id = actorId();
    if (!id || (ui.inflight && !force)) return;
    ui.inflight = true;
    // Ответ, обогнанный более новым чтением (запись произошла, пока шло прошлое), не применяется.
    const generation = ++ui.generation;
    const key = `${id}|${sourcesKey()}`;
    try {
      const result = await fetchMerged({ limit: '0' });
      if (generation !== ui.generation) return;
      ui.total = result.total || 0;
      ui.overdue = result.overdue || 0;
      ui.counts = result.counts || {};
      ui.countsLoaded = true;
      ui.checkedFor = key;
      paintBadges();
      if (state.view === VIEW && !ui.loading) {
        // Счётчики изменились, пока экран открыт, — значит, и список устарел.
        if (ui.loadedKey) void loadList(true);
      }
    } catch (error) {
      // Значок — подсказка, а не функция: сбой сети не должен мешать работать.
      ui.checkedFor = key;
    } finally {
      if (generation === ui.generation) ui.inflight = false;
    }
  }

  function listKey() { return `${ui.group}|${ui.type}`; }

  async function loadList(force) {
    // Чтение уже идёт, а запрошено новое (после записи): текущее ответит старым, поэтому по его
    // окончании список читается ещё раз.
    if (ui.loading) { if (force) ui.reloadRequested = true; return; }
    if (!force && ui.loadedKey === listKey()) return;
    ui.loading = true; ui.error = '';
    const key = listKey();
    try {
      const params = { limit: '200' };
      if (ui.type !== 'all') params.type = ui.type;
      else if (ui.group !== 'all') params.group = ui.group;
      const result = await fetchMerged(params);
      ui.items = result.items || [];
      ui.loadedKey = key;
      // Список прочитан на экране, который открыт, — значит, он свежий и заново читать его при первой отрисовке не нужно.
      if (state.view === VIEW) ui.away = false;
      if (ui.type === 'all' && ui.group === 'all') {
        ui.total = result.total || 0; ui.overdue = result.overdue || 0; ui.counts = result.counts || {};
        ui.countsLoaded = true;
      }
    } catch (error) {
      ui.error = error?.message || I18N.t('common.requestError');
    } finally {
      ui.loading = false;
      paintBadges();
      if (state.view === VIEW) renderApp();
      if (ui.reloadRequested) { ui.reloadRequested = false; if (state.view === VIEW) void loadList(true); }
    }
  }

  function groupCount(group) {
    return Object.values(ui.counts).filter((entry) => entry.group === group).reduce((sum, entry) => sum + entry.count, 0);
  }

  function badge(count, overdue) {
    const node = el('span', { className: `notification-count awaiting-action-count${overdue ? ' awaiting-action-overdue' : ''}`, rawText: count > 99 ? '99+' : String(count) });
    node.dataset.awaitingActionBadge = 'true';
    return node;
  }

  // Куда «Перейти» приводит на самом деле. Сервер в `route` называет не только экран, но и запись,
  // вкладку и (где нужно) диалог. Выбрать запись умеет только экран-владелец, поэтому он сам
  // зарегистрировал обработчик в `view-refresh.js`: «Перейти» перечитывает экран, а затем отдаёт
  // маршрут его обработчику — после чтения, потому что чтение сбрасывает выбор.
  function open(item) {
    const route = item.route;
    if (global.SynthaViewRefresh) { void global.SynthaViewRefresh.open(route.view, route); return; }
    state.view = route.view;
    renderApp();
  }

  // Сервер подписывает дело идентификатором, когда у сущности нет имени: `order_<uuid>` не читается.
  // Тот же короткий номер, которым этот заказ называется на своём экране, — ORD-XXXXXXXX.
  function labelOf(item) {
    // Правка — не заказ, но живёт в нём: подписывается номером заказа и строкой («ORD-…· строка 1»).
    if (item.type === 'order-amendment-response' && item.detail?.orderId && typeof objectReference === 'function') {
      return `${objectReference(item.detail.orderId)} · ${text('строка', 'line')} ${item.detail.lineNo}`;
    }
    const label = String(item.label ?? '');
    if (label && label === String(item.entityId) && typeof objectReference === 'function') return objectReference(label);
    return label;
  }

  function refreshButton() {
    const button = el('button', { className: 'button secondary', type: 'button', rawText: I18N.t('common.refresh') });
    button.disabled = ui.loading;
    button.addEventListener('click', () => { void refreshCounters(); void loadList(true); });
    return button;
  }

  // Фильтр по типу — выпадающий список из тех типов, где сейчас что-то ждёт: тип без дел в нём
  // не предлагается, потому что выбор пустого типа ничего не показал бы.
  function typeFilter() {
    const wrap = el('label', { className: 'od-filter awaiting-action-type-filter' });
    const select = el('select', { ariaLabel: text('Фильтр по типу', 'Filter by type') });
    select.append(el('option', { value: 'all', rawText: text('Все типы', 'All types') }));
    Object.entries(ui.counts)
      .filter(([, entry]) => entry.count && (ui.group === 'all' || entry.group === ui.group))
      .forEach(([type, entry]) => {
        // Подпись приходит вместе со счётчиком — теми же словами, что заголовок дела в реестре, —
        // поэтому тип из другой семьи или ещё не загруженный не превращается в сырой код.
        const title = entry.titleRu ? text(entry.titleRu, entry.titleEn || entry.titleRu) : type;
        select.append(el('option', { value: type, rawText: `${title} (${entry.count})` }));
      });
    select.value = ui.type;
    select.addEventListener('change', () => { ui.type = select.value; void loadList(true); });
    wrap.append(select);
    return wrap;
  }

  function inspector(item) {
    if (!item) return odInspector({ title: text('Выберите дело', 'Select an item') });
    const go = el('button', { className: 'button primary', type: 'button', rawText: text('Перейти', 'Open') });
    go.addEventListener('click', () => open(item));
    const rows = [
      [text('Что сделать', 'What to do'), itemTitle(item)],
      [text('Объект', 'Object'), labelOf(item)],
      [text('Ждёт', 'Waiting'), `${ageLabel(item.ageSeconds)} · ${formatDate(item.waitingSince)}`],
    ];
    const detail = detailLine(item);
    if (detail) rows.push([text('Подробности', 'Details'), detail]);
    if (item.dueAt) rows.push([text('Срок', 'Due'), `${formatDate(item.dueAt)} · ${dueLabel(item)}`]);
    return odInspector({
      title: labelOf(item),
      subtitle: itemTitle(item),
      status: item.overdue ? 'overdue' : '',
      content: [odMiniTable([text('Условие', 'Term'), text('Значение', 'Value')], rows)],
      actions: [go],
    });
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  function renderScreen() {
    // Возврат на экран: пока человек был на другом, дело могли сделать (его же рукой на экране-владельце),
    // и показанный ранее список врёт. Список перечитывается при каждом входе на экран.
    if (ui.away) { ui.away = false; ui.items = []; ui.loadedKey = ''; }
    if (ui.error) return odPage(text('Ждёт вас', 'Awaiting you'), null, notice(ui.error, 'error'));
    // Какая вкладка открыта — решает пользователь, но список нужной группы приходит с сервера:
    // фильтр на клиенте потерял бы дела, не поместившиеся в страницу.
    const tabs = [{ id: 'all', label: `${text('Все', 'All')} (${ui.total})` }];
    Object.entries(GROUPS).forEach(([group, [ru, en]]) => {
      const count = groupCount(group);
      if (count) tabs.push({ id: group, label: `${text(ru, en)} (${count})` });
    });
    const wanted = (OD_UI.tabs['awaiting-action'] && tabs.some((tab) => tab.id === OD_UI.tabs['awaiting-action'])) ? OD_UI.tabs['awaiting-action'] : 'all';
    if (wanted !== ui.group) { ui.group = wanted; ui.type = 'all'; }
    queueMicrotask(() => { void loadList(false); });
    const header = odHeader('awaiting-action', tabs, [
      { label: text('Ждёт вас', 'Awaiting you'), value: ui.total, detail: text('ход за вами', 'the move is yours') },
      { label: text('Просрочено', 'Overdue'), value: ui.overdue, detail: text('срок уже прошёл', 'deadline passed'), tone: ui.overdue ? 'danger' : '' },
    ], [], null, (() => { const box = el('div', { className: 'row' }); box.append(typeFilter(), refreshButton()); return box; })());
    // «Ничего не ждёт» — утверждение, и оно верно только после чтения: до первого ответа сервера
    // (и пока список этого фильтра ещё не загружен) экран говорит «загрузка», а не «пусто».
    if (!ui.items.length && (ui.loading || ui.loadedKey !== listKey())) return odPage(text('Ждёт вас', 'Awaiting you'), header, empty(I18N.t('common.loading')));
    if (!ui.items.length) return odPage(text('Ждёт вас', 'Awaiting you'), header, empty(text('Сейчас ничего не ждёт вашего действия.', 'Nothing is waiting for your action right now.')));
    const registry = odRegistry({
      scope: 'od-awaiting-action', filterScope: 'awaiting-action', rows: ui.items,
      rowKey: (item) => `${item.type}|${item.entityId}|${item.organisationId}`,
      statusAccessor: (item) => (item.overdue ? 'overdue' : 'open'),
      columns: [
        { key: 'what', label: text('Что сделать', 'What to do'), value: (item) => itemTitle(item) },
        { key: 'object', label: text('Объект', 'Object'), value: (item) => labelOf(item) },
        { key: 'detail', label: text('Подробности', 'Details'), value: detailLine },
        { key: 'age', label: text('Ждёт', 'Waiting'), value: (item) => ageLabel(item.ageSeconds) },
        { key: 'due', label: text('Срок', 'Due'), value: (item) => dueLabel(item) || '—' },
      ],
      inspector,
    });
    return odPage(text('Ждёт вас', 'Awaiting you'), header, registry);
  }

  // Значки живут вне перерисовки экранов: шапка и навигация строятся заново на каждый renderApp,
  // а число приходит асинхронно, поэтому его дорисовывают на месте.
  function paintBadges() {
    document.querySelectorAll('[data-awaiting-action-badge]').forEach((node) => node.remove());
    document.querySelectorAll('[data-awaiting-action-host]').forEach((host) => {
      if (ui.total > 0) host.append(badge(ui.total, ui.overdue > 0));
      host.setAttribute('aria-label', ui.total > 0 ? `${text('Ждёт вас', 'Awaiting you')}: ${ui.total}` : text('Ждёт вас', 'Awaiting you'));
    });
  }

  function installTopbarButton() {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || actions.querySelector('[data-awaiting-action-host="topbar"]')) return;
    const button = el('button', { className: 'topbar-icon-button awaiting-action-button', type: 'button', title: text('Ждёт вас', 'Awaiting you'), ariaLabel: text('Ждёт вас', 'Awaiting you') });
    button.dataset.awaitingActionHost = 'topbar';
    button.append(icon('tasks'));
    button.addEventListener('click', () => { state.view = VIEW; renderApp(); });
    actions.prepend(button);
  }

  function installNavigation() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.querySelector(`[data-view="${VIEW}"]`)) return;
    const active = state.view === VIEW;
    const label = text('Ждёт вас', 'Awaiting you');
    const group = el('section', { className: 'od-v7-nav-group' });
    const button = el('button', { className: `nav-item ${active ? 'active' : ''}`.trim(), type: 'button', title: label, ariaPressed: active ? 'true' : 'false' });
    button.dataset.view = VIEW;
    button.dataset.awaitingActionHost = 'nav';
    button.append(icon('tasks'), el('span', { className: 'nav-label', rawText: label }));
    button.addEventListener('click', () => { state.view = VIEW; renderApp(); });
    group.append(button);
    nav.prepend(group);
  }

  function ensureLifecycle() {
    const id = actorId();
    if (!id) {
      if (ui.timer) { clearInterval(ui.timer); ui.timer = null; }
      if (ui.checkedFor) Object.assign(ui, { total: 0, overdue: 0, counts: {}, countsLoaded: false, items: [], loadedKey: '', error: '', checkedFor: null, group: 'all', type: 'all', away: true });
      return;
    }
    if (state.view !== VIEW) ui.away = true;
    if (ui.checkedFor !== `${id}|${sourcesKey()}` && !ui.inflight) queueMicrotask(() => { void refreshCounters(); });
    if (!ui.timer) ui.timer = setInterval(() => { if (!document.hidden) void refreshCounters(); }, POLL_MS);
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    ensureLifecycle();
    const result = previousRenderApp(...args);
    if (actorId()) {
      installNavigation();
      installTopbarButton();
      paintBadges();
    }
    return result;
  };

  // Заголовок и путь страницы берутся из таблицы пунктов навигации, а этого экрана в ней нет: его
  // кнопку дорисовывает сам этот модуль уже после того, как страница собрана, — поэтому на
  // заглавном месте стояло «Обзор», запасное имя для любого неизвестного вида.
  if (typeof viewTitle === 'function') {
    const previousViewTitle = viewTitle;
    viewTitle = (view) => (view === VIEW ? text('Ждёт вас', 'Awaiting you') : previousViewTitle(view));
  }
  if (typeof viewSectionName === 'function') {
    const previousViewSectionName = viewSectionName;
    viewSectionName = (view) => (view === VIEW ? text('Операционное управление', 'Operations') : previousViewSectionName(view));
  }

  const previousRenderView = renderView;
  renderView = (...args) => (state.view === VIEW ? renderScreen() : previousRenderView(...args));

  // Сделанный ход убирает пункт: после любой успешной записи (`api()` сообщает о ней событием
  // `syntha:mutated`, откуда бы запись ни пришла) счётчик и список перечитываются, чтобы значок и
  // таблица не показывали уже выполненное до ближайшего опроса.
  let mutationTimer = null;
  function onMutated() {
    if (!actorId()) return;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      void refreshCounters({ force: true });
      if (state.view === VIEW) void loadList(true);
    }, 400);
  }
  if (typeof global.addEventListener === 'function') global.addEventListener('syntha:mutated', onMutated);

  global.SynthaAwaitingAction.refresh = async () => {
    await refreshCounters();
    if (state.view === VIEW) await loadList(true);
  };
})(window);
