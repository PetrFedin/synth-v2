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
  // «Ждёт вас» — экран самого портала для поставщика: список дел по его гранту, а не пустой экран брендового реестра.
  const AWAITING_VIEW = 'awaiting-action';

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

  // What the grant lets this person do is stated by the server on the supplier list, and the server checks
  // it again on every command. The screen shows an action only when it is both allowed and meaningful
  // for the state the brand has put the request or the order in.
  const CAP = { quote: 'supplier-portal.quote.submit', accept: 'supplier-portal.counter.accept', confirm: 'supplier-portal.order.confirm' };
  function can(supplierCode, capability) {
    return ui.suppliers.some((item) => item.supplierCode === supplierCode && (item.capabilities || []).includes(capability));
  }

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
    { view: RFQ_VIEW, icon: 'selections', ru: 'Запросы на квотирование', en: 'Requests for quotation' },
    { view: ORDER_VIEW, icon: 'orders', ru: 'Заказы', en: 'Orders' },
  ];

  // Somebody who belongs to no organisation is not a brand user with two extra screens. Leaving the
  // brand's registers in their sidebar showed them nothing — every one of those endpoints returns an
  // empty list without a membership — but it showed them the shape of the brand's operation, its
  // vocabulary and its action verbs, on screens that could never do anything. The portal is the whole
  // of their navigation.
  function portalOnly() { return ui.suppliers.length > 0 && !(state.workspace?.memberships || []).length; }

  // Поставщик не состоит ни в одной организации, и шапка писала «организация не назначена» — хотя
  // название у него есть: это поставщик, на которого выдан грант. Показывается оно (а у держателя
  // нескольких грантов — первое, остальные в меню).
  function nameSupplierInTopbar() {
    if (!portalOnly()) return;
    const names = ui.suppliers.map((item) => item.legalName || item.supplierCode).filter(Boolean);
    if (!names.length) return;
    document.querySelectorAll('.topbar-organisation').forEach((chip) => {
      const label = [...chip.children].find((node) => node.tagName === 'SPAN' && !node.classList.contains('icon') && !node.querySelector('svg'));
      if (label && label.textContent !== names[0]) label.textContent = names[0];
      chip.querySelectorAll('.topbar-menu-list').forEach((list) => {
        if (list.dataset.supplierNames === names.join('|')) return;
        list.dataset.supplierNames = names.join('|');
        list.replaceChildren(...ui.suppliers.map((item) => {
          const row = el('div', { className: 'topbar-menu-item' });
          row.append(el('strong', { rawText: item.legalName || item.supplierCode }), el('small', { rawText: item.brandName || '' }));
          return row;
        }));
      });
    });
  }

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
    // The quotation carries no currency of its own: every amount is in the currency of the request, the
    // one the brand reads it in. Saying so beside the price is what keeps «9,80 €» from being read as a
    // supplier-currency figure that somebody converted.
    const rows = [[text('Цена за единицу', 'Unit price'), formatMoney(quote.unitPriceMinor, currency)]];
    if (currency) rows.push([text('Валюта запроса', 'Request currency'), currency]);
    if (Number.isInteger(quote.fixedCostMinor)) rows.push([text('Постоянные затраты', 'Fixed cost'), formatMoney(quote.fixedCostMinor, currency)]);
    if (quote.leadTimeDays) rows.push([text('Срок производства, дней', 'Lead time, days'), String(quote.leadTimeDays)]);
    if (quote.minimumOrderQuantity) rows.push([text('Минимальная партия', 'Minimum order'), String(quote.minimumOrderQuantity)]);
    if (quote.validUntil) rows.push([text('Действует до', 'Valid until'), formatDate(quote.validUntil)]);
    (quote.tiers || []).forEach((tier) => {
      rows.push([text(`Ступень от ${tier.quantity} шт.`, `Tier from ${tier.quantity} units`), formatMoney(tier.unitPriceMinor, currency)]);
    });
    if (quote.counterOffer) {
      // An accepted counter-offer is no longer an offer: its terms replaced the quotation, so the row says
      // it was accepted and when, instead of keeping the wording of something still awaiting an answer.
      const accepted = Boolean(quote.counterOffer.acceptedAt);
      rows.push([accepted ? text('Встречное предложение бренда: принято', 'Brand counter-offer: accepted') : text('Встречное предложение бренда', 'Brand counter-offer'),
        `${formatMoney(quote.counterOffer.unitPriceMinor, currency)} · ${quote.counterOffer.quantity} ${text('шт.', 'units')}${accepted ? ` · ${text('принято', 'accepted')} ${formatDate(quote.counterOffer.acceptedAt)}` : ''}`]);
    }
    return rows;
  }

  // The portal prints money as "52,00 €", so a person types 52,00; a comma is a decimal separator and
  // spaces group thousands. Amounts go to the server as integer minor units.
  function decimalToMinor(value) {
    const normalized = String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(text('Укажите сумму, например 52,00 или 52.', 'Enter an amount, for example 52,00 or 52.'));
    const [whole, fraction = ''] = normalized.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }
  function minorToInput(minor) { return Number.isInteger(minor) ? `${Math.floor(minor / 100)},${String(minor % 100).padStart(2, '0')}` : ''; }
  function localInput(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function isoFromLocal(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error(text('Укажите дату.', 'Enter a date.'));
    return date.toISOString();
  }

  // The three answers a supplier can give for itself. Each posts to its own portal route, which runs the
  // same domain function the brand's command runs; the screen then re-reads the portal lists, because a
  // command answers with the supplier's own receipt and not with the aggregate.
  async function answer(path, body) {
    const receipt = await mutate(path, body);
    await load(false);
    return receipt;
  }

  function openQuoteForm(item) {
    const own = item.ownQuote;
    // Котировка своей валюты не несёт: все суммы — в валюте запроса. Валюта стоит в подписи поля и в
    // итоге ниже, до отправки, а не появляется только в карточке после неё.
    const currency = typeof item.currency === 'string' && item.currency ? item.currency.toUpperCase() : '';
    const inCurrency = (ru, en) => (currency ? `${text(ru, en)}, ${currency}` : text(ru, en));
    openForm(own ? text('Обновить котировку', 'Revise quotation') : text('Отправить котировку', 'Submit quotation'), [
      textDef('unitPrice', inCurrency('Цена за единицу', 'Unit price'), minorToInput(own?.unitPriceMinor), 20),
      textDef('fixedCost', inCurrency('Постоянные затраты', 'Fixed cost'), own ? minorToInput(own.fixedCostMinor) : '0', 20),
      numberDef('leadTimeDays', text('Срок производства, дней', 'Lead time, days'), own?.leadTimeDays ?? '', true, 1, 730),
      numberDef('minimumOrderQuantity', text('Минимальная партия', 'Minimum order'), own?.minimumOrderQuantity ?? '', true, 1),
      dateTimeDef('validUntil', text('Действует до', 'Valid until'), localInput(own?.validUntil || new Date(Date.now() + 21 * 86400000).toISOString())),
      optionalTextDef('notes', text('Комментарий', 'Notes'), own?.notes || '', 1000),
    ], async (values) => {
      await answer(`/v2/supplier-portal/rfqs/${encodeURIComponent(item.rfqCode)}/quote`, {
        expectedVersion: item.version,
        supplierCode: item.supplierCode,
        unitPriceMinor: decimalToMinor(values.unitPrice),
        fixedCostMinor: decimalToMinor(values.fixedCost),
        leadTimeDays: values.leadTimeDays,
        minimumOrderQuantity: values.minimumOrderQuantity,
        validUntil: isoFromLocal(values.validUntil),
        notes: String(values.notes || '').trim() || null,
        tiers: [],
      });
    });
    attachQuoteTotal(item, currency);
  }

  // Итог по котировке до отправки: цена × количество запроса + постоянные затраты, в валюте запроса.
  // Форма принадлежит общему диалогу, поэтому строка добавляется в уже построенную форму и
  // пересчитывается по вводу; при неверной сумме остаётся подсказка о валюте, а не пустота.
  function attachQuoteTotal(item, currency) {
    const form = document.querySelector('#form-dialog form');
    const unit = form?.querySelector('[name="unitPrice"]');
    const fixed = form?.querySelector('[name="fixedCost"]');
    if (!form || !unit || !fixed) return;
    const quantity = Number.isInteger(item.targetQuantity) ? item.targetQuantity : 0;
    const line = document.createElement('p');
    line.className = 'muted quote-total';
    const refresh = () => {
      try {
        const total = decimalToMinor(unit.value) * quantity + decimalToMinor(fixed.value || '0');
        line.textContent = quantity
          ? text(`Итого на ${quantity} шт. в валюте запроса: ${formatMoney(total, currency)}`, `Total for ${quantity} units in the request currency: ${formatMoney(total, currency)}`)
          : text(`Валюта запроса: ${currency}`, `Request currency: ${currency}`);
      } catch {
        line.textContent = currency ? text(`Валюта запроса: ${currency}. Итог появится, когда цена будет введена.`, `Request currency: ${currency}. The total appears once the price is entered.`) : '';
      }
    };
    unit.addEventListener('input', refresh);
    fixed.addEventListener('input', refresh);
    refresh();
    form.insertBefore(line, form.querySelector('.dialog-actions'));
  }

  async function acceptCounterOffer(item) {
    const counter = item.ownQuote.counterOffer;
    const accepted = await confirmAction({
      title: text('Принять встречное предложение', 'Accept the counter-offer'),
      question: text(
        `Цена за единицу станет ${formatMoney(counter.unitPriceMinor, item.currency)} на ${counter.quantity} шт. Ваша котировка будет заменена этими условиями.`,
        `The unit price becomes ${formatMoney(counter.unitPriceMinor, item.currency)} for ${counter.quantity} units. Your quotation is replaced by these terms.`,
      ),
      confirmLabel: text('Принять', 'Accept'),
    });
    if (!accepted) return;
    try {
      await answer(`/v2/supplier-portal/rfqs/${encodeURIComponent(item.rfqCode)}/counter-offer/accept`, { expectedVersion: item.version, supplierCode: item.supplierCode });
      toastDone('встречное предложение принято.', 'the counter-offer is accepted.');
    } catch (error) { toast(error?.message || I18N.t('common.requestError'), 'error'); }
    renderApp();
  }

  function openConfirmOrderForm(item) {
    openForm(text('Подтвердить заказ', 'Confirm the order'), [
      textDef('confirmationReference', text('Номер подтверждения', 'Confirmation reference'), '', 120, true, 2),
      optionalTextDef('notes', text('Комментарий', 'Notes'), '', 2000),
    ], async (values) => {
      await answer(`/v2/supplier-portal/orders/${encodeURIComponent(item.productionOrderNumber)}/confirm`, {
        expectedVersion: item.version,
        supplierCode: item.supplierCode,
        confirmationReference: values.confirmationReference.trim(),
        notes: String(values.notes || '').trim() || null,
      });
    });
  }

  function actionButton(labelText, className, onclick) {
    const button = el('button', { className: `button ${className}`, type: 'button', text: labelText });
    button.addEventListener('click', onclick);
    return button;
  }

  function rfqActions(item) {
    const own = item.ownQuote;
    const actions = [];
    const open = item.supplierStatus === 'awaiting_quote' || item.supplierStatus === 'quote_submitted';
    if (open && can(item.supplierCode, CAP.quote)) {
      actions.push(actionButton(own ? text('Обновить котировку', 'Revise quotation') : text('Отправить котировку', 'Submit quotation'), 'primary', () => openQuoteForm(item)));
    }
    const counter = own?.counterOffer;
    const answerable = counter && !counter.acceptedAt && counter.answersQuoteRevision === own.revision && counter.quantity === item.targetQuantity;
    if (item.supplierStatus === 'quote_submitted' && answerable && can(item.supplierCode, CAP.accept)) {
      actions.push(actionButton(text('Принять встречное предложение', 'Accept counter-offer'), 'secondary', () => { void acceptCounterOffer(item); }));
    }
    return actions;
  }

  function orderActions(item) {
    return item.status === 'issued' && can(item.supplierCode, CAP.confirm)
      ? [actionButton(text('Подтвердить заказ', 'Confirm the order'), 'primary', () => openConfirmOrderForm(item))]
      : [];
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
      : notice(can(item.supplierCode, CAP.quote)
        ? text('Котировка ещё не отправлена. Отправьте условия кнопкой ниже.', 'No quotation submitted yet. Submit your terms with the button below.')
        : text('Котировка ещё не отправлена. Пришлите условия менеджеру бренда — они появятся здесь.', 'No quotation submitted yet. Send your terms to the brand and they will appear here.')));
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
      actions: rfqActions(item),
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
      content.push(notice(item.status === 'issued' && can(item.supplierCode, CAP.confirm)
        ? text('Заказ ещё не подтверждён. Подтвердите его кнопкой ниже.', 'This order is not confirmed yet. Confirm it with the button below.')
        : text('Заказ ещё не подтверждён. Подтверждение принимает менеджер бренда после вашего согласия.', 'This order is not confirmed yet. The brand records the confirmation once you accept it.')));
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
      actions: orderActions(item),
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
    if (ui.error) return odPage(text('Запросы на квотирование', 'Requests for quotation'), null, notice(ui.error, 'error'));
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
    return odPage(text('Запросы на квотирование', 'Requests for quotation'), header, registry);
  }

  function renderOrders() {
    ensureLoaded();
    if (ui.error) return odPage(text('Заказы', 'Orders'), null, notice(ui.error, 'error'));
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
    return odPage(text('Заказы', 'Orders'), header, registry);
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    const actorId = state.user?.actorId || state.user?.id || null;
    if (actorId && ui.checkedFor !== actorId && !ui.checking) queueMicrotask(() => { void detectAccess(actorId); });
    // A portal-only account has no workspace to land on, so the first screen is the first thing
    // addressed to them rather than a brand dashboard with every tile at zero.
    if (portalOnly() && state.view !== RFQ_VIEW && state.view !== ORDER_VIEW && state.view !== AWAITING_VIEW) state.view = RFQ_VIEW;
    const result = previousRenderApp(...args);
    appendNavigation();
    nameSupplierInTopbar();
    return result;
  };

  // «Перейти» из «Ждёт вас»: экран портала перечитывается и выбирает запись по коду запроса или заказа.
  global.SynthaViewRefresh?.register([RFQ_VIEW, ORDER_VIEW], () => load(false));
  global.SynthaViewRefresh?.registerTarget(RFQ_VIEW, (route) => { global.SynthaViewRefresh.clearRegistryFilters('supplier-portal-rfqs'); OD_UI.selected['od-supplier-portal-rfqs'] = route.entityId; });
  global.SynthaViewRefresh?.registerTarget(ORDER_VIEW, (route) => { global.SynthaViewRefresh.clearRegistryFilters('supplier-portal-orders'); OD_UI.selected['od-supplier-portal-orders'] = route.entityId; });

  const previousRenderView = renderView;
  renderView = (...args) => {
    if (state.view === RFQ_VIEW) return renderRfqs();
    if (state.view === ORDER_VIEW) return renderOrders();
    return previousRenderView(...args);
  };
})(window);
