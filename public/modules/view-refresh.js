(function installViewRefresh(global) {
  'use strict';

  // «Открыть экран и дождаться, пока он получит данные». Каждый экран кэширует то, что загрузил
  // (`ui.loaded`), и перечитывает это только по кнопке «Обновить». Для захода из бокового меню этого
  // хватает: первый заход грузит, повторный показывает уже знакомое. Для «Перейти» из «Ждёт вас» — нет:
  // дело в реестре появилось именно потому, что сущность изменилась, а экран-владелец мог открыться
  // раньше и хранить старый (в том числе пустой) список — человек видел «RFQ не найдены», хотя сервер
  // уже отдавал два.
  //
  // Поэтому владелец данных сам говорит, как перечитать экран: `register(views, loader)`. Загрузчик
  // возвращает обещание, которое выполняется, когда данные получены. Один вид может иметь несколько
  // загрузчиков (заказы живут в рабочем пространстве, документы — в своём кэше по организациям).
  const registry = global.SynthaViewRefresh || (global.SynthaViewRefresh = {});
  const loaders = new Map();

  registry.register = (views, loader) => {
    for (const view of [].concat(views)) {
      if (!loaders.has(view)) loaders.set(view, []);
      loaders.get(view).push(loader);
    }
  };

  registry.has = (view) => loaders.has(view);
  registry.views = () => [...loaders.keys()];

  // Все загрузчики вида запускаются сразу, сбой одного не мешает остальным: экран сам покажет
  // ошибку своего чтения, а чужой сбой не должен оставить человека на предыдущем экране.
  registry.refresh = (view) => Promise.allSettled((loaders.get(view) || []).map((loader) => {
    try { return Promise.resolve(loader()); } catch (error) { return Promise.reject(error); }
  }));

  // ---------------------------------------------------------------------------------------------
  // «Выбери запись». Перечитать экран мало: «Перейти» из «Ждёт вас» должно привести к самому делу — к
  // нужной вкладке и к нужной строке, а не к первой строке реестра. Выбор строки и вкладки знает
  // только экран-владелец (у каждого свой ключ строки, своё хранилище выбора, свои фильтры), поэтому
  // он сам регистрирует `registerTarget(views, handler)`: обработчик получает маршрут дела
  // (`{ view, entityId, tab?, parentId?, focus?, dialog? }`) и выбирает запись.
  //
  // Выбор делается ПОСЛЕ чтения, а не до него: многие экраны при перечитывании сбрасывают выбор
  // (`reset()` обнуляет выбранную строку), и выбор, сделанный раньше, терялся — экран открывался на
  // первой строке. Фильтры, которые могли скрыть нужную строку (статус, поиск, ветка иерархии),
  // обработчик снимает сам.
  const targets = new Map();
  registry.registerTarget = (views, handler) => {
    for (const view of [].concat(views)) {
      if (!targets.has(view)) targets.set(view, []);
      targets.get(view).push(handler);
    }
  };
  registry.hasTarget = (view) => targets.has(view);

  // То, что надо сделать после последней отрисовки: открыть диалог записи, подсветить подстроку.
  const afterOpen = [];
  registry.afterOpen = (fn) => { afterOpen.push(fn); };

  registry.applyTarget = async (view, route) => {
    for (const handler of targets.get(view) || []) {
      try { await handler(route); } catch (error) { /* выбор записи — удобство: сбой не должен оставить человека на прошлом экране */ }
    }
  };

  // Сброс фильтров реестра ОДС, которые могли скрыть нужную строку.
  registry.clearRegistryFilters = (filterScope) => {
    try {
      if (OD_UI.filters) delete OD_UI.filters[filterScope];
      if (OD_UI.hierarchyPath) OD_UI.hierarchyPath[filterScope] = [];
    } catch (error) { /* реестр без фильтров нечего сбрасывать */ }
  };

  // Строки рабочего пространства читаются постранично: нужная запись может лежать на странице, которой
  // ещё нет. Дочитывается ровно до неё, не дальше.
  registry.ensureWorkspaceRow = async (section, rows, matches) => {
    const paging = global.SynthaWorkspaceController;
    for (let guard = 0; guard < 40 && !rows().some(matches) && paging && paging.hasMore(section); guard += 1) {
      await paging.loadNext(section);
    }
  };

  // Вкладка панели деталей выбирается по идентификатору, который панель называет сама (`tabs[].id`);
  // `odInspector` читает его при отрисовке.
  registry.wantInspectorTab = (id) => { OD_UI.wantedInspectorTab = id || null; };

  // Кнопка действия панели деталей по подписи — чтобы открыть диалог теми же условиями, что и у
  // человека: если кнопки нет (нет права, не то состояние), диалог не открывается, и экран просто
  // показывает запись.
  registry.clickInspectorAction = (...labels) => {
    const wanted = labels.filter(Boolean).map((value) => String(value).trim().toLowerCase());
    const button = [...document.querySelectorAll('.od-inspector-actions button, .od-inspector button')]
      .find((node) => wanted.includes(String(node.textContent || '').trim().toLowerCase()));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  };

  // Подсветка подстроки (партии, цвета): строка таблицы панели деталей, первая ячейка которой — ключ.
  // Перерисовки (дочитывание партий) стирают подсветку, поэтому она ставится заново, пока человек
  // ничего не тронул.
  let focusKey = null;
  let focusObserver = null;
  function paintFocus() {
    if (!focusKey) return;
    for (const row of document.querySelectorAll('.od-inspector .od-mini-table tbody tr')) {
      const first = row.firstElementChild;
      if (!first || String(first.textContent || '').trim() !== focusKey) continue;
      if (!row.classList.contains('selected')) {
        row.classList.add('selected');
        row.dataset.awaitingFocus = 'true';
        if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
  }
  function stopFocus() {
    focusKey = null;
    if (focusObserver) { focusObserver.disconnect(); focusObserver = null; }
  }
  registry.focusRow = (key) => {
    stopFocus();
    if (!key) return;
    focusKey = String(key);
    paintFocus();
    if (typeof MutationObserver === 'function' && document.body) {
      focusObserver = new MutationObserver(() => paintFocus());
      focusObserver.observe(document.body, { childList: true, subtree: true });
      document.addEventListener('pointerdown', stopFocus, { once: true, capture: true });
    }
  };

  // Загрузка стартует до отрисовки: экран, открытый сразу после, видит `loading`, а не «пусто», и не
  // запускает собственное первое чтение поверх нашего. Выбор записи — после чтения (см. выше).
  registry.open = async (view, route) => {
    stopFocus();
    afterOpen.length = 0;
    registry.wantInspectorTab(route && route.tab ? route.tab : null);
    state.view = view;
    const pending = registry.refresh(view);
    renderApp();
    await pending;
    if (state.view !== view) return;
    if (route) await registry.applyTarget(view, route);
    if (state.view !== view) return;
    renderApp();
    // Выбранная вкладка панели уже запомнена панелью; дальше пусть живёт выбор человека.
    registry.wantInspectorTab(null);
    for (const fn of afterOpen.splice(0)) {
      try { fn(); } catch (error) { /* подсветка и диалог — удобство, не условие перехода */ }
    }
  };

  // Экраны на общем рабочем пространстве (/v2/workspace): заказы, подборки, партнёры, шоурумы.
  registry.register(['orders', 'selections', 'partners', 'showrooms'], () => reload());

  // Выбор записи на тех же экранах (заказы, ассортименты, партнёры, шоурумы). Их реестры ключуются
  // идентификатором сущности (`item.id`), а строки читаются постранично, поэтому нужную запись при
  // необходимости дочитывают, а фильтры, которые могли её скрыть, снимают. Диалог правки заказа и
  // «Отгрузки и приёмки» открывается кнопкой панели деталей — теми же условиями, что у человека.
  async function pick({ tab, tabScope, scope, filterScope, section, rows, id }) {
    OD_UI.tabs[tabScope] = tab;
    registry.clearRegistryFilters(filterScope);
    OD_UI.selected[scope] = id;
    await registry.ensureWorkspaceRow(section, rows, (item) => item.id === id);
  }

  registry.registerTarget('orders', async (route) => {
    // Приёмка, претензия и правка живут внутри заказа: выделяется заказ (`parentId`), а не их собственный идентификатор.
    await pick({ tab: 'orders', tabScope: 'orders', scope: 'od-orders', filterScope: 'orders', section: 'orders', rows: () => state.workspace?.orders || [], id: route.parentId || route.entityId });
    if (route.dialog === 'amendments') registry.afterOpen(() => registry.clickInspectorAction('Изменения', 'Amendments'));
    if (route.dialog === 'fulfilment') registry.afterOpen(() => registry.clickInspectorAction('Отгрузка и приёмка', 'Shipment and receipt'));
  });
  registry.registerTarget('selections', (route) => pick({ tab: 'selections', tabScope: 'selections', scope: 'od-selections', filterScope: 'selections', section: 'selections', rows: () => state.workspace?.selections || [], id: route.entityId }));
  registry.registerTarget('showrooms', (route) => pick({ tab: 'invitations', tabScope: 'showrooms', scope: 'od-invitations', filterScope: 'showrooms', section: 'invitations', rows: () => state.workspace?.invitations || [], id: route.entityId }));
  registry.registerTarget('partners', async (route) => {
    if (route.tab === 'compliance-documents') {
      // Документы лежат не в рабочем пространстве, а в своём кэше по организациям (`compliance-documents.js`).
      OD_UI.tabs.partners = 'compliance-documents';
      registry.clearRegistryFilters('od-compliance-documents');
      OD_UI.selected['od-compliance-documents'] = route.entityId;
      return;
    }
    await pick({ tab: 'relationships', tabScope: 'partners', scope: 'od-relationships', filterScope: 'partners', section: 'relationships', rows: () => state.workspace?.relationships || [], id: route.entityId });
  });
})(window);
