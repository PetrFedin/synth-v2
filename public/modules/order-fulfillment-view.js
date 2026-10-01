(function installOrderFulfillmentView(global) {
  'use strict';

  function text(ru, en) {
    return typeof localText === 'function' ? localText(ru, en) : (I18N?.getLocale?.() === 'en' ? en : ru);
  }
  function row(label, value) { return Object.freeze({ label, value: value === null || value === undefined || value === '' ? '—' : String(value) }); }
  function when(value) { return value ? formatDate(value) : '—'; }
  function place(location) {
    if (!location) return '—';
    return [location.name, location.city, location.countryCode].filter(Boolean).join(', ');
  }
  function packingStatusLabel(status) {
    if (status === 'packing') return text('идёт упаковка', 'packing');
    if (status === 'packed') return text('товары упакованы', 'packed');
    return text('не начата', 'not started');
  }
  function colourLabel(line) {
    const name = I18N?.getLocale?.() === 'en' ? (line.colourNameEn || line.colourNameRu) : (line.colourNameRu || line.colourNameEn);
    if (!name && !line.swatchHex) return '';
    return [name, line.swatchHex].filter(Boolean).join(' · ');
  }

  const CLAIM_RESOLUTIONS = Object.freeze({
    'accepted-for-replacement': ['принята: замена', 'accepted: replacement'],
    'accepted-for-return': ['принята: возврат', 'accepted: return'],
    'accepted-for-credit': ['принята: возмещение', 'accepted: credit'],
    'accepted-as-is': ['принята как есть', 'accepted as is'],
    rejected: ['отклонена', 'rejected'],
  });
  const CLAIM_REMEDIES = Object.freeze({
    replacement: ['замена', 'replacement'],
    return: ['возврат', 'return'],
    credit: ['возмещение', 'credit'],
    investigation: ['разбирательство', 'investigation'],
  });
  function labelled(table, key) {
    const pair = table[key];
    return pair ? text(pair[0], pair[1]) : (key || '—');
  }

  /**
   * Сколько от каждой строки заказа уже уехало и приехало — из тех же planы→shipments→receipts,
   * что уже приходят с `/v2/orders/:id/fulfillment`, просто перегруппированных по orderLineNo
   * (совпадает с 1-based индексом order.lines, см. lineNo в order-commit/public.mjs).
   */
  function lineBreakdown(order, view) {
    const byLineNo = new Map();
    (order.lines || []).forEach((line, index) => {
      byLineNo.set(index + 1, {
        lineNo: index + 1, sku: line.sku, ordered: Number(line.quantity || 0), shipped: 0, shipmentNumbers: new Set(), received: 0,
        // The colour reached this line through order-commit's lineage passthrough (same discipline
        // as gtin) — surfaced here because this breakdown was the one place an order's own lines
        // were ever listed by SKU at all, and a colourway had been an opaque id past this screen.
        colourLabel: colourLabel(line),
      });
    });
    for (const plan of view.plans) {
      for (const shipment of plan.shipments || []) {
        for (const shipmentLine of shipment.lines || []) {
          if (shipmentLine.orderLineNo == null) continue;
          if (!byLineNo.has(shipmentLine.orderLineNo)) {
            byLineNo.set(shipmentLine.orderLineNo, { lineNo: shipmentLine.orderLineNo, sku: shipmentLine.sku, ordered: 0, shipped: 0, shipmentNumbers: new Set(), received: 0 });
          }
          const entry = byLineNo.get(shipmentLine.orderLineNo);
          entry.shipped += Number(shipmentLine.quantity || 0);
          entry.shipmentNumbers.add(shipment.shipmentNumber);
        }
        for (const receipt of shipment.receipts || []) {
          for (const receiptLine of receipt.lines || []) {
            if (receiptLine.orderLineNo == null) continue;
            const entry = byLineNo.get(receiptLine.orderLineNo);
            if (entry) entry.received += Number(receiptLine.receivedQuantity || 0);
          }
        }
      }
    }
    return [...byLineNo.values()].sort((a, b) => a.lineNo - b.lineNo);
  }

  /**
   * «Где товар сейчас» — цепочка от плана отгрузки до решения по претензии.
   *
   * Строится сверху вниз в порядке событий, а не по таблицам: план, что уехало, что приехало, что
   * не сошлось, что из этого потребовали и чем кончилось. Недостача и повреждение показываются
   * всегда, когда они есть, — приёмка «всё сошлось» доказывает только счастливый путь, а вопрос
   * «а если привезли не всё» задают первым.
   */
  global.orderFulfillmentDialog = async function orderFulfillmentDialog(order) {
    const view = await api(`/v2/orders/${encodeURIComponent(order.id)}/fulfillment`);
    if (!view || view.orderId !== order.id) throw new Error(I18N.t('common.requestError'));

    const rows = [];
    if (!view.plans.length) {
      rows.push(row(text('Поставка', 'Fulfillment'), text('План отгрузки ещё не создан', 'No fulfillment plan yet')));
      openDetails(text('Поставка по заказу', 'Order fulfillment'), rows);
      return;
    }

    const lines = lineBreakdown(order, view);
    if (lines.length) {
      rows.push(row(text('Строки заказа', 'Order lines'), text(`${lines.length} поз.`, `${lines.length} line(s)`)));
      lines.forEach((entry) => {
        const shipmentList = [...entry.shipmentNumbers].join(', ');
        rows.push(row(
          `${entry.lineNo}. ${entry.sku}${entry.colourLabel ? ` — ${entry.colourLabel}` : ''}`,
          text(
            `заказано ${entry.ordered} · отгружено ${entry.shipped}${shipmentList ? ` (${shipmentList})` : ''} · принято ${entry.received}`,
            `ordered ${entry.ordered} · shipped ${entry.shipped}${shipmentList ? ` (${shipmentList})` : ''} · received ${entry.received}`,
          ),
        ));
      });
    }

    view.plans.forEach((plan, planIndex) => {
      const prefix = view.plans.length > 1 ? `${planIndex + 1}. ` : '';
      rows.push(row(`${prefix}${text('Маршрут', 'Route')}`, `${place(plan.shipFrom)} → ${place(plan.shipTo)}`));
      rows.push(row(`${prefix}${text('Отгрузка по плану', 'Planned shipment')}`, when(plan.plannedShipAt)));
      rows.push(row(`${prefix}${text('Доставка ожидается', 'Expected delivery')}`, when(plan.expectedDeliveryAt)));

      if (!plan.shipments.length) {
        rows.push(row(`${prefix}${text('Отгружено', 'Shipped')}`, text('ещё не отгружено', 'not shipped yet')));
        rows.push(row(`${prefix}${text('Упаковка', 'Packing')}`, packingStatusLabel(plan.packingStatus)));
        return;
      }

      plan.shipments.forEach((shipment) => {
        const shipped = (shipment.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
        rows.push(row(text('Отгрузка', 'Shipment'), `${shipment.shipmentNumber} · ${shipment.carrier || '—'} · ${shipment.trackingNumber || '—'}`));
        rows.push(row(text('Отгружено, шт.', 'Shipped, units'), `${shipped} · ${when(shipment.shippedAt)}`));
        // Морские реквизиты показываются, только если они есть: авиа- и автоперевозка их не несут,
        // и строка «—» на каждой такой отгрузке была бы шумом, а не информацией.
        if (shipment.vesselName || shipment.containerNumber) {
          const vessel = [shipment.vesselName, shipment.portOfLoading && shipment.portOfDischarge ? `${shipment.portOfLoading} → ${shipment.portOfDischarge}` : null].filter(Boolean).join(' · ');
          rows.push(row(text('Судно и порты', 'Vessel and ports'), vessel || '—'));
        }
        if (shipment.containerNumber) {
          rows.push(row(text('Контейнер', 'Container'), [shipment.containerNumber, shipment.containerType].filter(Boolean).join(' · ')));
        }
        if (shipment.billOfLadingNumber) {
          rows.push(row(text('Коносамент', 'Bill of lading'), shipment.billOfLadingNumber));
        }

        const receipts = shipment.receipts || [];
        if (!receipts.length) {
          rows.push(row(text('Приёмка', 'Receipt'), text('груз в пути', 'in transit')));
          return;
        }
        const received = receipts.reduce((sum, receipt) => sum + (receipt.lines || []).reduce((lineSum, line) => lineSum + Number(line.receivedQuantity || 0), 0), 0);
        const last = receipts[receipts.length - 1];
        rows.push(row(text('Принято, шт.', 'Received, units'), `${received} · ${when(last.receivedAt)} · ${last.receiptReference || '—'}`));

        const lines = shipment.discrepancy?.lines || [];
        const damaged = lines.reduce((sum, line) => sum + Number(line.damagedQuantity || 0), 0);
        const rejected = lines.reduce((sum, line) => sum + Number(line.rejectedQuantity || 0), 0);
        const shortage = lines.reduce((sum, line) => sum + Number(line.shortageQuantity || 0), 0);
        const accepted = lines.reduce((sum, line) => sum + Number(line.acceptedQuantity || 0), 0);
        if (shortage || damaged || rejected) {
          rows.push(row(text('Принято к учёту, шт.', 'Accepted, units'), accepted));
          if (damaged) rows.push(row(text('Повреждено, шт.', 'Damaged, units'), damaged));
          if (rejected) rows.push(row(text('Отбраковано, шт.', 'Rejected, units'), rejected));
          rows.push(row(text('Недостача, шт.', 'Shortage, units'), shortage));
        } else {
          rows.push(row(text('Расхождения', 'Discrepancies'), text('нет, поставка сошлась', 'none, shipment matched')));
        }

        if (shipment.claim) {
          rows.push(row(text('Претензия', 'Claim'), `${shipment.claim.claimReference} · ${labelled(CLAIM_REMEDIES, shipment.claim.requestedRemedy)}`));
          rows.push(row(text('Причина претензии', 'Claim reason'), shipment.claim.reason));
          rows.push(row(text('Решение по претензии', 'Claim resolution'), shipment.claimResolution
            ? `${labelled(CLAIM_RESOLUTIONS, shipment.claimResolution.resolutionType)} · ${when(shipment.claimResolution.resolvedAt)}`
            : text('ждёт решения бренда', 'awaiting the brand decision')));
        } else if (shortage || damaged || rejected) {
          rows.push(row(text('Претензия', 'Claim'), text('не подана', 'not submitted')));
        }
      });
    });

    openDetails(text('Поставка по заказу', 'Order fulfillment'), rows);
  };

  function commentEditForm(order, lineNo, sku, sideLabel, currentBody) {
    openForm(`${sideLabel} — ${sku}`, [textDef('body', sideLabel, currentBody || '', 1000, false)], (values) => mutate(
      `/v2/orders/${encodeURIComponent(order.id)}/lines/${lineNo}/comment`,
      { body: (values.body || '').trim() },
      'PUT',
    ));
  }

  function commentRow(order, lineNo, sku, sideLabel, currentBody, canWrite) {
    const label = el('label');
    label.append(el('span', { text: `${lineNo}. ${sku} — ${sideLabel}` }));
    label.append(el('input', { type: 'text', value: currentBody || '—', readOnly: true }));
    if (canWrite) {
      label.append(actionButton(
        currentBody ? text('Изменить', 'Edit') : text('Добавить', 'Add'),
        () => commentEditForm(order, lineNo, sku, sideLabel, currentBody),
      ));
    }
    return label;
  }

  /**
   * Комментарий поставщика (бренд) и комментарий заказчика (магазин) на строке заказа — заметка
   * при сделке, не факт её исполнения, поэтому осмыслена уже на черновике заказа, а не только
   * после отгрузки. Каждая сторона правит только свой комментарий — редактирование другой стороны
   * не предлагается вовсе, а не отклоняется сервером молча.
   */
  global.orderLineCommentsDialog = async function orderLineCommentsDialog(order) {
    const caps = window.SynthaUiCapabilities;
    const canWriteSupplier = caps.hasForOrganisation(state.workspace, order.brandId, caps.CAPABILITIES.ORDER_WRITE);
    const canWriteCustomer = caps.hasForOrganisation(state.workspace, order.shopId, caps.CAPABILITIES.ORDER_WRITE);
    const result = await api(`/v2/orders/${encodeURIComponent(order.id)}/comments`);
    const byLine = new Map();
    (result?.comments || []).forEach((comment) => {
      const entry = byLine.get(comment.lineNo) || {};
      entry[comment.side] = comment.body;
      byLine.set(comment.lineNo, entry);
    });

    const dialog = document.querySelector('#form-dialog'); clear(dialog);
    const body = el('div', { className: 'dialog-body' });
    const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
    const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: text('Комментарии к строкам заказа', 'Order line comments') }), close);
    const grid = el('div', { className: 'form-grid' });

    if (!order.lines || !order.lines.length) {
      grid.append(el('div', { className: 'empty', text: text('В заказе нет строк', 'The order has no lines') }));
    }
    (order.lines || []).forEach((line, index) => {
      const lineNo = index + 1;
      const existing = byLine.get(lineNo) || {};
      grid.append(commentRow(order, lineNo, line.sku, text('Комментарий поставщика', 'Supplier comment'), existing.supplier, canWriteSupplier));
      grid.append(commentRow(order, lineNo, line.sku, text('Комментарий заказчика', 'Customer comment'), existing.customer, canWriteCustomer));
    });

    close.addEventListener('click', () => dialog.close());
    body.append(head, grid); dialog.append(body); dialog.showModal();
  };

  const PACKING_NEXT = Object.freeze({ null: 'packing', packing: 'packed' });
  function packingAdvanceLabel(status) {
    return status === 'packing' ? text('Товары упакованы', 'Mark packed') : text('Начать упаковку', 'Start packing');
  }

  /**
   * Упаковка — предвестник отгрузки, не сам план: пока у плана нет ни одной отгрузки, статус можно
   * двигать только вперёд («не начата» → «идёт упаковка» → «товары упакованы»). Как только появилась
   * первая отгрузка, вопрос уже не стоит — сервер откажет, а этот экран сюда и не доходит.
   */
  global.orderPackingStatusDialog = async function orderPackingStatusDialog(order) {
    const view = await api(`/v2/orders/${encodeURIComponent(order.id)}/fulfillment`);
    if (!view || view.orderId !== order.id) throw new Error(I18N.t('common.requestError'));
    const pending = (view.plans || []).filter((plan) => !plan.shipments.length);

    const dialog = document.querySelector('#form-dialog'); clear(dialog);
    const body = el('div', { className: 'dialog-body' });
    const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
    const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: text('Упаковка отгрузок', 'Shipment packing') }), close);
    const grid = el('div', { className: 'form-grid' });

    if (!pending.length) {
      grid.append(el('div', { className: 'empty', text: text('Все планы этого заказа уже отгружены.', 'Every plan on this order has already shipped.') }));
    }
    pending.forEach((plan, index) => {
      const label = el('label');
      label.append(el('span', { text: `${view.plans.length > 1 ? `${index + 1}. ` : ''}${place(plan.shipFrom)} → ${place(plan.shipTo)}` }));
      label.append(el('input', { type: 'text', value: packingStatusLabel(plan.packingStatus), readOnly: true }));
      const nextStatus = PACKING_NEXT[plan.packingStatus ?? 'null'];
      if (nextStatus) {
        label.append(actionButton(packingAdvanceLabel(plan.packingStatus), async () => {
          await mutate(`/v2/fulfillment-plans/${encodeURIComponent(plan.id)}/packing-status`, { status: nextStatus }, 'PUT');
          dialog.close();
        }));
      }
      grid.append(label);
    });

    close.addEventListener('click', () => dialog.close());
    body.append(head, grid); dialog.append(body); dialog.showModal();
  };

  function doorAllocationEditForm(order, lineNo, sku, door, currentQuantity) {
    openForm(`${text('Точка', 'Door')} ${door.code} — ${sku}`, [numberDef('quantity', text('Количество', 'Quantity'), currentQuantity ?? 0, true, 0)], (values) => mutate(
      `/v2/orders/${encodeURIComponent(order.id)}/lines/${lineNo}/door-allocations/${encodeURIComponent(door.id)}`,
      { quantity: Number.parseInt(values.quantity, 10) || 0 },
      'PUT',
    ));
  }

  /**
   * Распределение строки заказа по точкам розницы магазина — намерение магазина, куда разойдётся
   * товар, а не команда на исполнение: ни план отгрузки, ни резервирование склада эта запись не
   * трогает. Пишет только магазин по своим собственным дверям, бренд — читает результат.
   */
  global.orderLineDoorAllocationDialog = async function orderLineDoorAllocationDialog(order) {
    const caps = window.SynthaUiCapabilities;
    const canWrite = caps.hasForOrganisation(state.workspace, order.shopId, caps.CAPABILITIES.ORDER_WRITE);
    const [allocationResult, doorsResult] = await Promise.all([
      api(`/v2/orders/${encodeURIComponent(order.id)}/door-allocations`),
      api(`/v2/shops/${encodeURIComponent(order.shopId)}/doors`).catch(() => []),
    ]);
    const activeDoors = (Array.isArray(doorsResult) ? doorsResult : []).filter((door) => door.status === 'active');
    const byLineAndDoor = new Map();
    (allocationResult?.allocations || []).forEach((entry) => {
      byLineAndDoor.set(`${entry.lineNo}:${entry.retailDoorId}`, entry.quantity);
    });

    const dialog = document.querySelector('#form-dialog'); clear(dialog);
    const body = el('div', { className: 'dialog-body' });
    const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
    const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: text('Распределение по точкам розницы', 'Retail door allocation') }), close);
    const grid = el('div', { className: 'form-grid' });

    if (!activeDoors.length) {
      grid.append(el('div', { className: 'empty', text: text('У магазина нет активных точек розницы.', 'The shop has no active retail doors.') }));
    }
    (order.lines || []).forEach((line, index) => {
      const lineNo = index + 1;
      activeDoors.forEach((door) => {
        const quantity = byLineAndDoor.get(`${lineNo}:${door.id}`) ?? null;
        const label = el('label');
        label.append(el('span', { text: `${lineNo}. ${line.sku} — ${door.code} · ${door.name || ''}` }));
        label.append(el('input', { type: 'text', value: quantity === null ? '—' : String(quantity), readOnly: true }));
        if (canWrite) {
          label.append(actionButton(
            quantity === null ? text('Указать', 'Set') : text('Изменить', 'Edit'),
            () => doorAllocationEditForm(order, lineNo, line.sku, door, quantity),
          ));
        }
        grid.append(label);
      });
    });

    close.addEventListener('click', () => dialog.close());
    body.append(head, grid); dialog.append(body); dialog.showModal();
  };

  function calendarMilestoneAddForm(order) {
    openForm(text('Добавить веху', 'Add milestone'), [
      textDef('title', text('Название', 'Title'), '', 200),
      dateTimeDef('startsAt', text('Дата', 'Date')),
      selectDef('visibility', text('Видимость', 'Visibility'), [
        { id: 'private', name: text('только мне', 'private to me') },
        { id: 'shared', name: text('обеим сторонам', 'shared with both sides') },
      ], (option) => option.name, 'private'),
    ], (values) => mutate(
      `/v2/orders/${encodeURIComponent(order.id)}/calendar-milestones`,
      isoDates({ title: values.title, startsAt: values.startsAt, visibility: values.visibility }, ['startsAt']),
      'POST',
    ));
  }

  // Which side of the deal the current actor writes calendar facts as — the exact rule the server
  // itself applies in `order-calendar-service.mjs`: the brand side wins if the actor holds
  // `order.write` there, otherwise the shop side. Needed client-side because template routes are
  // organisation-scoped (`POST /v2/organisations/:id/calendar-templates`), unlike the milestone
  // route, which infers the writer from order membership alone.
  function calendarWriterOrganisationId(order) {
    const caps = window.SynthaUiCapabilities;
    if (caps.hasForOrganisation(state.workspace, order.brandId, caps.CAPABILITIES.ORDER_WRITE)) return order.brandId;
    if (caps.hasForOrganisation(state.workspace, order.shopId, caps.CAPABILITIES.ORDER_WRITE)) return order.shopId;
    return null;
  }

  const CALENDAR_TEMPLATE_LINE_SLOTS = 5;
  const CALENDAR_TEMPLATE_TYPE_OPTIONS = [
    { id: 'buying', name: text('закупка', 'buying') },
    { id: 'order', name: text('заказ', 'order') },
    { id: 'deal', name: text('сделка', 'deal') },
  ];
  const CALENDAR_TEMPLATE_VISIBILITY_OPTIONS = [
    { id: 'private', name: text('только мне', 'private to me') },
    { id: 'shared', name: text('обеим сторонам', 'shared with both sides') },
  ];

  /**
   * Именованный набор вех с известным смещением в днях от даты-якоря
   * (docs/backlog-not-yet-integrated.md, раздел H: «календарные шаблоны в библиотеках»). Форма несёт
   * фиксированное число слотов строки, а не динамически растущий список: домен допускает до 50
   * строк, но `openForm` строит плоскую сетку полей, а не повторяющуюся группу, и пяти слотов
   * достаточно для типового набора вех заказа. Пустое название слота просто пропускается при сборке.
   */
  function calendarTemplateCreateForm(order, organisationId) {
    const fields = [textDef('name', text('Название шаблона', 'Template name'), '', 160)];
    for (let slot = 1; slot <= CALENDAR_TEMPLATE_LINE_SLOTS; slot += 1) {
      fields.push(
        (slot === 1 ? textDef : optionalTextDef)(`line${slot}Title`, text(`Веха ${slot}`, `Milestone ${slot}`), '', 200),
        selectDef(`line${slot}Type`, text(`Тип ${slot}`, `Type ${slot}`), CALENDAR_TEMPLATE_TYPE_OPTIONS, (option) => option.name, 'order'),
        numberDef(`line${slot}OffsetDays`, text(`Смещение, дни ${slot}`, `Offset, days ${slot}`), '0', true, -3650),
        selectDef(`line${slot}Visibility`, text(`Видимость ${slot}`, `Visibility ${slot}`), CALENDAR_TEMPLATE_VISIBILITY_OPTIONS, (option) => option.name, 'private'),
      );
    }
    openForm(text('Создать шаблон календаря', 'Create a calendar template'), fields, (values) => {
      const lines = [];
      for (let slot = 1; slot <= CALENDAR_TEMPLATE_LINE_SLOTS; slot += 1) {
        const title = String(values[`line${slot}Title`] ?? '').trim();
        if (!title) continue;
        lines.push({ title, type: values[`line${slot}Type`], offsetDays: values[`line${slot}OffsetDays`], visibility: values[`line${slot}Visibility`] });
      }
      return mutate(`/v2/organisations/${encodeURIComponent(organisationId)}/calendar-templates`, { name: values.name, lines }, 'POST');
    });
  }

  function calendarTemplateApplyForm(order, organisationId, templates) {
    openForm(text('Применить шаблон', 'Apply a template'), [
      selectDef('templateId', text('Шаблон', 'Template'), templates, (template) => `${template.name} · ${template.lines.length} ${text('веха(и)', 'milestone(s)')}`, templates[0]?.id),
      dateTimeDef('anchorAt', text('Дата-якорь', 'Anchor date')),
    ], (values) => mutate(
      `/v2/orders/${encodeURIComponent(order.id)}/calendar-milestones/apply-template`,
      isoDates({ templateId: values.templateId, anchorAt: values.anchorAt }, ['anchorAt']),
      'POST',
    ));
  }

  /**
   * Общая на обе стороны сделки таймлиния заказа — переиспользует `calendar_milestones`
   * (миграция 001), которая до этого писала только вехи открытия сделки. `private` видна только
   * той стороне, что её завела, `shared` — обеим; каждая сторона добавляет вехи только от своего
   * имени, редактирование чужой вехи не предлагается вовсе.
   */
  global.orderCalendarDialog = async function orderCalendarDialog(order) {
    const caps = window.SynthaUiCapabilities;
    const canWrite = caps.hasForOrganisation(state.workspace, order.brandId, caps.CAPABILITIES.ORDER_WRITE)
      || caps.hasForOrganisation(state.workspace, order.shopId, caps.CAPABILITIES.ORDER_WRITE);
    const writerOrganisationId = calendarWriterOrganisationId(order);
    const [result, templateResult] = await Promise.all([
      api(`/v2/orders/${encodeURIComponent(order.id)}/calendar-milestones`),
      writerOrganisationId ? api(`/v2/organisations/${encodeURIComponent(writerOrganisationId)}/calendar-templates`) : Promise.resolve(null),
    ]);
    const templates = templateResult?.templates || [];

    const dialog = document.querySelector('#form-dialog'); clear(dialog);
    const body = el('div', { className: 'dialog-body' });
    const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
    const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: text('Календарь заказа', 'Order calendar') }), close);
    const grid = el('div', { className: 'form-grid' });

    const milestones = result?.milestones || [];
    if (!milestones.length) {
      grid.append(el('div', { className: 'empty', text: text('Вех пока нет.', 'No milestones yet.') }));
    }
    milestones.forEach((milestone) => {
      const label = el('label');
      const visibilityLabel = milestone.visibility === 'shared' ? text('обеим сторонам', 'shared') : text('только своей стороне', 'private');
      label.append(el('span', { text: `${formatDate(milestone.startsAt)} — ${milestone.title}` }));
      label.append(el('input', { type: 'text', value: `${orgName(milestone.ownerOrganisationId)} · ${visibilityLabel}`, readOnly: true }));
      grid.append(label);
    });
    if (canWrite) {
      grid.append(actionButton(text('Добавить веху', 'Add milestone'), () => calendarMilestoneAddForm(order)));
      if (templates.length) {
        grid.append(actionButton(text('Применить шаблон', 'Apply a template'), () => calendarTemplateApplyForm(order, writerOrganisationId, templates)));
      }
      grid.append(actionButton(text('Создать шаблон', 'Create a template'), () => calendarTemplateCreateForm(order, writerOrganisationId)));
    }

    close.addEventListener('click', () => dialog.close());
    body.append(head, grid); dialog.append(body); dialog.showModal();
  };

  function amendmentProposeForm(order) {
    const lineOptions = order.lines.map((line, index) => ({ id: String(index + 1), name: `${index + 1}. ${line.sku} — ${text('сейчас', 'now')} ${line.quantity}` }));
    openForm(text('Предложить изменение количества', 'Propose a quantity change'), [
      selectDef('lineNo', text('Строка заказа', 'Order line'), lineOptions, (option) => option.name, lineOptions[0]?.id),
      numberDef('proposedQuantity', text('Новое количество', 'New quantity'), '', true, 1),
      textDef('reason', text('Причина', 'Reason'), '', 1000),
    ], (values) => mutate(
      `/v2/orders/${encodeURIComponent(order.id)}/amendments`,
      { lineNo: Number.parseInt(values.lineNo, 10), proposedQuantity: Number.parseInt(values.proposedQuantity, 10), reason: values.reason },
      'POST',
    ));
  }

  function amendmentRejectForm(order, amendment) {
    openForm(text('Отклонить изменение', 'Reject the amendment'), [
      textDef('responseReason', text('Причина отклонения', 'Rejection reason'), '', 1000),
    ], (values) => mutate(
      `/v2/orders/${encodeURIComponent(order.id)}/amendments/${encodeURIComponent(amendment.id)}/respond`,
      { decision: 'rejected', responseReason: values.responseReason },
      'POST',
    ));
  }

  /**
   * Изменение уже подтверждённого заказа — до этого у заказа был только один путь после `attached`:
   * отмена целиком. Предложение и ответ на него, а не тихая перезапись количества: строку заказа
   * этот экран не трогает вовсе, только фиксирует факт предложения и решение другой стороны.
   * Отвечает не та сторона, что предложила, — сервер откажет самой попыткой, эта кнопка её просто
   * не показывает.
   */
  global.orderAmendmentsDialog = async function orderAmendmentsDialog(order) {
    const caps = window.SynthaUiCapabilities;
    const canWrite = caps.hasForOrganisation(state.workspace, order.brandId, caps.CAPABILITIES.ORDER_WRITE)
      || caps.hasForOrganisation(state.workspace, order.shopId, caps.CAPABILITIES.ORDER_WRITE);
    const myOrgId = ownIds().find((id) => id === order.brandId || id === order.shopId) || null;
    const result = await api(`/v2/orders/${encodeURIComponent(order.id)}/amendments`);

    const dialog = document.querySelector('#form-dialog'); clear(dialog);
    const body = el('div', { className: 'dialog-body' });
    const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
    const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: text('Изменения заказа', 'Order amendments') }), close);
    const grid = el('div', { className: 'form-grid' });

    const amendments = result?.amendments || [];
    if (!amendments.length) {
      grid.append(el('div', { className: 'empty', text: text('Предложений об изменении пока нет.', 'No amendments proposed yet.') }));
    }
    amendments.forEach((amendment) => {
      const label = el('label');
      const line = order.lines[amendment.lineNo - 1];
      const statusText = amendment.status === 'proposed' ? text('на рассмотрении', 'pending')
        : amendment.status === 'accepted' ? text('принято', 'accepted') : text('отклонено', 'rejected');
      const signedDelta = `${amendment.deltaAmount >= 0 ? '+' : ''}${money(amendment.deltaAmount, amendment.currency)}`;
      label.append(el('span', { text: `${amendment.lineNo}. ${line?.sku || ''}: ${amendment.currentQuantity} → ${amendment.proposedQuantity} (${signedDelta})` }));
      const detailParts = [`${text('от', 'from')} ${orgName(amendment.proposedOrganisationId)}`, `${text('причина', 'reason')}: ${amendment.reason}`, statusText];
      if (amendment.responseReason) detailParts.push(`${text('ответ', 'response')}: ${amendment.responseReason}`);
      label.append(el('input', { type: 'text', value: detailParts.join(' · '), readOnly: true }));
      if (amendment.status === 'proposed' && canWrite && myOrgId && myOrgId !== amendment.proposedOrganisationId) {
        label.append(actionButton(text('Принять', 'Accept'), () => mutate(
          `/v2/orders/${encodeURIComponent(order.id)}/amendments/${encodeURIComponent(amendment.id)}/respond`,
          { decision: 'accepted' },
          'POST',
        )));
        label.append(actionButton(text('Отклонить', 'Reject'), () => amendmentRejectForm(order, amendment), 'danger'));
      }
      grid.append(label);
    });
    if (canWrite) {
      grid.append(actionButton(text('Предложить изменение', 'Propose a change'), () => amendmentProposeForm(order)));
    }

    close.addEventListener('click', () => dialog.close());
    body.append(head, grid); dialog.append(body); dialog.showModal();
  };
})(window);
