(function installOrderFulfillmentActions(global) {
  'use strict';

  // «Отгрузка и приёмка» — рабочее место по заказу. Вся цепочка «план поставки → уведомление об
  // отгрузке → приёмка → претензия → решение → возврат от поставщика» работала по API, но в
  // интерфейсе был только статус упаковки: человек видел поставку и не мог сделать ни одного шага.
  //
  // Правило файла то же, что у product-chain-forms.js: полезная нагрузка собирается чистыми
  // функциями `build*` строго по контракту маршрутов и границам домена, а форма только собирает
  // значения и зовёт маршруты. Какую кнопку показать, решает чистая `stepsFor` — по праву роли в
  // своей организации и по состоянию цепочки, — поэтому кнопка не обещает того, что сервер тут же
  // откажет сделать.
  //
  // Кто что делает (права — те же, что проверяют команды):
  //   бренд  — план (supply.manage + fulfillment.manage), отгрузка (fulfillment.manage),
  //            решение по претензии (claim.resolve), возврат от поставщика (cost.manage, финансы);
  //   магазин — приёмка (receipt.manage), претензия (claim.manage).

  const MAX_INTEGER = 2_147_483_647;
  const SOURCE_TYPES = Object.freeze(['production', 'inbound', 'inventory', 'drop-ship']);
  const SOURCE_LABELS = Object.freeze({
    production: ['производство', 'production'],
    inbound: ['в пути на склад', 'inbound'],
    inventory: ['со склада', 'from stock'],
    'drop-ship': ['прямая поставка', 'drop-ship'],
  });
  const REMEDIES = Object.freeze({
    replacement: ['замена товара', 'replacement'],
    return: ['возврат поставщику', 'return to supplier'],
    credit: ['кредит (возмещение)', 'credit'],
    investigation: ['разбирательство', 'investigation'],
  });
  const RESOLUTIONS = Object.freeze({
    'accepted-for-replacement': ['принять: замена (корректировка поставки)', 'accept: replacement'],
    'accepted-for-return': ['принять: возврат поставщику', 'accept: return'],
    'accepted-for-credit': ['принять: кредит (возмещение)', 'accept: credit'],
    'accepted-as-is': ['принять товар как есть', 'accept as is'],
    rejected: ['отклонить претензию', 'reject'],
  });
  const RECOVERABLE_RESOLUTIONS = Object.freeze(['accepted-for-replacement', 'accepted-for-return', 'accepted-for-credit']);

  function t(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function labelled(table, key) { const pair = table[key]; return pair ? t(pair[0], pair[1]) : (key || '—'); }

  function fail(code, ru, en) {
    const error = new Error(t(ru, en));
    error.code = code;
    throw error;
  }

  // --- мелкие чистые помощники -----------------------------------------------------------------------

  function trimmed(value) { return String(value ?? '').trim(); }

  function requireText(value, min, max, ru, en) {
    const text = trimmed(value);
    if (text.length < min || text.length > max) fail('FIELD_LENGTH_INVALID', `${ru}: от ${min} до ${max} символов.`, `${en}: ${min} to ${max} characters.`);
    return text;
  }

  function optionalText(value, max, ru, en) {
    const text = trimmed(value);
    if (!text) return undefined;
    if (text.length > max) fail('FIELD_LENGTH_INVALID', `${ru}: не больше ${max} символов.`, `${en}: at most ${max} characters.`);
    return text;
  }

  // Количество из поля формы. Пустое поле — ноль («не отправляется»), дробь и минус — отказ: тот же
  // отказ, что вернул бы домен, но до отправки и по-русски.
  function quantity(value, ru, en, { max = MAX_INTEGER } = {}) {
    if (value === null || value === undefined || value === '' || Number.isNaN(value)) return 0;
    const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!Number.isInteger(number) || number < 0 || number > max) {
      fail('QUANTITY_INVALID', `${ru}: целое число от 0 до ${max}.`, `${en}: a whole number from 0 to ${max}.`);
    }
    return number;
  }

  function isoOf(value, ru, en) {
    const parsed = new Date(value);
    if (!value || Number.isNaN(parsed.valueOf())) fail('DATE_INVALID', `${ru}: укажите дату и время.`, `${en}: enter a date and time.`);
    return parsed.toISOString();
  }

  // Значение для поля `datetime-local`: местное время без секунд.
  function localInput(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.valueOf())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function sum(items, pick) { return (items || []).reduce((total, item) => total + Number(pick(item) || 0), 0); }

  // --- состояние цепочки (чистые чтения того, что вернул `/v2/orders/:id/fulfillment`) -------------

  function plannedByLineNo(plans) {
    const planned = new Map();
    for (const plan of plans || []) {
      for (const line of plan.lines || []) {
        if (line.orderLineNo == null) continue;
        planned.set(line.orderLineNo, (planned.get(line.orderLineNo) || 0) + Number(line.quantity || 0));
      }
    }
    return planned;
  }

  function shippedByLineId(plan) {
    const shipped = new Map();
    for (const shipment of plan.shipments || []) {
      for (const line of shipment.lines || []) shipped.set(line.lineId, (shipped.get(line.lineId) || 0) + Number(line.quantity || 0));
    }
    return shipped;
  }

  function receivedByLineId(shipment) {
    const received = new Map();
    for (const receipt of shipment.receipts || []) {
      for (const line of receipt.lines || []) {
        const entry = received.get(line.lineId) || { received: 0, damaged: 0, rejected: 0 };
        entry.received += Number(line.receivedQuantity || 0);
        entry.damaged += Number(line.damagedQuantity || 0);
        entry.rejected += Number(line.rejectedQuantity || 0);
        received.set(line.lineId, entry);
      }
    }
    return received;
  }

  function planRemaining(plan) {
    const shipped = shippedByLineId(plan);
    return (plan.lines || []).map((line) => ({ line, remaining: Math.max(Number(line.quantity || 0) - (shipped.get(line.lineId) || 0), 0) }));
  }

  function receiptFinal(shipment) { return (shipment.receipts || []).some((receipt) => receipt.receiptComplete === true); }

  function recoveriesOf(shipment) {
    return Array.isArray(shipment.supplierRecoveries) ? shipment.supplierRecoveries : [];
  }

  /**
   * Какие шаги цепочки доступны этому человеку сейчас. `can(organisationId, capability)` — право
   * в своей организации (в интерфейсе — `hasForOrganisation`). Возвращает плоский список шагов;
   * каждый называет шаг и сущность, к которой он относится.
   */
  function stepsFor({ order, view, can, capabilities }) {
    const C = capabilities;
    const steps = [];
    const plans = view?.plans || [];
    const ordered = (order?.lines || []).map((line) => Number(line.quantity || 0));
    const planned = plannedByLineNo(plans);
    const unplanned = ordered.some((quantity, index) => quantity > (planned.get(index + 1) || 0));
    const executable = Boolean(order?.orderCommitSnapshotId) && order?.status === 'attached';

    if (executable && unplanned && can(order.brandId, C.SUPPLY_MANAGE) && can(order.brandId, C.FULFILLMENT_MANAGE)) {
      steps.push({ step: 'plan', label: t('Новый план поставки', 'New fulfillment plan') });
    }
    for (const plan of plans) {
      const hasRemaining = planRemaining(plan).some((entry) => entry.remaining > 0);
      if (hasRemaining && can(order.brandId, C.FULFILLMENT_MANAGE)) {
        steps.push({ step: 'shipment', planId: plan.id, label: t('Уведомить об отгрузке', 'Notify of shipment') });
      }
      for (const shipment of plan.shipments || []) {
        if (!receiptFinal(shipment) && can(order.shopId, C.RECEIPT_MANAGE)) {
          steps.push({ step: 'receipt', planId: plan.id, shipmentId: shipment.id, label: t('Принять поставку', 'Receive the shipment') });
        }
        const discrepancy = shipment.discrepancy;
        if (discrepancy && discrepancy.status === 'open' && discrepancy.finalized === true && !shipment.claim && can(order.shopId, C.CLAIM_MANAGE)) {
          steps.push({ step: 'claim', planId: plan.id, shipmentId: shipment.id, label: t('Подать претензию', 'Submit a claim') });
        }
        if (shipment.claim && !shipment.claimResolution && can(order.brandId, C.CLAIM_RESOLVE)) {
          steps.push({ step: 'resolution', planId: plan.id, shipmentId: shipment.id, label: t('Решить по претензии', 'Resolve the claim') });
        }
        if (shipment.claimResolution && RECOVERABLE_RESOLUTIONS.includes(shipment.claimResolution.resolutionType) && can(order.brandId, C.COST_MANAGE)) {
          steps.push({ step: 'recovery', planId: plan.id, shipmentId: shipment.id, label: t('Возврат от поставщика', 'Supplier recovery') });
        }
      }
    }
    return steps;
  }

  // --- сборщики полезной нагрузки (по контракту маршрутов) ------------------------------------------

  // Обязательство поставки: сколько по каждой строке заказа и откуда. Строка с нулём не уходит.
  function buildSupplyCommitment({ order, quantities, sourceType, sourceRef }) {
    if (!SOURCE_TYPES.includes(sourceType)) fail('FULFILLMENT_SUPPLY_SOURCE_INVALID', 'Выберите источник поставки.', 'Choose a supply source.');
    const reference = requireText(sourceRef, 1, 240, 'Основание поставки (номер заказа фабрике, склад)', 'Supply reference');
    const allocations = [];
    (order?.lines || []).forEach((line, index) => {
      const amount = quantity(quantities?.[index], `Строка ${index + 1}, количество`, `Line ${index + 1}, quantity`);
      if (amount === 0) return;
      if (amount > Number(line.quantity || 0)) {
        fail('SUPPLY_COMMITMENT_EXCEEDS_ORDER', `Строка ${index + 1} (${line.sku}): в плане больше, чем заказано (${line.quantity}).`, `Line ${index + 1} (${line.sku}): the plan exceeds the ordered ${line.quantity}.`);
      }
      allocations.push({ sku: line.sku, quantity: amount, sourceType, sourceRef: reference });
    });
    if (!allocations.length) fail('SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED', 'Укажите количество хотя бы по одной строке.', 'Enter a quantity for at least one line.');
    return { allocations };
  }

  function buildLocation(values, prefix, labelRu, labelEn) {
    const country = trimmed(values[`${prefix}Country`]).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) fail('FULFILLMENT_LOCATION_COUNTRY_INVALID', `${labelRu}: страна — двухбуквенный код ISO, например TR или RU.`, `${labelEn}: country is a two-letter ISO code, for example TR or RU.`);
    const location = {
      locationId: requireText(values[`${prefix}Code`], 1, 120, `${labelRu}: код площадки`, `${labelEn}: location code`),
      name: requireText(values[`${prefix}Name`], 1, 200, `${labelRu}: название`, `${labelEn}: name`),
      countryCode: country,
      city: requireText(values[`${prefix}City`], 1, 120, `${labelRu}: город`, `${labelEn}: city`),
      addressLine1: requireText(values[`${prefix}Address`], 1, 240, `${labelRu}: адрес`, `${labelEn}: address`),
    };
    const postal = optionalText(values[`${prefix}Postal`], 40, `${labelRu}: индекс`, `${labelEn}: postal code`);
    if (postal) location.postalCode = postal;
    return location;
  }

  // Точка розницы магазина → место доставки. Адрес точки уже проверен доменом точки.
  function locationFromDoor(door) {
    const address = door.shipToAddress || {};
    const location = {
      locationId: door.id,
      name: [door.code, door.name].filter(Boolean).join(' · ') || door.id,
      countryCode: trimmed(address.countryCode).toUpperCase(),
      city: trimmed(address.city),
      addressLine1: trimmed(address.line1),
    };
    if (trimmed(address.line2)) location.addressLine2 = trimmed(address.line2);
    if (trimmed(address.postalCode)) location.postalCode = trimmed(address.postalCode);
    return location;
  }

  function buildFulfillmentPlan({ supplyCommitmentSnapshotId, values, doors }) {
    const door = values.shipToDoorId ? (doors || []).find((candidate) => candidate.id === values.shipToDoorId) : null;
    if (values.shipToDoorId && !door) fail('RETAIL_DOOR_NOT_FOUND', 'Точка розницы не найдена. Обновите страницу.', 'The retail door was not found. Refresh the page.');
    const plannedShipAt = isoOf(values.plannedShipAt, 'Плановая отгрузка', 'Planned shipment');
    const expectedDeliveryAt = isoOf(values.expectedDeliveryAt, 'Ожидаемая доставка', 'Expected delivery');
    if (Date.parse(expectedDeliveryAt) <= Date.parse(plannedShipAt)) {
      fail('FULFILLMENT_DELIVERY_WINDOW_INVALID', 'Доставка должна быть позже плановой отгрузки.', 'Delivery must be after the planned shipment.');
    }
    return {
      supplyCommitmentSnapshotId,
      shipFrom: buildLocation(values, 'from', 'Откуда', 'From'),
      shipTo: door ? locationFromDoor(door) : buildLocation(values, 'to', 'Куда', 'To'),
      plannedShipAt,
      expectedDeliveryAt,
    };
  }

  const SHIPMENT_OPTIONAL = Object.freeze([
    ['trackingNumber', 160, 'Трек-номер', 'Tracking number'],
    ['containerNumber', 32, 'Номер контейнера', 'Container number'],
    ['containerType', 20, 'Тип контейнера', 'Container type'],
    ['vesselName', 160, 'Судно', 'Vessel'],
    ['portOfLoading', 120, 'Порт погрузки', 'Port of loading'],
    ['portOfDischarge', 120, 'Порт разгрузки', 'Port of discharge'],
    ['billOfLadingNumber', 64, 'Коносамент', 'Bill of lading'],
  ]);

  function buildShipmentNotice({ plan, values, quantities }) {
    const remaining = planRemaining(plan);
    const lines = [];
    remaining.forEach((entry, index) => {
      const amount = quantity(quantities?.[index], `${entry.line.sku}, количество`, `${entry.line.sku}, quantity`);
      if (amount === 0) return;
      if (amount > entry.remaining) {
        fail('SHIPMENT_EXCEEDS_FULFILLMENT_PLAN', `${entry.line.sku}: в плане осталось отгрузить ${entry.remaining}.`, `${entry.line.sku}: ${entry.remaining} left to ship in the plan.`);
      }
      lines.push({ lineId: entry.line.lineId, quantity: amount });
    });
    if (!lines.length) fail('SHIPMENT_LINES_REQUIRED', 'Укажите количество хотя бы по одной строке.', 'Enter a quantity for at least one line.');
    const shippedAt = isoOf(values.shippedAt, 'Дата отгрузки', 'Shipment date');
    const expectedDeliveryAt = isoOf(values.expectedDeliveryAt, 'Ожидаемая доставка', 'Expected delivery');
    if (Date.parse(expectedDeliveryAt) <= Date.parse(shippedAt)) {
      fail('SHIPMENT_DELIVERY_WINDOW_INVALID', 'Доставка должна быть позже отгрузки.', 'Delivery must be after the shipment.');
    }
    const body = {
      shipmentNumber: requireText(values.shipmentNumber, 2, 120, 'Номер отгрузки', 'Shipment number'),
      carrier: requireText(values.carrier, 2, 160, 'Перевозчик', 'Carrier'),
      serviceLevel: requireText(values.serviceLevel, 1, 120, 'Вид перевозки', 'Service level'),
      lines,
      shippedAt,
      expectedDeliveryAt,
    };
    for (const [field, max, ru, en] of SHIPMENT_OPTIONAL) {
      const text = optionalText(values[field], max, ru, en);
      if (text) body[field] = text;
    }
    return body;
  }

  /**
   * Приёмка. По строке: сколько физически пришло, из них повреждено и забраковано. Строка с нулём
   * пришедшего в приёмку не попадает — домен требует положительное количество, а недостача
   * считается сама: отгружено минус принято, когда приёмка окончательная.
   */
  function buildReceipt({ shipment, values, rows }) {
    const lines = [];
    (shipment.lines || []).forEach((line, index) => {
      const row = rows?.[index] || {};
      const received = quantity(row.received, `${line.sku}, пришло`, `${line.sku}, received`);
      const damaged = quantity(row.damaged, `${line.sku}, повреждено`, `${line.sku}, damaged`);
      const rejected = quantity(row.rejected, `${line.sku}, брак`, `${line.sku}, rejected`);
      if (received === 0) {
        if (damaged || rejected) fail('RECEIPT_DISPOSITION_EXCEEDS_RECEIVED', `${line.sku}: брак и повреждения не могут быть при нуле принятых.`, `${line.sku}: damage and rejects need a received quantity.`);
        return;
      }
      if (damaged + rejected > received) {
        fail('RECEIPT_DISPOSITION_EXCEEDS_RECEIVED', `${line.sku}: повреждено и забраковано больше, чем пришло.`, `${line.sku}: damaged and rejected exceed the received quantity.`);
      }
      lines.push({ lineId: line.lineId, receivedQuantity: received, damagedQuantity: damaged, rejectedQuantity: rejected });
    });
    if (!lines.length) fail('RECEIPT_LINES_REQUIRED', 'Укажите, сколько пришло, хотя бы по одной строке.', 'Enter the received quantity for at least one line.');
    if (values.receiptComplete !== 'complete' && values.receiptComplete !== 'partial') fail('RECEIPT_COMPLETE_FLAG_REQUIRED', 'Укажите, окончательная ли это приёмка.', 'Say whether this is the final receipt.');
    return {
      receiptReference: requireText(values.receiptReference, 2, 160, 'Номер приёмки', 'Receipt reference'),
      receivedBy: requireText(values.receivedBy, 2, 200, 'Кто принял', 'Received by'),
      receiptComplete: values.receiptComplete === 'complete',
      lines,
      receivedAt: isoOf(values.receivedAt, 'Дата приёмки', 'Receipt date'),
    };
  }

  function buildClaim(values) {
    if (!Object.hasOwn(REMEDIES, values.requestedRemedy)) fail('RECEIPT_CLAIM_REMEDY_INVALID', 'Выберите, чего вы требуете.', 'Choose the remedy you ask for.');
    return {
      claimReference: requireText(values.claimReference, 2, 160, 'Номер претензии', 'Claim reference'),
      reason: requireText(values.reason, 2, 2000, 'Причина', 'Reason'),
      requestedRemedy: values.requestedRemedy,
    };
  }

  function buildResolution(values) {
    if (!Object.hasOwn(RESOLUTIONS, values.resolutionType)) fail('RECEIPT_CLAIM_RESOLUTION_TYPE_INVALID', 'Выберите решение.', 'Choose a resolution.');
    return {
      resolutionType: values.resolutionType,
      resolutionReason: requireText(values.resolutionReason, 2, 2000, 'Обоснование решения', 'Resolution reason'),
    };
  }

  // Возврат привязан к строке и SKU претензии: без пары `orderLineNo` + `productSkuId` сумма
  // повисла бы на заказе целиком и не попала бы в маржу ни одного изделия.
  function buildSupplierRecovery({ claim, order, values }) {
    const issueLines = (claim?.lines || []).filter((line) => line.orderLineNo != null && line.productSkuId);
    const chosen = values.claimLine === '' || values.claimLine === null || values.claimLine === undefined ? NaN : Number(values.claimLine);
    const line = Number.isInteger(chosen) ? issueLines[chosen] : undefined;
    if (!line) fail('SUPPLIER_RECOVERY_EXACT_PRODUCT_SKU_LINEAGE_REQUIRED', 'Выберите строку претензии: возврат привязывается к строке и SKU.', 'Choose the claim line: a recovery is tied to a line and SKU.');
    const amount = typeof values.amount === 'number' ? values.amount : Number(String(values.amount ?? '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) fail('SUPPLIER_RECOVERY_AMOUNT_INVALID', 'Сумма возврата должна быть больше нуля.', 'The recovery amount must be above zero.');
    const supplierCode = requireText(values.supplierCode, 2, 64, 'Поставщик', 'Supplier');
    return {
      supplierCode,
      amount: Math.round(amount * 10_000) / 10_000,
      currency: String(order?.currency || '').toUpperCase(),
      orderLineNo: line.orderLineNo,
      productSkuId: line.productSkuId,
      sku: line.sku,
      sourceRef: requireText(values.sourceRef, 1, 240, 'Документ поставщика (кредит-нота)', 'Supplier document (credit note)'),
      occurredAt: isoOf(values.occurredAt, 'Дата документа', 'Document date'),
      reason: requireText(values.reason, 2, 1000, 'Основание', 'Reason'),
    };
  }

  // --- чтение вспомогательных данных ----------------------------------------------------------------

  async function loadDoors(order) {
    try {
      const result = await api(`/v2/shops/${encodeURIComponent(order.shopId)}/doors`);
      return (Array.isArray(result) ? result : []).filter((door) => door.status === 'active');
    } catch { return []; }
  }

  async function loadAllocations(order) {
    try {
      const result = await api(`/v2/orders/${encodeURIComponent(order.id)}/door-allocations`);
      return Array.isArray(result?.allocations) ? result.allocations : [];
    } catch { return []; }
  }

  async function loadSuppliers(order) {
    const items = [];
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const result = await api(`/v2/suppliers?${query.toString()}`);
      items.push(...(Array.isArray(result?.items) ? result.items : []));
      cursor = result?.nextCursor || null;
      if (!cursor) break;
    }
    return items.filter((supplier) => supplier.brandId === order.brandId && supplier.status !== 'draft');
  }

  function notePartial(error, doneRu, doneEn) {
    const wrapped = new Error(`${error.message} ${t(`Уже выполнено: ${doneRu}. Повторите отправку.`, `Already done: ${doneEn}. Submit again.`)}`);
    wrapped.code = error.code;
    wrapped.details = error.details;
    return wrapped;
  }

  const path = (strings, ...parts) => strings.reduce((out, chunk, index) => out + chunk + (index < parts.length ? encodeURIComponent(parts[index]) : ''), '');

  function lineLabel(line) { return `${line.orderLineNo != null ? `${line.orderLineNo}. ` : ''}${line.sku}`; }

  // --- формы ---------------------------------------------------------------------------------------

  async function planForm(order, view) {
    const [doors, allocations] = await Promise.all([loadDoors(order), loadAllocations(order)]);
    const planned = plannedByLineNo(view?.plans);
    const byDoor = new Map();
    for (const entry of allocations) byDoor.set(entry.lineNo, (byDoor.get(entry.lineNo) || 0) + Number(entry.quantity || 0));
    const lastPlan = (view?.plans || []).at(-1);
    const fields = [];
    (order.lines || []).forEach((line, index) => {
      const lineNo = index + 1;
      const remaining = Math.max(Number(line.quantity || 0) - (planned.get(lineNo) || 0), 0);
      const doorText = byDoor.get(lineNo) ? t(`, магазин распределил по точкам ${byDoor.get(lineNo)}`, `, the shop split ${byDoor.get(lineNo)} across doors`) : '';
      fields.push(numberDef(`qty${index}`, `${lineNo}. ${line.sku} — ${t(`заказано ${line.quantity}, уже в планах ${planned.get(lineNo) || 0}${doorText}`, `ordered ${line.quantity}, already planned ${planned.get(lineNo) || 0}${doorText}`)}`, remaining, true, 0, Number(line.quantity || 0)));
    });
    fields.push(
      selectDef('sourceType', t('Источник поставки', 'Supply source'), SOURCE_TYPES, (type) => labelled(SOURCE_LABELS, type), 'production'),
      textDef('sourceRef', t('Основание (заказ фабрике, склад)', 'Reference (factory order, stock)'), '', 240),
    );
    const from = lastPlan?.shipFrom || {};
    fields.push(
      textDef('fromCode', t('Откуда: код площадки', 'From: location code'), from.locationId || '', 120),
      textDef('fromName', t('Откуда: название', 'From: name'), from.name || '', 200),
      textDef('fromCountry', t('Откуда: страна (ISO, 2 буквы)', 'From: country (ISO, 2 letters)'), from.countryCode || '', 2, true, 2),
      textDef('fromCity', t('Откуда: город', 'From: city'), from.city || '', 120),
      textDef('fromAddress', t('Откуда: адрес', 'From: address'), from.addressLine1 || '', 240),
      optionalTextDef('fromPostal', t('Откуда: индекс', 'From: postal code'), from.postalCode || '', 40),
    );
    if (doors.length) {
      fields.push(selectDef('shipToDoorId', t('Куда: точка розницы магазина', 'To: shop retail door'), [{ id: '' }, ...doors], (door) => (door.id === '' ? t('— указать адрес вручную —', '— enter the address manually —') : `${door.code} · ${door.name || ''}`), doors[0].id, false));
    }
    const manual = !doors.length;
    const toField = (name, label, value = '', max = 160) => (manual ? textDef(name, label, value, max) : optionalTextDef(name, label, value, max));
    fields.push(
      toField('toCode', t('Куда: код площадки', 'To: location code'), '', 120),
      toField('toName', t('Куда: название', 'To: name'), '', 200),
      toField('toCountry', t('Куда: страна (ISO, 2 буквы)', 'To: country (ISO, 2 letters)'), '', 2),
      toField('toCity', t('Куда: город', 'To: city'), '', 120),
      toField('toAddress', t('Куда: адрес', 'To: address'), '', 240),
      optionalTextDef('toPostal', t('Куда: индекс', 'To: postal code'), '', 40),
      dateTimeDef('plannedShipAt', t('Плановая отгрузка', 'Planned shipment'), localInput(new Date(Date.now() + 7 * 86_400_000).toISOString())),
      dateTimeDef('expectedDeliveryAt', t('Ожидаемая доставка', 'Expected delivery'), localInput(new Date(Date.now() + 21 * 86_400_000).toISOString())),
    );
    openForm(t('Новый план поставки', 'New fulfillment plan'), fields, async (values) => {
      const quantities = (order.lines || []).map((_, index) => values[`qty${index}`]);
      const supplyBody = buildSupplyCommitment({ order, quantities, sourceType: values.sourceType, sourceRef: values.sourceRef });
      const planBody = (commitmentId) => buildFulfillmentPlan({ supplyCommitmentSnapshotId: commitmentId, values, doors });
      // Проверка плана — до первого вызова: нечего оставлять обязательством, если план всё равно не соберётся.
      planBody('pending');
      const commitment = await mutate(path`/v2/orders/${order.id}/supply-commitments`, supplyBody, 'POST');
      try {
        return await mutate(path`/v2/orders/${order.id}/fulfillment-plans`, planBody(commitment.id), 'POST');
      } catch (error) {
        throw notePartial(error, 'обязательство поставки записано', 'the supply commitment is recorded');
      }
    }, stepDone(order, 'план поставки создан.', 'the fulfillment plan is created.'));
  }

  // Шаг цепочки «план → отгрузка → приёмка → претензия» меняет то, что нарисовано в рабочем месте:
  // кнопки следующего шага, количества, статус приёмки. Форма открывается в том же диалоге и после
  // сохранения закрывает его, поэтому рабочее место открывается заново уже со свежим состоянием
  // сервера и заказом из перечитанного рабочего пространства.
  function stepDone(order, ru, en) {
    return {
      afterSave: () => {
        const fresh = (state.workspace?.orders || []).find((item) => item.id === order.id) || order;
        return global.orderFulfillmentWorkspaceDialog(fresh);
      },
      successMessage: [ru, en],
    };
  }

  function shipmentForm(order, plan) {
    const remaining = planRemaining(plan);
    const fields = [
      textDef('shipmentNumber', t('Номер отгрузки', 'Shipment number'), '', 120, true, 2),
      textDef('carrier', t('Перевозчик', 'Carrier'), '', 160, true, 2),
      textDef('serviceLevel', t('Вид перевозки (авиа, море, авто)', 'Service level (air, sea, road)'), '', 120),
      optionalTextDef('trackingNumber', t('Трек-номер', 'Tracking number'), '', 160),
      optionalTextDef('containerNumber', t('Номер контейнера', 'Container number'), '', 32),
      optionalTextDef('containerType', t('Тип контейнера', 'Container type'), '', 20),
      optionalTextDef('vesselName', t('Судно', 'Vessel'), '', 160),
      optionalTextDef('portOfLoading', t('Порт погрузки', 'Port of loading'), '', 120),
      optionalTextDef('portOfDischarge', t('Порт разгрузки', 'Port of discharge'), '', 120),
      optionalTextDef('billOfLadingNumber', t('Коносамент', 'Bill of lading'), '', 64),
      dateTimeDef('shippedAt', t('Дата отгрузки', 'Shipped at'), localInput(plan.plannedShipAt)),
      dateTimeDef('expectedDeliveryAt', t('Ожидаемая доставка', 'Expected delivery'), localInput(plan.expectedDeliveryAt)),
    ];
    remaining.forEach((entry, index) => {
      fields.push(numberDef(`qty${index}`, `${lineLabel(entry.line)} — ${t(`в плане ${entry.line.quantity}, осталось отгрузить ${entry.remaining}`, `planned ${entry.line.quantity}, ${entry.remaining} left to ship`)}`, entry.remaining, true, 0, entry.remaining));
    });
    openForm(t('Уведомление об отгрузке', 'Shipment notice'), fields, async (values) => {
      const body = buildShipmentNotice({ plan, values, quantities: remaining.map((_, index) => values[`qty${index}`]) });
      return mutate(path`/v2/fulfillment-plans/${plan.id}/shipment-notices`, body, 'POST');
    }, stepDone(order, 'уведомление об отгрузке отправлено.', 'the shipment notice is sent.'));
  }

  function receiptForm(order, shipment) {
    const received = receivedByLineId(shipment);
    const fields = [
      textDef('receiptReference', t('Номер приёмки (накладная, акт)', 'Receipt reference'), `GRN-${shipment.shipmentNumber}`.slice(0, 160), 160, true, 2),
      textDef('receivedBy', t('Кто принял', 'Received by'), '', 200, true, 2),
      dateTimeDef('receivedAt', t('Дата приёмки', 'Received at'), localInput()),
      selectDef('receiptComplete', t('Приёмка', 'Receipt'), ['complete', 'partial'], (value) => (value === 'complete'
        ? t('окончательная — недостача фиксируется', 'final — shortage is recorded')
        : t('частичная — остальное ещё довезут', 'partial — the rest is still on its way')), 'complete'),
    ];
    (shipment.lines || []).forEach((line, index) => {
      const already = received.get(line.lineId) || { received: 0 };
      const open = Math.max(Number(line.quantity || 0) - already.received, 0);
      const base = `${lineLabel(line)} — ${t(`отгружено ${line.quantity}, уже принято ${already.received}`, `shipped ${line.quantity}, already received ${already.received}`)}`;
      fields.push(
        numberDef(`received${index}`, `${base}: ${t('пришло сейчас', 'received now')}`, open, true, 0),
        numberDef(`damaged${index}`, `${lineLabel(line)}: ${t('из них повреждено', 'of which damaged')}`, 0, true, 0),
        numberDef(`rejected${index}`, `${lineLabel(line)}: ${t('из них брак', 'of which rejected')}`, 0, true, 0),
      );
    });
    openForm(`${t('Приёмка поставки', 'Receipt of shipment')} ${shipment.shipmentNumber}`, fields, async (values) => {
      const rows = (shipment.lines || []).map((_, index) => ({ received: values[`received${index}`], damaged: values[`damaged${index}`], rejected: values[`rejected${index}`] }));
      return mutate(path`/v2/shipment-notices/${shipment.id}/receipts`, buildReceipt({ shipment, values, rows }), 'POST');
    }, stepDone(order, 'приёмка записана.', 'the receipt is recorded.'));
  }

  function discrepancySummary(discrepancy) {
    const lines = discrepancy?.lines || [];
    const parts = [];
    const shortage = sum(lines, (line) => line.shortageQuantity);
    const damaged = sum(lines, (line) => line.damagedQuantity);
    const rejected = sum(lines, (line) => line.rejectedQuantity);
    const overage = sum(lines, (line) => line.overageQuantity);
    if (shortage) parts.push(t(`недостача ${shortage}`, `shortage ${shortage}`));
    if (damaged) parts.push(t(`повреждено ${damaged}`, `damaged ${damaged}`));
    if (rejected) parts.push(t(`брак ${rejected}`, `rejected ${rejected}`));
    if (overage) parts.push(t(`излишек ${overage}`, `overage ${overage}`));
    return parts.join(', ');
  }

  function claimForm(order, shipment) {
    const discrepancy = shipment.discrepancy;
    openForm(`${t('Претензия по расхождению', 'Discrepancy claim')}: ${discrepancySummary(discrepancy)}`, [
      textDef('claimReference', t('Номер претензии', 'Claim reference'), `CLM-${shipment.shipmentNumber}`.slice(0, 160), 160, true, 2),
      selectDef('requestedRemedy', t('Что требуете', 'Requested remedy'), Object.keys(REMEDIES), (key) => labelled(REMEDIES, key), 'credit'),
      textDef('reason', t('Причина расхождения', 'Reason for the discrepancy'), '', 2000, true, 2),
    ], async (values) => mutate(path`/v2/receipt-discrepancies/${discrepancy.id}/claims`, buildClaim(values), 'POST'), stepDone(order, 'претензия подана.', 'the claim is submitted.'));
  }

  function resolutionForm(order, shipment) {
    const claim = shipment.claim;
    openForm(`${t('Решение по претензии', 'Claim resolution')} ${claim.claimReference}`, [
      selectDef('resolutionType', t('Решение', 'Resolution'), Object.keys(RESOLUTIONS), (key) => labelled(RESOLUTIONS, key), 'accepted-for-credit'),
      textDef('resolutionReason', t('Обоснование', 'Reason'), '', 2000, true, 2),
    ], async (values) => mutate(path`/v2/receipt-claims/${claim.id}/resolutions`, buildResolution(values), 'POST'), stepDone(order, 'решение по претензии записано.', 'the claim resolution is recorded.'));
  }

  async function recoveryForm(order, shipment) {
    const claim = shipment.claim;
    const resolution = shipment.claimResolution;
    const issueLines = (claim?.lines || []).filter((line) => line.orderLineNo != null && line.productSkuId);
    if (!issueLines.length) {
      toast(t('В претензии нет строк с привязкой к SKU: возврат без строки и SKU не вносится.', 'The claim has no SKU-linked lines: a recovery needs a line and SKU.'), 'error');
      return;
    }
    const suppliers = await loadSuppliers(order);
    if (!suppliers.length) {
      toast(t('У бренда нет поставщика, по которому можно вносить возврат. Заведите и аттестуйте поставщика.', 'The brand has no supplier a recovery can be recorded against.'), 'error');
      return;
    }
    openForm(`${t('Возврат от поставщика', 'Supplier recovery')} — ${labelled(RESOLUTIONS, resolution.resolutionType)}`, [
      selectDef('supplierCode', t('Поставщик', 'Supplier'), suppliers, (supplier) => `${supplier.supplierCode}${supplier.name ? ` · ${supplier.name}` : ''}`, suppliers[0].supplierCode),
      selectDef('claimLine', t('Строка претензии', 'Claim line'), issueLines.map((_, index) => String(index)), (key) => {
        const line = issueLines[Number(key)];
        const problem = [line.shortageQuantity && t(`недостача ${line.shortageQuantity}`, `shortage ${line.shortageQuantity}`), line.damagedQuantity && t(`повреждено ${line.damagedQuantity}`, `damaged ${line.damagedQuantity}`), line.rejectedQuantity && t(`брак ${line.rejectedQuantity}`, `rejected ${line.rejectedQuantity}`)].filter(Boolean).join(', ');
        return `${lineLabel(line)}${problem ? ` — ${problem}` : ''}`;
      }, '0'),
      numberDef('amount', t(`Сумма возврата, ${order.currency} (не больше учтённой себестоимости заказа)`, `Recovery amount, ${order.currency} (not above the cost already recorded)`), '', false, 0.01, undefined, '0.01'),
      textDef('sourceRef', t('Документ поставщика (кредит-нота)', 'Supplier document (credit note)'), '', 240),
      dateTimeDef('occurredAt', t('Дата документа', 'Document date'), localInput()),
      textDef('reason', t('Основание', 'Reason'), '', 1000, true, 2),
    ], async (values) => mutate(path`/v2/receipt-claim-resolutions/${resolution.id}/supplier-recoveries`, buildSupplierRecovery({ claim, order, values }), 'POST'), stepDone(order, 'возврат от поставщика записан.', 'the supplier recovery is recorded.'));
  }

  // --- рабочее место ---------------------------------------------------------------------------------

  function when(value) { return value ? formatDate(value) : '—'; }
  function place(location) { return location ? [location.name, location.city, location.countryCode].filter(Boolean).join(', ') : '—'; }

  function fact(label, value) {
    const wrap = el('label');
    wrap.append(el('span', { text: label }), factValue(value));
    return wrap;
  }

  function stepButton(step, order, view, dialog) {
    const plan = (view.plans || []).find((candidate) => candidate.id === step.planId);
    const shipment = plan?.shipments?.find((candidate) => candidate.id === step.shipmentId);
    const open = {
      plan: () => planForm(order, view),
      shipment: () => shipmentForm(order, plan),
      receipt: () => receiptForm(order, shipment),
      claim: () => claimForm(order, shipment),
      resolution: () => resolutionForm(order, shipment),
      recovery: () => recoveryForm(order, shipment),
    }[step.step];
    return actionButton(step.label, open, step.step === 'recovery' ? '' : 'primary');
  }

  function renderPlan(grid, order, view, plan, index, steps, dialog) {
    const prefix = view.plans.length > 1 ? `${index + 1}. ` : '';
    grid.append(el('h4', { text: `${t('План поставки', 'Fulfillment plan')} ${prefix}${place(plan.shipFrom)} → ${place(plan.shipTo)}` }));
    grid.append(fact(t('Отгрузка по плану', 'Planned shipment'), when(plan.plannedShipAt)));
    grid.append(fact(t('Доставка ожидается', 'Expected delivery'), when(plan.expectedDeliveryAt)));
    const shippedLines = shippedByLineId(plan);
    (plan.lines || []).forEach((line) => {
      grid.append(fact(`${lineLabel(line)} · ${labelled(SOURCE_LABELS, line.sourceType)}`, t(`в плане ${line.quantity} · отгружено ${shippedLines.get(line.lineId) || 0}`, `planned ${line.quantity} · shipped ${shippedLines.get(line.lineId) || 0}`)));
    });
    if (!(plan.shipments || []).length) {
      const status = plan.packingStatus === 'packing' ? t('идёт упаковка', 'packing') : plan.packingStatus === 'packed' ? t('товары упакованы', 'packed') : t('не начата', 'not started');
      grid.append(fact(t('Упаковка', 'Packing'), status));
    }
    const actions = el('div', { className: 'dialog-actions' });
    steps.filter((step) => step.planId === plan.id && step.step === 'shipment').forEach((step) => actions.append(stepButton(step, order, view, dialog)));
    if (actions.childNodes.length) grid.append(actions);

    (plan.shipments || []).forEach((shipment) => {
      grid.append(el('h4', { text: `${t('Отгрузка', 'Shipment')} ${shipment.shipmentNumber}` }));
      grid.append(fact(t('Перевозчик', 'Carrier'), `${shipment.carrier || '—'} · ${shipment.serviceLevel || '—'} · ${shipment.trackingNumber || '—'}`));
      grid.append(fact(t('Отгружено', 'Shipped'), `${sum(shipment.lines, (line) => line.quantity)} ${t('шт.', 'units')} · ${when(shipment.shippedAt)} → ${when(shipment.expectedDeliveryAt)}`));
      const received = receivedByLineId(shipment);
      if (!(shipment.receipts || []).length) {
        grid.append(fact(t('Приёмка', 'Receipt'), t('груз в пути', 'in transit')));
      } else {
        (shipment.lines || []).forEach((line) => {
          const entry = received.get(line.lineId) || { received: 0, damaged: 0, rejected: 0 };
          grid.append(fact(lineLabel(line), t(`отгружено ${line.quantity} · пришло ${entry.received} · повреждено ${entry.damaged} · брак ${entry.rejected}`, `shipped ${line.quantity} · received ${entry.received} · damaged ${entry.damaged} · rejected ${entry.rejected}`)));
        });
        grid.append(fact(t('Приёмка', 'Receipt'), receiptFinal(shipment) ? t('окончательная', 'final') : t('частичная — ждём остальное', 'partial — waiting for the rest')));
        const summary = discrepancySummary(shipment.discrepancy);
        grid.append(fact(t('Расхождения', 'Discrepancies'), summary || (receiptFinal(shipment) ? t('нет, поставка сошлась', 'none, shipment matched') : t('пока нет', 'none so far'))));
      }
      if (shipment.claim) {
        grid.append(fact(t('Претензия', 'Claim'), `${shipment.claim.claimReference} · ${labelled(REMEDIES, shipment.claim.requestedRemedy)} · ${shipment.claim.reason}`));
        grid.append(fact(t('Решение по претензии', 'Claim resolution'), shipment.claimResolution
          ? `${labelled(RESOLUTIONS, shipment.claimResolution.resolutionType)} · ${shipment.claimResolution.resolutionReason}`
          : t('ждёт решения бренда', 'awaiting the brand decision')));
      }
      recoveriesOf(shipment).forEach((recovery) => {
        grid.append(fact(t('Возврат от поставщика', 'Supplier recovery'), `${recovery.supplierCode} · ${money(recovery.recoveryAmount, recovery.currency)} · ${recovery.sourceRef}`));
      });
      const row = el('div', { className: 'dialog-actions' });
      steps.filter((step) => step.shipmentId === shipment.id).forEach((step) => row.append(stepButton(step, order, view, dialog)));
      if (row.childNodes.length) grid.append(row);
    });
  }

  global.orderFulfillmentWorkspaceDialog = async function orderFulfillmentWorkspaceDialog(order) {
    const caps = global.SynthaUiCapabilities;
    const [view, allocations, doors] = await Promise.all([
      api(path`/v2/orders/${order.id}/fulfillment`),
      loadAllocations(order),
      loadDoors(order),
    ]);
    if (!view || view.orderId !== order.id) throw new Error(I18N.t('common.requestError'));
    const can = (organisationId, capability) => caps.hasForOrganisation(state.workspace, organisationId, capability);
    const steps = stepsFor({ order, view, can, capabilities: caps.CAPABILITIES });

    const dialog = document.querySelector('#form-dialog'); clear(dialog);
    const body = el('div', { className: 'dialog-body' });
    const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
    const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: t('Отгрузка и приёмка', 'Shipment and receipt') }), close);
    const grid = el('div', { className: 'form-grid' });

    const doorNames = new Map(doors.map((door) => [door.id, `${door.code}${door.name ? ` · ${door.name}` : ''}`]));
    (order.lines || []).forEach((line, index) => {
      const lineNo = index + 1;
      const split = allocations.filter((entry) => entry.lineNo === lineNo && Number(entry.quantity) > 0);
      const planned = plannedByLineNo(view.plans).get(lineNo) || 0;
      const text = split.length
        ? split.map((entry) => `${doorNames.get(entry.retailDoorId) || entry.retailDoorId}: ${entry.quantity}`).join(', ')
        : t('не распределено по точкам', 'not split across doors');
      grid.append(fact(`${lineNo}. ${line.sku}`, t(`заказано ${line.quantity} · в планах ${planned} · точки: ${text}`, `ordered ${line.quantity} · planned ${planned} · doors: ${text}`)));
    });

    if (!view.plans.length) grid.append(el('div', { className: 'empty', text: t('План поставки ещё не создан.', 'No fulfillment plan yet.') }));
    view.plans.forEach((plan, index) => renderPlan(grid, order, view, plan, index, steps, dialog));

    const topActions = el('div', { className: 'dialog-actions' });
    steps.filter((step) => step.step === 'plan').forEach((step) => topActions.append(stepButton(step, order, view, dialog)));
    if (global.orderPackingStatusDialog && view.plans.some((plan) => !(plan.shipments || []).length) && can(order.brandId, caps.CAPABILITIES.FULFILLMENT_MANAGE)) {
      topActions.append(actionButton(t('Упаковка', 'Packing'), () => global.orderPackingStatusDialog(order)));
    }
    if (!steps.length && !topActions.childNodes.length) {
      grid.append(el('p', { className: 'od-hint-note', text: t('Для вашей роли сейчас нет доступных шагов: ход за другой стороной или цепочка завершена.', 'There is no step for your role right now: it is the other side’s move, or the chain is complete.') }));
    }
    if (topActions.childNodes.length) grid.append(topActions);

    close.addEventListener('click', () => dialog.close());
    body.append(head, grid); dialog.append(body); if (!dialog.open) dialog.showModal();
  };

  global.SynthaFulfillmentForms = Object.freeze({
    SOURCE_TYPES, REMEDIES, RESOLUTIONS, RECOVERABLE_RESOLUTIONS,
    stepsFor, plannedByLineNo, planRemaining, receivedByLineId, discrepancySummary,
    buildSupplyCommitment, buildFulfillmentPlan, buildShipmentNotice, buildReceipt, buildClaim, buildResolution, buildSupplierRecovery, locationFromDoor,
    planForm, shipmentForm, receiptForm, claimForm, resolutionForm, recoveryForm,
  });
})(window);
