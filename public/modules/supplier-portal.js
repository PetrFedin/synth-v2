(function installSupplierPortal(global) {
  'use strict';

  // The other side of the table. Everything a brand knows about a season sits in one database, and the
  // factory it asks for a price has to be able to read the part addressed to them without being able to
  // read anything else. These two screens are that part: the requests this supplier was invited to, and
  // the orders placed with them.
  //
  // The navigation group is added only once the server confirms this account holds portal access. A
  // brand's own staff never see it, which is the point: the portal is not a view of the brand's data
  // with some columns removed, it is a different standing.
  const ui = global.SynthaSupplierPortal || (global.SynthaSupplierPortal = {
    suppliers: [], checkedFor: null, checking: false, installed: false,
    rfqs: [], orders: [], loadedRfqs: false, loadedOrders: false, loading: false, error: '',
  });

  const RFQ_VIEW = 'supplier-portal-rfqs';
  const ORDER_VIEW = 'supplier-portal-orders';

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }

  const SUPPLIER_STATUS = {
    awaiting_quote: ['Ждёт котировки', 'Awaiting quote'],
    quote_submitted: ['Котировка отправлена', 'Quote submitted'],
    won: ['Заказ за вами', 'Awarded to you'],
    lost: ['Выбран другой поставщик', 'Awarded elsewhere'],
    cancelled: ['Запрос отменён', 'Request cancelled'],
  };
  const ORDER_STATUS = {
    issued: ['Передан на производство', 'Issued'],
    confirmed: ['Подтверждён', 'Confirmed'],
    cancelled: ['Отменён', 'Cancelled'],
  };

  function label(table, key) { const pair = table[key]; return pair ? text(pair[0], pair[1]) : (key || '—'); }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  function formatMoney(minor, currency) {
    if (!Number.isInteger(minor)) return '—';
    return I18N.formatMoney(minor, currency || 'EUR', { minor: true });
  }

  // A deadline a supplier has already missed is the one number on this screen they act on, so it is
  // said in days rather than left as a date to subtract in your head.
  function dueIn(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
    if (days < 0) return text(`просрочено на ${Math.abs(days)} дн.`, `${Math.abs(days)} days overdue`);
    if (days === 0) return text('сегодня', 'today');
    return text(`через ${days} дн.`, `in ${days} days`);
  }

  // Access is a fact about the person who signed in, so it is checked once they have. Asking at module
  // load meant asking before the login form had been filled in: the answer was always "not signed in",
  // and the portal never appeared for the account that actually held it.
  async function detectAccess(actorId) {
    if (ui.checking || ui.checkedFor === actorId) return;
    ui.checking = true;
    try {
      const result = await api('/v2/supplier-portal/suppliers');
      ui.suppliers = result.items || [];
      ui.checkedFor = actorId;
      if (ui.suppliers.length) renderApp();
    } catch (error) {
      // An account with no portal access is the ordinary case, not a failure worth shouting about.
      ui.checkedFor = actorId;
    } finally {
      ui.checking = false;
    }
  }

  // The navigation is a frozen structure, and deliberately so: for a brand's own staff it is the same
  // sidebar every time. The portal is not another item in it but a different standing, so the group is
  // appended to the rendered navigation instead of being pushed into the shared definition.
  const PORTAL_ITEMS = [
    { view: RFQ_VIEW, icon: 'selections', ru: 'Запрос на квотирование', en: 'Request for quotation' },
    { view: ORDER_VIEW, icon: 'orders', ru: 'Заказ', en: 'Order' },
  ];

  // Somebody who belongs to no organisation is not a brand user with two extra screens. Leaving the
  // brand's registers in their sidebar showed them nothing — every one of those endpoints returns an
  // empty list without a membership — but it showed them the shape of the brand's operation, its
  // vocabulary and its action verbs, on screens that could never do anything. The portal is the whole
  // of their navigation.
  function portalOnly() { return ui.suppliers.length > 0 && !(state.workspace?.memberships || []).length; }

  function appendNavigation() {
    if (!ui.suppliers.length) return;
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return;
    if (portalOnly()) nav.replaceChildren();
    else if (nav.querySelector('[data-view="' + RFQ_VIEW + '"]')) return;
    const group = el('section', { className: 'od-v7-nav-group' });
    group.append(el('div', { className: 'nav-group-label', rawText: text('ПОРТАЛ ПОСТАВЩИКА', 'SUPPLIER PORTAL') }));
    PORTAL_ITEMS.forEach((item) => {
      const active = state.view === item.view;
      const label = text(item.ru, item.en);
      const button = el('button', {
        className: `nav-item ${active ? 'active' : ''}`.trim(),
        type: 'button', title: label, ariaPressed: active ? 'true' : 'false',
      });
      button.dataset.view = item.view;
      button.append(icon(item.icon), el('span', { className: 'nav-label', rawText: label }));
      button.addEventListener('click', () => { state.view = item.view; renderApp(); });
      group.append(button);
    });
    nav.append(group);
    ui.installed = true;
  }

  async function load(force) {
    if (ui.loading) return;
    ui.loading = true; ui.error = '';
    try {
      const [rfqs, orders] = await Promise.all([
        api('/v2/supplier-portal/rfqs?limit=200'),
        api('/v2/supplier-portal/orders?limit=200'),
      ]);
      ui.rfqs = rfqs.items || [];
      ui.orders = orders.items || [];
      ui.loadedRfqs = true; ui.loadedOrders = true;
      if (force) toast(text('Данные обновлены.', 'Data refreshed.'), 'success');
    } catch (error) {
      ui.error = error?.message || I18N.t('common.requestError');
    } finally {
      ui.loading = false;
      if (state.view === RFQ_VIEW || state.view === ORDER_VIEW) renderApp();
    }
  }

  function ensureLoaded() {
    if (!ui.loadedRfqs && !ui.loading && !ui.error) queueMicrotask(() => { void load(false); });
  }

  function quoteRows(quote, currency) {
    if (!quote) return [];
    const rows = [[text('Цена за единицу', 'Unit price'), formatMoney(quote.unitPriceMinor, currency)]];
    if (Number.isInteger(quote.fixedCostMinor)) rows.push([text('Постоянные затраты', 'Fixed cost'), formatMoney(quote.fixedCostMinor, currency)]);
    if (quote.leadTimeDays) rows.push([text('Срок производства, дней', 'Lead time, days'), String(quote.leadTimeDays)]);
    if (quote.minimumOrderQuantity) rows.push([text('Минимальная партия', 'Minimum order'), String(quote.minimumOrderQuantity)]);
    if (quote.validUntil) rows.push([text('Действует до', 'Valid until'), formatDate(quote.validUntil)]);
    (quote.tiers || []).forEach((tier) => {
      rows.push([text(`Ступень от ${tier.quantity} шт.`, `Tier from ${tier.quantity} units`), formatMoney(tier.unitPriceMinor, currency)]);
    });
    if (quote.counterOffer) {
      rows.push([text('Встречное предложение бренда', 'Brand counter-offer'),
        `${formatMoney(quote.counterOffer.unitPriceMinor, currency)} · ${quote.counterOffer.quantity} ${text('шт.', 'units')}`]);
    }
    return rows;
  }

  function rfqInspector(item) {
    if (!item) return odInspector({ title: text('Выберите запрос', 'Select a request') });
    const content = [];
    const own = item.ownQuote;
    content.push(odMiniTable(
      [text('Условие', 'Term'), text('Значение', 'Value')],
      [
        [text('Бренд', 'Brand'), item.brandName || item.brandId],
        [text('Количество', 'Quantity'), String(item.targetQuantity)],
        [text('Ответ до', 'Response due'), `${formatDate(item.responseDueAt)} · ${dueIn(item.responseDueAt)}`],
        [text('Поставка до', 'Delivery due'), formatDate(item.deliveryDueAt)],
        ['Incoterm', item.incoterm || '—'],
        [text('Образец запрошен', 'Sample requested'), item.sampleRequested ? text('Да', 'Yes') : text('Нет', 'No')],
        [text('Технический пакет', 'Tech pack'), item.techPackCode || '—'],
      ],
    ));
    content.push(own
      ? odMiniTable([text('Ваша котировка', 'Your quotation'), ''], quoteRows(own, item.currency))
      : notice(text(
        'Котировка ещё не отправлена. Пришлите условия менеджеру бренда — они появятся здесь.',
        'No quotation submitted yet. Send your terms to the brand and they will appear here.',
      )));
    if (item.notes) content.push(notice(item.notes));
    return odInspector({
      title: item.rfqCode,
      subtitle: item.productName || item.sku,
      status: item.supplierStatus,
      fields: [
        { label: text('Статус', 'Status'), value: label(SUPPLIER_STATUS, item.supplierStatus) },
        { label: text('Количество', 'Quantity'), value: String(item.targetQuantity) },
        { label: text('Ответ до', 'Response due'), value: formatDate(item.responseDueAt) },
        { label: 'SKU', value: item.sku },
      ],
      content,
    });
  }

  function orderInspector(item) {
    if (!item) return odInspector({ title: text('Выберите заказ', 'Select an order') });
    const commercial = item.commercial || {};
    const content = [odMiniTable(
      [text('Условие', 'Term'), text('Значение', 'Value')],
      [
        [text('Бренд', 'Brand'), item.brandName || item.brandId],
        [text('Запрос цен', 'Request'), item.rfqCode],
        [text('Количество', 'Quantity'), String(item.quantity)],
        [text('Старт производства', 'Production start'), formatDate(item.productionStartAt)],
        [text('Поставка до', 'Delivery due'), `${formatDate(item.deliveryDueAt)} · ${dueIn(item.deliveryDueAt)}`],
        [text('Цена за единицу', 'Unit price'), formatMoney(commercial.unitPriceMinor, commercial.currency)],
        [text('Технический пакет', 'Tech pack'), item.techPackCode || '—'],
        [text('Подтверждение техпакета', 'Tech pack acknowledgement'), item.techPackAcknowledgement || '—'],
      ],
    )];
    if (item.confirmation) {
      content.push(odMiniTable([text('Подтверждение', 'Confirmation'), ''], [
        [text('Подтверждён', 'Confirmed'), formatDate(item.confirmedAt)],
        [text('Комментарий', 'Notes'), item.confirmation.notes || '—'],
      ]));
    } else {
      content.push(notice(text(
        'Заказ ещё не подтверждён. Подтверждение принимает менеджер бренда после вашего согласия.',
        'This order is not confirmed yet. The brand records the confirmation once you accept it.',
      )));
    }
    return odInspector({
      title: item.productionOrderNumber,
      subtitle: item.productName || item.sku,
      status: item.status,
      fields: [
        { label: text('Статус', 'Status'), value: label(ORDER_STATUS, item.status) },
        { label: text('Количество', 'Quantity'), value: String(item.quantity) },
        { label: text('Поставка до', 'Delivery due'), value: formatDate(item.deliveryDueAt) },
        { label: 'SKU', value: item.sku },
      ],
      content,
    });
  }

  function refreshAction() {
    const button = el('button', { className: 'button secondary', type: 'button', text: I18N.t('common.refresh') });
    button.disabled = ui.loading;
    button.addEventListener('click', () => { void load(true); });
    return button;
  }

  function renderRfqs() {
    ensureLoaded();
    if (ui.error) return odPage(text('Запрос на квотирование', 'Request for quotation'), null, notice(ui.error, 'error'));
    const rows = ui.rfqs;
    const open = rows.filter((item) => item.supplierStatus === 'awaiting_quote');
    const header = odHeader('supplier-portal-rfqs', [
      { id: 'all', label: text('Все запросы', 'All requests') },
    ], [
      { label: text('Ждут ответа', 'Awaiting your answer'), value: open.length, detail: text('котировка не отправлена', 'no quotation sent') },
      { label: text('Отправлено', 'Submitted'), value: rows.filter((item) => item.supplierStatus === 'quote_submitted').length, detail: text('ждут решения бренда', 'awaiting the brand') },
      { label: text('Выиграно', 'Won'), value: rows.filter((item) => item.supplierStatus === 'won').length, detail: text('заказ за вами', 'awarded to you') },
    ], Object.keys(SUPPLIER_STATUS), text('Поиск запроса', 'Search a request'), refreshAction());

    const registry = odRegistry({
      scope: 'od-supplier-portal-rfqs', filterScope: 'supplier-portal-rfqs', rows, rowKey: (item) => item.rfqCode,
      statusAccessor: (item) => item.supplierStatus,
      columns: [
        { key: 'rfqCode', label: text('Запрос', 'Request'), value: (item) => item.rfqCode },
        { key: 'brand', label: text('Бренд', 'Brand'), value: (item) => item.brandName || item.brandId },
        { key: 'product', label: text('Изделие', 'Product'), value: (item) => item.productName || item.sku },
        { key: 'quantity', label: text('Количество', 'Quantity'), value: (item) => item.targetQuantity },
        { key: 'due', label: text('Ответ до', 'Response due'), value: (item) => `${formatDate(item.responseDueAt)} · ${dueIn(item.responseDueAt)}` },
        { key: 'status', label: text('Статус', 'Status'), value: (item) => label(SUPPLIER_STATUS, item.supplierStatus) },
      ],
      inspector: rfqInspector,
    });
    return odPage(text('Запрос на квотирование', 'Request for quotation'), header, registry);
  }

  function renderOrders() {
    ensureLoaded();
    if (ui.error) return odPage(text('Заказ', 'Order'), null, notice(ui.error, 'error'));
    const rows = ui.orders;
    const header = odHeader('supplier-portal-orders', [
      { id: 'all', label: text('Все заказы', 'All orders') },
    ], [
      { label: text('В работе', 'In progress'), value: rows.filter((item) => item.status !== 'cancelled').length, detail: text('размещено с вами', 'placed with you') },
      { label: text('Ждут подтверждения', 'Awaiting confirmation'), value: rows.filter((item) => item.status === 'issued').length, detail: text('передано на производство', 'issued to production') },
      { label: text('Единиц', 'Units'), value: rows.reduce((sum, item) => sum + (item.quantity || 0), 0), detail: text('всего в заказах', 'across all orders') },
    ], Object.keys(ORDER_STATUS), text('Поиск заказа', 'Search an order'), refreshAction());

    const registry = odRegistry({
      scope: 'od-supplier-portal-orders', filterScope: 'supplier-portal-orders', rows, rowKey: (item) => item.productionOrderNumber,
      statusAccessor: (item) => item.status,
      columns: [
        { key: 'number', label: text('Заказ', 'Order'), value: (item) => item.productionOrderNumber },
        { key: 'brand', label: text('Бренд', 'Brand'), value: (item) => item.brandName || item.brandId },
        { key: 'product', label: text('Изделие', 'Product'), value: (item) => item.productName || item.sku },
        { key: 'quantity', label: text('Количество', 'Quantity'), value: (item) => item.quantity },
        { key: 'delivery', label: text('Поставка до', 'Delivery due'), value: (item) => `${formatDate(item.deliveryDueAt)} · ${dueIn(item.deliveryDueAt)}` },
        { key: 'status', label: text('Статус', 'Status'), value: (item) => label(ORDER_STATUS, item.status) },
      ],
      inspector: orderInspector,
    });
    return odPage(text('Заказ', 'Order'), header, registry);
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    const actorId = state.user?.actorId || state.user?.id || null;
    if (actorId && ui.checkedFor !== actorId && !ui.checking) queueMicrotask(() => { void detectAccess(actorId); });
    // A portal-only account has no workspace to land on, so the first screen is the first thing
    // addressed to them rather than a brand dashboard with every tile at zero.
    if (portalOnly() && state.view !== RFQ_VIEW && state.view !== ORDER_VIEW) state.view = RFQ_VIEW;
    const result = previousRenderApp(...args);
    appendNavigation();
    return result;
  };

  const previousRenderView = renderView;
  renderView = (...args) => {
    if (state.view === RFQ_VIEW) return renderRfqs();
    if (state.view === ORDER_VIEW) return renderOrders();
    return previousRenderView(...args);
  };
})(window);
