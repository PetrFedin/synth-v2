(function installOrderEconomicsWorkspace(global) {
  'use strict';

  // «Экономика заказа» — рабочее место финансиста и владельца для денежной цепочки подтверждённого
  // заказа. Цепочка целиком была в API и в домене (обязательство поставки → курс → затраты →
  // посадочная себестоимость → распределение → маржа → готовность → закрытие → корректировка →
  // сверка распределения), но экран только читал позицию: ни одной кнопки записи, и каждый шаг
  // делался скриптом с идентификаторами снимков, которые негде было посмотреть.
  //
  // Правило этого файла то же, что у `product-chain-forms.js`: тела запросов собирают чистые функции
  // `build*` по границам, которые держит домен (`modules/order-economics`) и контракты маршрутов, а
  // экран только собирает значения и зовёт маршруты. Что уже записано, берётся с сервера
  // (`GET /v2/orders/{id}/economics-ledger`), а не из памяти страницы: после перезагрузки цепочка
  // продолжается с того же места. Состояние шагов (`deriveSteps`) — тоже чистая функция: что сделано,
  // что блокирует следующий шаг и что нужно ввести.

  const COST_TYPES = Object.freeze([
    ['factory', 'Фабрика (пошив)', 'Factory'], ['material', 'Материалы', 'Materials'], ['labor', 'Работа', 'Labor'],
    ['freight', 'Фрахт', 'Freight'], ['insurance', 'Страховка груза', 'Cargo insurance'], ['duty', 'Пошлина', 'Duty'],
    ['brokerage', 'Брокер', 'Brokerage'], ['warehouse', 'Склад', 'Warehouse'], ['quality', 'Контроль качества', 'Quality'],
    ['rework', 'Переделка', 'Rework'], ['packaging', 'Упаковка', 'Packaging'], ['commission', 'Комиссия', 'Commission'],
    ['other', 'Прочее', 'Other'],
  ]);
  const SUPPLY_SOURCES = Object.freeze([
    ['inventory', 'Со склада', 'From stock'], ['inbound', 'Поставка в пути', 'Inbound shipment'],
    ['production', 'Производство', 'Production'], ['drop-ship', 'Прямая отгрузка', 'Drop-ship'],
  ]);
  const FX_RATE_TYPES = Object.freeze([
    ['plan', 'Плановый', 'Plan'], ['budget', 'Бюджетный', 'Budget'], ['po', 'По заказу фабрике', 'Purchase order'],
    ['invoice', 'По счёту', 'Invoice'], ['accounting', 'Учётный', 'Accounting'], ['settlement', 'По факту оплаты', 'Settlement'],
  ]);
  // `custom` требует весов по каждой затрате и строке заказа — из интерфейса их не ввести. `direct` на
  // канонических заказах требует у каждой затраты orderLineNo + productSkuId (иначе 422
  // COST_ALLOCATION_DIRECT_EXACT_IDENTITY_REQUIRED), а форма затрат их не отправляет, поэтому обе базы
  // не предлагаются: новая политика создаётся только с двумя остальными.
  const ALLOCATION_BASES = Object.freeze([
    ['unit', 'По штукам', 'By units'],
    ['net_value', 'По стоимости строк заказа', 'By order line value'],
  ]);
  const UNUSABLE_BASES = new Set(['custom', 'direct']);
  const READINESS_TYPES = Object.freeze(['factory', 'freight', 'duty', 'credits']);
  const READINESS_COST_TYPES = Object.freeze({
    factory: Object.freeze(['factory', 'material', 'labor', 'packaging']),
    freight: Object.freeze(['freight', 'insurance', 'brokerage', 'warehouse']),
    duty: Object.freeze(['duty']),
  });
  const READINESS_LABELS = Object.freeze({
    factory: ['Фабричные затраты', 'Factory costs'],
    freight: ['Фрахт', 'Freight'],
    duty: ['Пошлина', 'Duty'],
    credits: ['Кредитные корректировки', 'Credits'],
  });
  const CLOSED_STATUSES = Object.freeze(['CLOSED', 'ADJUSTED']);

  function t(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function pair(list, key) { const row = list.find((item) => item[0] === key); return row ? t(row[1], row[2]) : key; }

  function readinessLabel(type) { return t(READINESS_LABELS[type][0], READINESS_LABELS[type][1]); }

  function fail(code, ru, en) {
    const error = new Error(t(ru, en));
    error.code = code;
    throw error;
  }

  function caps() { return global.SynthaUiCapabilities; }

  // Право проверяется на организации бренда заказа: экономику ведёт бренд.
  function capabilitiesFor(order) {
    const c = caps();
    const has = (capability) => Boolean(c?.hasForOrganisation(state.workspace, order.brandId, capability));
    return Object.freeze({
      read: has(c?.CAPABILITIES?.MARGIN_READ),
      cost: has(c?.CAPABILITIES?.COST_MANAGE),
      supply: has(c?.CAPABILITIES?.SUPPLY_MANAGE),
    });
  }

  // --- разбор введённого ---------------------------------------------------------------------------

  function parseDecimal(raw, { maxDecimals, label, labelEn, signed = false, code = 'ECONOMICS_NUMBER_INVALID' }) {
    const text = String(raw ?? '').trim().replace(',', '.');
    const pattern = new RegExp(`^${signed ? '-?' : ''}\\d+(?:\\.\\d{1,${maxDecimals}})?$`);
    if (!pattern.test(text)) {
      fail(code, `${label}: число не больше чем с ${maxDecimals} знаками после запятой${signed ? ' (минус — для кредита)' : ''}.`, `${labelEn}: a number with at most ${maxDecimals} decimal places${signed ? ' (a minus sign is a credit)' : ''}.`);
    }
    const value = Number(text);
    if (!Number.isFinite(value)) fail(code, `${label}: неверное число.`, `${labelEn}: not a valid number.`);
    return value;
  }

  function currencyCode(raw, label, labelEn) {
    const code = String(raw ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) fail('ECONOMICS_CURRENCY_INVALID', `${label}: трёхбуквенный код ISO 4217, например EUR.`, `${labelEn}: a three-letter ISO 4217 code, for example EUR.`);
    return code;
  }

  function requireText(raw, max, label, labelEn, code = 'ECONOMICS_TEXT_INVALID') {
    const text = String(raw ?? '').trim();
    if (!text || text.length > max) fail(code, `${label}: от 1 до ${max} символов.`, `${labelEn}: 1 to ${max} characters.`);
    return text;
  }

  function dayToTimestamp(raw, label, labelEn) {
    const text = String(raw ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) fail('ECONOMICS_DATE_INVALID', `${label}: укажите дату.`, `${labelEn}: enter a date.`);
    return `${text}T00:00:00.000Z`;
  }

  function optionalDayToTimestamp(raw) {
    const text = String(raw ?? '').trim();
    return text ? dayToTimestamp(text, 'Дата', 'Date') : null;
  }

  // --- сборщики полезной нагрузки (чистые) ----------------------------------------------------------

  // Маршрут принимает у строки только `sku`, `quantity`, `sourceType`, `sourceRef`, `expectedAvailabilityAt`;
  // строка заказа определяется по SKU, поэтому SKU, повторённый в двух строках, однозначно назвать нельзя.
  function buildSupplyCommitment({ lines, quantities, sourceType, sourceRef, expectedAvailabilityAt }) {
    if (!SUPPLY_SOURCES.some((row) => row[0] === sourceType)) fail('SUPPLY_COMMITMENT_SOURCE_INVALID', 'Выберите источник поставки.', 'Choose a supply source.');
    const reference = requireText(sourceRef, 200, 'Ссылка на источник', 'Source reference', 'SUPPLY_COMMITMENT_SOURCE_REF_REQUIRED');
    const available = optionalDayToTimestamp(expectedAvailabilityAt);
    const allocations = [];
    for (const line of lines) {
      const raw = quantities?.[line.lineNo];
      if (raw === null || raw === undefined || raw === '' || Number.isNaN(Number(raw)) || Number(raw) === 0) continue;
      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || quantity < 1) fail('SUPPLY_COMMITMENT_QUANTITY_INVALID', `Строка ${line.sku}: количество — целое число больше нуля.`, `Line ${line.sku}: quantity is a whole number above zero.`);
      if (quantity > line.quantity) fail('SUPPLY_COMMITMENT_EXCEEDS_ORDER', `Строка ${line.sku}: обязательство больше количества в заказе (${line.quantity}).`, `Line ${line.sku}: the commitment exceeds the ordered quantity (${line.quantity}).`);
      if (lines.filter((other) => other.sku === line.sku).length > 1) fail('SUPPLY_COMMITMENT_ORDER_LINE_AMBIGUOUS', `SKU ${line.sku} стоит в заказе в нескольких строках: обязательство по нему из интерфейса не записать.`, `SKU ${line.sku} is on several order lines, so a commitment for it cannot be recorded from the interface.`);
      allocations.push({ sku: line.sku, quantity, sourceType, sourceRef: reference, ...(available ? { expectedAvailabilityAt: available } : {}) });
    }
    if (!allocations.length) fail('SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED', 'Укажите количество хотя бы по одной строке заказа.', 'Enter a quantity for at least one order line.');
    return { allocations };
  }

  function buildFxRate({ orderCurrency, sourceCurrency, rate, rateType, sourceRef, effectiveAt }) {
    const source = currencyCode(sourceCurrency, 'Валюта затрат', 'Cost currency');
    if (source === orderCurrency) fail('FX_RATE_CURRENCY_PAIR_INVALID', 'Курс нужен для валюты, отличной от валюты заказа.', 'A rate is needed for a currency other than the order currency.');
    const value = parseDecimal(rate, { maxDecimals: 8, label: 'Курс', labelEn: 'Rate', code: 'FX_RATE_INVALID' });
    if (value < 0.000001 || value > 1000000) fail('FX_RATE_INVALID', 'Курс должен быть от 0,000001 до 1 000 000.', 'The rate must be between 0.000001 and 1,000,000.');
    if (!FX_RATE_TYPES.some((row) => row[0] === rateType)) fail('FX_RATE_TYPE_INVALID', 'Выберите тип курса.', 'Choose a rate type.');
    return {
      sourceCurrency: source,
      rate: value,
      rateType,
      sourceRef: requireText(sourceRef, 200, 'Основание курса', 'Rate basis', 'FX_RATE_SOURCE_REF_REQUIRED'),
      effectiveAt: dayToTimestamp(effectiveAt, 'Дата курса', 'Rate date'),
    };
  }

  // Затрата в валюте заказа не несёт курса (сервер отвергает лишний `fxRateSnapshotId`), затрата в
  // другой валюте обязана нести курс именно этой пары.
  function costBasis({ orderCurrency, fxRateSnapshots, supplyCommitmentSnapshotId, costType, amount, currency, fxRateSnapshotId, sourceRef, occurredAt }) {
    if (!supplyCommitmentSnapshotId) fail('ACTUAL_COST_SUPPLY_COMMITMENT_REQUIRED', 'Выберите обязательство поставки, к которому относится затрата.', 'Choose the supply commitment the cost belongs to.');
    if (!COST_TYPES.some((row) => row[0] === costType)) fail('ACTUAL_COST_TYPE_INVALID', 'Выберите вид затраты.', 'Choose a cost type.');
    const value = parseDecimal(amount, { maxDecimals: 4, label: 'Сумма', labelEn: 'Amount', signed: true, code: 'ACTUAL_COST_AMOUNT_INVALID' });
    if (value === 0) fail('ACTUAL_COST_AMOUNT_INVALID', 'Сумма затраты не может быть нулевой.', 'The cost amount cannot be zero.');
    const code = currencyCode(currency, 'Валюта', 'Currency');
    const body = {
      supplyCommitmentSnapshotId,
      costType,
      amount: value,
      currency: code,
      sourceRef: requireText(sourceRef, 200, 'Документ-основание', 'Source document', 'ACTUAL_COST_SOURCE_REF_REQUIRED'),
      occurredAt: dayToTimestamp(occurredAt, 'Дата затраты', 'Cost date'),
    };
    if (code !== orderCurrency) {
      const fx = (fxRateSnapshots ?? []).find((item) => item.id === fxRateSnapshotId && item.sourceCurrency === code && item.targetCurrency === orderCurrency);
      if (!fx) fail('ACTUAL_COST_FX_REQUIRED', `Для затраты в ${code} нужен курс ${code} → ${orderCurrency}: запишите курс и выберите его.`, `A cost in ${code} needs a ${code} to ${orderCurrency} rate: record a rate and choose it.`);
      body.fxRateSnapshotId = fx.id;
    }
    return body;
  }

  function buildActualCost(input) { return costBasis(input); }

  function buildPostCloseAdjustment(input) {
    const reason = requireText(input.reason, 1000, 'Причина корректировки', 'Adjustment reason', 'POST_CLOSE_ADJUSTMENT_REASON_REQUIRED');
    return { reason, ...costBasis(input) };
  }

  function buildAllocationPolicy({ name, version, defaultBasis }) {
    const title = requireText(name, 160, 'Название политики', 'Policy name', 'COST_ALLOCATION_POLICY_NAME_INVALID');
    const number = Number(version);
    if (!Number.isInteger(number) || number < 1) fail('COST_ALLOCATION_POLICY_VERSION_INVALID', 'Версия политики — целое число от 1.', 'The policy version is a whole number from 1.');
    if (!ALLOCATION_BASES.some((row) => row[0] === defaultBasis)) fail('COST_ALLOCATION_DEFAULT_BASIS_INVALID', 'Выберите базу распределения.', 'Choose an allocation basis.');
    return { name: title, version: number, defaultBasis, rules: [] };
  }

  function usablePolicies(ledger) {
    return (ledger.allocationPolicies ?? []).filter((policy) => policy.status === 'approved'
      && !UNUSABLE_BASES.has(policy.defaultBasis) && !policy.rules.some((rule) => UNUSABLE_BASES.has(rule.basis)));
  }

  function buildAllocationRun({ landedCost, policy }) {
    if (!landedCost?.id) fail('LANDED_COST_SNAPSHOT_NOT_FOUND', 'Сначала зафиксируйте посадочную себестоимость.', 'Record the landed cost first.');
    if (!policy?.id) fail('COST_ALLOCATION_POLICY_NOT_FOUND', 'Выберите политику распределения.', 'Choose an allocation policy.');
    return { landedCostSnapshotId: landedCost.id, policyVersionId: policy.id };
  }

  function buildMarginActualization({ landedCost, allocationRun }) {
    if (!landedCost?.id) fail('LANDED_COST_SNAPSHOT_NOT_FOUND', 'Сначала зафиксируйте посадочную себестоимость.', 'Record the landed cost first.');
    return { landedCostSnapshotId: landedCost.id, ...(allocationRun?.id ? { costAllocationRunSnapshotId: allocationRun.id } : {}) };
  }

  function activeCosts(ledger) { return (ledger.actualCosts ?? []).filter((entry) => entry.entryKind === 'actual' && !entry.reversed); }

  // Доказательства для выполненного требования — все подходящие действующие записи, как их отбирает
  // домен: те же виды затрат, а для кредитов — отрицательные суммы.
  function evidenceFor(type, ledger) {
    return activeCosts(ledger)
      .filter((entry) => (type === 'credits' ? entry.amount < 0 : READINESS_COST_TYPES[type].includes(entry.costType)))
      .map((entry) => entry.id).sort();
  }

  function defaultReadinessStatus(type, ledger) { return evidenceFor(type, ledger).length ? 'complete' : 'pending'; }

  function buildReadiness({ landedCost, margin, ledger, choices }) {
    if (!landedCost?.current) fail('COST_CLOSE_READINESS_STALE_LANDED_COST', 'Посадочная себестоимость устарела: зафиксируйте её заново.', 'The landed cost is out of date: record it again.');
    if (!margin?.id) fail('MARGIN_ACTUALIZATION_NOT_FOUND', 'Сначала актуализируйте маржу.', 'Actualise the margin first.');
    const requirements = READINESS_TYPES.map((type) => {
      const choice = choices?.[type] ?? {};
      const status = choice.status ?? defaultReadinessStatus(type, ledger);
      if (status === 'complete') {
        const ids = evidenceFor(type, ledger);
        if (!ids.length) fail('COST_CLOSE_READINESS_EVIDENCE_REQUIRED', `«${READINESS_LABELS[type][0]}»: нет ни одной подходящей затраты — отметьте «ожидается» или «не требуется» с причиной.`, `"${READINESS_LABELS[type][1]}": there is no matching cost - mark it pending or waived with a reason.`);
        return { type, status, evidenceEntryIds: ids };
      }
      if (status === 'waived') {
        const reason = String(choice.waiverReason ?? '').trim();
        if (!reason || reason.length > 1000) fail('COST_CLOSE_READINESS_WAIVER_REASON_REQUIRED', `«${READINESS_LABELS[type][0]}»: причина отказа от требования — от 1 до 1000 символов.`, `"${READINESS_LABELS[type][1]}": the waiver reason is 1 to 1000 characters.`);
        return { type, status, evidenceEntryIds: [], waiverReason: reason };
      }
      if (status !== 'pending') fail('COST_CLOSE_READINESS_REQUIREMENT_STATUS_INVALID', 'Неизвестное состояние требования.', 'Unknown requirement state.');
      return { type, status, evidenceEntryIds: [] };
    });
    return { landedCostSnapshotId: landedCost.id, marginActualizationSnapshotId: margin.id, requirements };
  }

  function buildCostClose({ readiness }) {
    if (!readiness?.id) fail('COST_CLOSE_READINESS_REQUIRED', 'Сначала проверьте готовность к закрытию.', 'Check close readiness first.');
    return { landedCostSnapshotId: readiness.landedCostSnapshotId, marginActualizationSnapshotId: readiness.marginActualizationSnapshotId, costCloseReadinessSnapshotId: readiness.id };
  }

  function buildReconciliation({ allocationRun }) {
    if (!allocationRun?.id) fail('COST_ALLOCATION_RUN_ID_REQUIRED', 'Сначала сделайте прогон распределения для себестоимости после корректировки.', 'Run the allocation for the post-adjustment landed cost first.');
    return { costAllocationRunSnapshotId: allocationRun.id };
  }

  // --- состояние шагов (чистая функция) ------------------------------------------------------------

  function last(list) { return list && list.length ? list[list.length - 1] : null; }

  function deriveState(position, ledger) {
    const closed = CLOSED_STATUSES.includes(position.status) || Boolean(position.costCloseSnapshotId);
    const costs = activeCosts(ledger);
    const landed = last(ledger.landedCosts);
    const landedCurrent = Boolean(landed?.current);
    const run = landed ? last((ledger.allocationRuns ?? []).filter((item) => item.landedCostSnapshotId === landed.id)) : null;
    const margin = landed ? last((ledger.marginActualizations ?? []).filter((item) => item.landedCostSnapshotId === landed.id)) : null;
    // Канонический заказ (`product-sku-v2`) принимает маржу только с точным прогоном распределения;
    // у устаревшего (`legacy`) распределения нет, и маржа считается без него.
    const canonical = ledger.lineageMode === 'product-sku-v2';
    const legacy = ledger.lineageMode === 'legacy';
    const marginDone = Boolean(margin) && (canonical ? Boolean(run) && margin.costAllocationRunSnapshotId === run.id : true);
    const readiness = ledger.readiness;
    const readinessDone = Boolean(readiness && landed && margin && readiness.landedCostSnapshotId === landed.id
      && readiness.marginActualizationSnapshotId === margin.id && position.status !== 'STALE');
    const adjustment = last(ledger.postCloseAdjustments);
    const adjustmentRun = adjustment ? last((ledger.allocationRuns ?? []).filter((item) => item.landedCostSnapshotId === adjustment.landedCostSnapshotId)) : null;
    return { closed, canonical, legacy, costs, landed, landedCurrent, run, margin, marginDone, readiness, readinessDone, adjustment, adjustmentRun };
  }

  function blockingText(position) {
    const labels = {
      readiness_not_evaluated: ['готовность ещё не проверялась', 'readiness has not been checked'],
      ledger_changed: ['реестр затрат изменился после проверки', 'the cost ledger changed after the check'],
      factory: ['фабричные затраты не подтверждены', 'factory costs are not confirmed'],
      freight: ['фрахт не подтверждён', 'freight is not confirmed'],
      duty: ['пошлина не подтверждена', 'duty is not confirmed'],
      credits: ['кредитные корректировки не подтверждены', 'credits are not confirmed'],
    };
    return (position.blockingReasons ?? []).map((reason) => (labels[reason] ? t(labels[reason][0], labels[reason][1]) : reason)).join(', ');
  }

  function deriveSteps({ position, ledger, can }) {
    const s = deriveState(position, ledger);
    const noCost = t('Нужно право «Фактические затраты» (финансы, владелец, администратор).', 'The "Actual costs" permission is required (finance, owner, admin).');
    const noSupply = t('Нужно право «Обязательства поставки» (продажи, владелец, администратор).', 'The "Supply commitments" permission is required (sales, owner, admin).');
    const closedReason = t('Себестоимость закрыта: изменения вносятся корректировкой после закрытия.', 'Cost is closed: changes go through a post-close adjustment.');
    const action = (id, label, enabled, reason) => ({ id, label, enabled: Boolean(enabled), reason: enabled ? null : reason });
    const needCost = (reason) => (!can.cost ? noCost : reason);

    const steps = [];
    const push = (step) => steps.push({ number: steps.length + 1, summary: [], blocker: null, needs: null, ...step });

    const supplyCount = ledger.supplyCommitments.length;
    push({
      id: 'supply',
      title: t('Обязательство поставки', 'Supply commitment'),
      state: supplyCount ? 'done' : 'todo',
      summary: ledger.supplyCommitments.map((item) => t(`${item.id}: ${item.allocations.length} поз., ${item.allocations.reduce((sum, a) => sum + a.quantity, 0)} шт.`, `${item.id}: ${item.allocations.length} lines, ${item.allocations.reduce((sum, a) => sum + a.quantity, 0)} pcs`)),
      needs: t('Количество по строкам заказа, источник поставки и ссылка на него.', 'Quantity per order line, the supply source and a reference to it.'),
      actions: [action('supply', supplyCount ? t('Добавить обязательство', 'Add a commitment') : t('Записать обязательство', 'Record commitment'), can.supply, noSupply)],
    });
    push({
      id: 'fx',
      title: t('Курс (если затраты в другой валюте)', 'Exchange rate (if costs are in another currency)'),
      state: ledger.fxRateSnapshots.length ? 'done' : 'optional',
      summary: ledger.fxRateSnapshots.map((item) => `${item.sourceCurrency} → ${item.targetCurrency}: ${item.rate} · ${pair(FX_RATE_TYPES, item.rateType)}`),
      needs: t('Валюта затрат, курс к валюте заказа, тип курса, основание и дата.', 'Cost currency, the rate to the order currency, rate type, basis and date.'),
      actions: [action('fx', t('Записать курс', 'Record rate'), can.cost, noCost)],
    });
    push({
      id: 'cost',
      title: t('Фактические затраты', 'Actual costs'),
      state: s.costs.length ? 'done' : 'todo',
      summary: s.costs.map((item) => `${pair(COST_TYPES, item.costType)}: ${item.sourceAmount} ${item.sourceCurrency}${item.sourceCurrency === item.currency ? '' : ` = ${item.amount} ${item.currency}`}`),
      blocker: supplyCount ? null : t('Сначала запишите обязательство поставки: затрата привязывается к нему.', 'Record a supply commitment first: a cost is tied to it.'),
      needs: t('Вид затраты, сумма (минус — кредит), валюта, документ-основание и дата.', 'Cost type, amount (a minus sign is a credit), currency, source document and date.'),
      actions: [action('cost', t('Записать затрату', 'Record cost'), can.cost && supplyCount > 0 && !s.closed,
        needCost(s.closed ? closedReason : t('Сначала запишите обязательство поставки.', 'Record a supply commitment first.')))],
    });
    push({
      id: 'landed',
      title: t('Посадочная себестоимость', 'Landed cost'),
      state: s.landedCurrent ? 'done' : 'todo',
      summary: s.landed ? [t(`Снимок ${s.landed.id}: ${s.landed.totalCost} ${s.landed.currency}${s.landed.current ? '' : ' — устарел, реестр затрат изменился'}`, `Snapshot ${s.landed.id}: ${s.landed.totalCost} ${s.landed.currency}${s.landed.current ? '' : ' - out of date, the cost ledger changed'}`)] : [],
      blocker: s.costs.length ? null : t('Нет ни одной действующей затраты.', 'There is no active cost.'),
      needs: t('Ничего вводить не нужно: снимок собирается из текущего реестра затрат.', 'Nothing to enter: the snapshot is built from the current cost ledger.'),
      actions: [action('landed', t('Зафиксировать себестоимость', 'Record landed cost'), can.cost && s.costs.length > 0 && !s.closed && !s.landedCurrent,
        needCost(s.closed ? closedReason : (s.landedCurrent ? t('Снимок уже актуален.', 'The snapshot is already current.') : t('Сначала запишите затраты.', 'Record costs first.'))))],
    });
    const policies = usablePolicies(ledger);
    const postCloseRunNeeded = s.closed && s.adjustment && s.adjustment.resultingAllocationStatus === 'pending-post-close' && !s.adjustment.reconciled && !s.adjustmentRun;
    const runEnabled = can.cost && !s.legacy && policies.length > 0 && Boolean(s.landed) && (s.closed ? postCloseRunNeeded : (s.landedCurrent && !s.run));
    push({
      id: 'allocation',
      title: t('Распределение затрат по SKU', 'Cost allocation per SKU'),
      state: s.legacy ? 'locked' : (s.run ? 'done' : (s.canonical ? 'todo' : 'optional')),
      summary: [
        ...(s.legacy ? [t('Не применимо: в заказе нет привязки строк к каноническим SKU.', 'Not applicable: the order lines are not tied to canonical SKUs.')] : []),
        ...(s.run ? [t(`Прогон ${s.run.id}: ${s.run.allocatedTotal} ${s.run.currency}`, `Run ${s.run.id}: ${s.run.allocatedTotal} ${s.run.currency}`)] : []),
        policies.length ? t(`Политик для выбора: ${policies.length}`, `Policies to choose from: ${policies.length}`) : t('Политик распределения ещё нет.', 'There is no allocation policy yet.'),
      ],
      blocker: s.landed ? null : t('Сначала зафиксируйте посадочную себестоимость.', 'Record the landed cost first.'),
      needs: t('Политика распределения (база: прямая, по штукам или по стоимости строк). Для заказа с каноническими SKU маржа без прогона не актуализируется.', 'An allocation policy (basis: direct, by units or by line value).'),
      actions: [
        action('policy', t('Создать политику', 'Create policy'), can.cost && !s.legacy, needCost(t('Для этого заказа распределение не применимо.', 'Allocation is not applicable to this order.'))),
        action('allocation', t('Прогон распределения', 'Run allocation'), runEnabled,
          needCost(s.legacy ? t('Для этого заказа распределение не применимо.', 'Allocation is not applicable to this order.') : !policies.length ? t('Сначала создайте политику распределения.', 'Create an allocation policy first.')
            : (!s.landed ? t('Сначала зафиксируйте себестоимость.', 'Record the landed cost first.')
              : (s.closed ? t('Прогон после закрытия нужен только для несверенной корректировки.', 'A post-close run is only needed for an unreconciled adjustment.')
                : (s.run ? t('Прогон по этой себестоимости уже есть.', 'There is already a run for this landed cost.') : t('Себестоимость устарела: зафиксируйте её заново.', 'The landed cost is out of date: record it again.'))))),
        ),
      ],
    });
    const marginText = s.margin ? t(`Маржа ${s.margin.contributionMarginAmount} (${s.margin.contributionMarginPercent}%)${s.margin.costAllocationRunSnapshotId ? ', с распределением по SKU' : ', без распределения по SKU'}`, `Margin ${s.margin.contributionMarginAmount} (${s.margin.contributionMarginPercent}%)${s.margin.costAllocationRunSnapshotId ? ', with per-SKU allocation' : ', without per-SKU allocation'}`) : null;
    push({
      id: 'margin',
      title: t('Актуализация маржи', 'Margin actualisation'),
      state: s.marginDone ? 'done' : 'todo',
      summary: marginText ? [marginText] : [],
      blocker: !s.landedCurrent ? t('Нужна актуальная посадочная себестоимость.', 'A current landed cost is required.')
        : (s.canonical && !s.run ? t('Для заказа с каноническими SKU нужен прогон распределения затрат.', 'An order with canonical SKUs needs a cost allocation run.')
          : (s.margin && s.run && !s.marginDone ? t('Есть прогон распределения, которого маржа ещё не учла.', 'There is an allocation run the margin does not reflect yet.') : null)),
      needs: t('Ничего вводить не нужно: используется последний снимок себестоимости и, если есть, его прогон распределения.', 'Nothing to enter: the latest landed cost and, if there is one, its allocation run are used.'),
      actions: [action('margin', t('Актуализировать маржу', 'Actualise margin'), can.cost && s.landedCurrent && !s.marginDone && !s.closed && (!s.canonical || Boolean(s.run)),
        needCost(s.closed ? closedReason : (s.marginDone ? t('Маржа уже актуальна.', 'The margin is already current.') : (s.landedCurrent ? t('Сначала сделайте прогон распределения затрат.', 'Run the cost allocation first.') : t('Нужна актуальная посадочная себестоимость.', 'A current landed cost is required.')))))],
    });
    const readinessText = s.readiness ? [`${t('Проверка', 'Check')} ${s.readiness.id}: ${s.readiness.requirements.map((item) => `${readinessLabel(item.type)} — ${readinessStateLabel(item.status)}`).join('; ')}`] : [];
    push({
      id: 'readiness',
      title: t('Проверка готовности к закрытию', 'Close readiness check'),
      state: s.readinessDone ? 'done' : 'todo',
      summary: readinessText,
      blocker: s.marginDone ? (position.status === 'STALE' ? t('Реестр затрат изменился после проверки: проверьте заново.', 'The cost ledger changed after the check: check again.') : null) : t('Сначала актуализируйте маржу.', 'Actualise the margin first.'),
      needs: t('По каждому требованию (фабрика, фрахт, пошлина, кредиты): подтверждено, ожидается или не требуется с причиной.', 'For each requirement (factory, freight, duty, credits): confirmed, pending or waived with a reason.'),
      actions: [action('readiness', t('Проверить готовность', 'Check readiness'), can.cost && s.marginDone && !s.closed && !(s.readinessDone && position.status === 'READY_TO_CLOSE'),
        needCost(s.closed ? closedReason : (s.marginDone ? t('Готовность уже подтверждена.', 'Readiness is already confirmed.') : t('Сначала актуализируйте маржу.', 'Actualise the margin first.'))))],
    });
    const ready = position.status === 'READY_TO_CLOSE';
    push({
      id: 'close',
      title: t('Закрытие себестоимости', 'Cost close'),
      state: s.closed ? 'done' : 'todo',
      summary: s.closed ? [t(`Закрыто: ${position.costCloseSnapshotId}`, `Closed: ${position.costCloseSnapshotId}`)] : [],
      blocker: s.closed || ready ? null : (blockingText(position) || t('Готовность не подтверждена.', 'Readiness is not confirmed.')),
      needs: t('Подтверждение: закрытие необратимо.', 'Confirmation: closing cannot be undone.'),
      actions: [action('close', t('Закрыть себестоимость', 'Close cost'), can.cost && ready && !s.closed,
        needCost(s.closed ? closedReason : (blockingText(position) || t('Готовность не подтверждена.', 'Readiness is not confirmed.'))))],
    });
    push({
      id: 'adjustment',
      title: t('Корректировка после закрытия', 'Post-close adjustment'),
      state: s.closed ? (s.adjustment ? 'done' : 'optional') : 'locked',
      summary: ledger.postCloseAdjustments.map((item) => t(`${item.id}: ${item.reason} (себестоимость ${item.costDeltaAmount > 0 ? '+' : ''}${item.costDeltaAmount})`, `${item.id}: ${item.reason} (cost ${item.costDeltaAmount > 0 ? '+' : ''}${item.costDeltaAmount})`)),
      blocker: s.closed ? null : t('Доступна только после закрытия себестоимости.', 'Available only after the cost is closed.'),
      needs: t('Причина, обязательство поставки, вид затраты, сумма, валюта, документ-основание и дата.', 'Reason, supply commitment, cost type, amount, currency, source document and date.'),
      actions: [action('adjustment', t('Внести корректировку', 'Record adjustment'), can.cost && s.closed && supplyCount > 0,
        needCost(s.closed ? t('Нет обязательства поставки.', 'There is no supply commitment.') : t('Доступна только после закрытия.', 'Available only after the close.')))],
    });
    const needsReconcile = Boolean(s.adjustment && s.adjustment.resultingAllocationStatus === 'pending-post-close' && !s.adjustment.reconciled);
    push({
      id: 'reconcile',
      title: t('Сверка распределения после корректировки', 'Post-adjustment allocation reconciliation'),
      state: !s.closed || !s.adjustment || (!needsReconcile && !s.adjustment.reconciled) ? 'locked' : (s.adjustment.reconciled ? 'done' : 'todo'),
      summary: s.adjustment ? [s.adjustment.reconciled ? t('Последняя корректировка сверена.', 'The latest adjustment is reconciled.') : t('Маржа по последней корректировке предварительная: ждёт точного распределения.', 'The margin after the latest adjustment is provisional: it awaits the exact allocation.')] : [],
      blocker: needsReconcile && !s.adjustmentRun ? t('Сначала сделайте прогон распределения (шаг «Распределение затрат по SKU»).', 'Run the allocation first (the "Cost allocation per SKU" step).') : (needsReconcile ? null : t('Нет корректировки, которую нужно сверять.', 'There is no adjustment to reconcile.')),
      needs: t('Ничего вводить не нужно: используется прогон по себестоимости после корректировки.', 'Nothing to enter: the run for the post-adjustment landed cost is used.'),
      actions: [action('reconcile', t('Сверить распределение', 'Reconcile allocation'), can.cost && s.closed && needsReconcile && Boolean(s.adjustmentRun),
        needCost(!s.closed ? t('Доступна только после закрытия.', 'Available only after the close.') : (!needsReconcile ? t('Нечего сверять.', 'Nothing to reconcile.') : t('Сначала сделайте прогон распределения.', 'Run the allocation first.'))))],
    });
    return steps;
  }

  function readinessStateLabel(status) {
    return status === 'complete' ? t('подтверждено', 'confirmed') : (status === 'waived' ? t('не требуется', 'waived') : t('ожидается', 'pending'));
  }

  // --- действия: каждое — функция, которая зовёт маршрут и возвращает управление экрану ---------------

  const ROUTES = Object.freeze({
    supply: (id) => `/v2/orders/${encodeURIComponent(id)}/supply-commitments`,
    fx: (id) => `/v2/orders/${encodeURIComponent(id)}/fx-rate-snapshots`,
    cost: (id) => `/v2/orders/${encodeURIComponent(id)}/actual-costs`,
    landed: (id) => `/v2/orders/${encodeURIComponent(id)}/landed-cost/actualize`,
    allocation: (id) => `/v2/orders/${encodeURIComponent(id)}/cost-allocation-runs`,
    margin: (id) => `/v2/orders/${encodeURIComponent(id)}/margin/actualize`,
    readiness: (id) => `/v2/orders/${encodeURIComponent(id)}/cost-close/readiness`,
    close: (id) => `/v2/orders/${encodeURIComponent(id)}/cost-close`,
    adjustment: (id) => `/v2/orders/${encodeURIComponent(id)}/cost-close/adjustments`,
    reconcile: (id, adjustmentId) => `/v2/orders/${encodeURIComponent(id)}/cost-close/adjustments/${encodeURIComponent(adjustmentId)}/allocation-reconcile`,
    policy: (brandId) => `/v2/brands/${encodeURIComponent(brandId)}/cost-allocation-policies`,
    position: (id) => `/v2/orders/${encodeURIComponent(id)}/economics-position`,
    ledger: (id) => `/v2/orders/${encodeURIComponent(id)}/economics-ledger`,
  });

  function today() { return new Date().toISOString().slice(0, 10); }
  function shortDate(value) { return String(value ?? '').slice(0, 10); }

  function costFields({ ledger, withReason }) {
    const orderCurrency = ledger.currency;
    const currencies = [orderCurrency, ...new Set(ledger.fxRateSnapshots.map((item) => item.sourceCurrency).filter((code) => code !== orderCurrency))];
    const commitments = ledger.supplyCommitments;
    const fields = [];
    if (withReason) fields.push(textDef('reason', t('Причина корректировки', 'Adjustment reason'), '', 1000, true, 1));
    fields.push(
      selectDef('supplyCommitmentSnapshotId', t('Обязательство поставки', 'Supply commitment'), commitments, (item) => `${shortDate(item.createdAt)} · ${item.allocations.length} ${t('поз.', 'lines')} · ${item.id}`, commitments.at(-1)?.id),
      selectDef('costType', t('Вид затраты', 'Cost type'), COST_TYPES.map((row) => ({ id: row[0], ru: row[1], en: row[2] })), (item) => t(item.ru, item.en), 'freight'),
      textDef('amount', t('Сумма (минус — кредит)', 'Amount (a minus sign is a credit)'), '', 24, true, 1),
      selectDef('currency', t('Валюта затраты', 'Cost currency'), currencies, undefined, orderCurrency),
      dependentSelectDef('fxRateSnapshotId', t('Курс', 'Exchange rate'), 'currency',
        (code) => (code === orderCurrency ? [{ id: '' }] : ledger.fxRateSnapshots.filter((item) => item.sourceCurrency === code && item.targetCurrency === orderCurrency)),
        (item) => (item.id === '' ? t('— не нужен (валюта заказа) —', '— not needed (order currency) —') : `${item.rate} · ${pair(FX_RATE_TYPES, item.rateType)} · ${shortDate(item.effectiveAt)} · ${item.id}`),
        '', t('Для этой валюты нет курса: сначала запишите курс.', 'There is no rate for this currency: record a rate first.')),
      textDef('sourceRef', t('Документ-основание (счёт, инвойс)', 'Source document (invoice)'), '', 200, true, 1),
      dateDef('occurredAt', t('Дата затраты', 'Cost date'), today()),
    );
    return fields;
  }

  function createActions({ order, position, ledger, can, refresh, openStepForm }) {
    const s = deriveState(position, ledger);
    const id = order.id;
    const costInput = (values) => ({ orderCurrency: ledger.currency, fxRateSnapshots: ledger.fxRateSnapshots, ...values });
    return Object.freeze({
      supply: async () => {
        const committed = new Map();
        for (const item of ledger.supplyCommitments) for (const a of item.allocations) committed.set(a.sku, (committed.get(a.sku) ?? 0) + a.quantity);
        const lines = ledger.lines;
        const fields = [
          ...lines.map((line) => ({ ...numberDef(`qty_${line.lineNo}`, `${line.sku} · ${t('заказано', 'ordered')} ${line.quantity} (${t('в обязательствах', 'committed')} ${committed.get(line.sku) ?? 0})`, Math.max(0, line.quantity - (committed.get(line.sku) ?? 0)), true, 0, line.quantity, 1), required: false })),
          selectDef('sourceType', t('Источник поставки', 'Supply source'), SUPPLY_SOURCES.map((row) => ({ id: row[0], ru: row[1], en: row[2] })), (item) => t(item.ru, item.en), 'production'),
          textDef('sourceRef', t('Ссылка на источник (заказ фабрике, партия, склад)', 'Source reference (factory order, lot, warehouse)'), '', 200, true, 1),
          { ...dateDef('expectedAvailabilityAt', t('Ожидаемая доступность', 'Expected availability'), ''), required: false },
        ];
        openStepForm(t('Обязательство поставки', 'Supply commitment'), fields, (values) => {
          const quantities = Object.fromEntries(lines.map((line) => [line.lineNo, values[`qty_${line.lineNo}`]]));
          return mutate(ROUTES.supply(id), buildSupplyCommitment({ lines, quantities, sourceType: values.sourceType, sourceRef: values.sourceRef, expectedAvailabilityAt: values.expectedAvailabilityAt }));
        });
      },
      fx: async () => {
        openStepForm(t('Курс валюты', 'Exchange rate'), [
          textDef('sourceCurrency', t(`Валюта затрат (курс к ${ledger.currency})`, `Cost currency (rate to ${ledger.currency})`), '', 3, true, 3),
          textDef('rate', t(`Курс: сколько ${ledger.currency} за единицу валюты затрат`, `Rate: how many ${ledger.currency} per one unit of the cost currency`), '', 20, true, 1),
          selectDef('rateType', t('Тип курса', 'Rate type'), FX_RATE_TYPES.map((row) => ({ id: row[0], ru: row[1], en: row[2] })), (item) => t(item.ru, item.en), 'invoice'),
          textDef('sourceRef', t('Основание курса (документ, источник)', 'Rate basis (document, source)'), '', 200, true, 1),
          dateDef('effectiveAt', t('Дата курса', 'Rate date'), today()),
        ], (values) => mutate(ROUTES.fx(id), buildFxRate({ orderCurrency: ledger.currency, ...values })));
      },
      cost: async () => {
        openStepForm(t('Фактическая затрата', 'Actual cost'), costFields({ ledger, withReason: false }),
          (values) => mutate(ROUTES.cost(id), buildActualCost(costInput(values))));
      },
      landed: async () => { await mutate(ROUTES.landed(id), {}); await refresh(); },
      policy: async () => {
        const nextVersion = Math.max(0, ...ledger.allocationPolicies.map((item) => item.version)) + 1;
        openStepForm(t('Политика распределения затрат', 'Cost allocation policy'), [
          textDef('name', t('Название', 'Name'), t('Распределение затрат', 'Cost allocation'), 160, true, 1),
          numberDef('version', t('Версия', 'Version'), nextVersion, true, 1, undefined, 1),
          selectDef('defaultBasis', t('База распределения', 'Allocation basis'), ALLOCATION_BASES.map((row) => ({ id: row[0], ru: row[1], en: row[2] })), (item) => t(item.ru, item.en), 'unit'),
        ], (values) => mutate(ROUTES.policy(order.brandId), buildAllocationPolicy(values)));
      },
      allocation: async () => {
        const policies = usablePolicies(ledger);
        openStepForm(t('Прогон распределения затрат', 'Cost allocation run'), [
          selectDef('policyVersionId', t('Политика распределения', 'Allocation policy'), policies, (item) => `${item.name} · v${item.version} · ${pair(ALLOCATION_BASES, item.defaultBasis).split(':')[0]}`, policies.at(-1)?.id),
        ], (values) => mutate(ROUTES.allocation(id), buildAllocationRun({ landedCost: s.landed, policy: policies.find((item) => item.id === values.policyVersionId) })));
      },
      margin: async () => { await mutate(ROUTES.margin(id), buildMarginActualization({ landedCost: s.landed, allocationRun: s.run })); await refresh(); },
      readiness: async () => {
        const statusOptions = [{ id: 'complete', ru: 'Подтверждено', en: 'Confirmed' }, { id: 'pending', ru: 'Ожидается', en: 'Pending' }, { id: 'waived', ru: 'Не требуется (с причиной)', en: 'Waived (with a reason)' }];
        const fields = [];
        for (const type of READINESS_TYPES) {
          fields.push(
            selectDef(`status_${type}`, readinessLabel(type), statusOptions, (item) => t(item.ru, item.en), defaultReadinessStatus(type, ledger)),
            { ...textDef(`waiver_${type}`, t(`${READINESS_LABELS[type][0]}: причина, если не требуется`, `${READINESS_LABELS[type][1]}: reason, if waived`), '', 1000, false), required: false },
          );
        }
        openStepForm(t('Готовность к закрытию', 'Close readiness'), fields, (values) => {
          const choices = Object.fromEntries(READINESS_TYPES.map((type) => [type, { status: values[`status_${type}`], waiverReason: values[`waiver_${type}`] }]));
          return mutate(ROUTES.readiness(id), buildReadiness({ landedCost: s.landed, margin: s.margin, ledger, choices }));
        });
      },
      close: async () => {
        const readiness = ledger.readiness;
        const body = buildCostClose({ readiness });
        const accepted = await confirmAction({
          title: t('Закрыть себестоимость заказа', 'Close the order cost'),
          question: t('Закрытие необратимо. После него затраты и снимки по этому заказу больше нельзя менять: любые изменения вносятся только корректировкой после закрытия, и маржа на момент закрытия остаётся в истории. Закрыть себестоимость?',
            'Closing cannot be undone. Afterwards the costs and snapshots of this order can no longer be changed: any change goes through a post-close adjustment only, and the margin at close stays in the history. Close the cost?'),
          confirmLabel: t('Закрыть себестоимость', 'Close cost'),
          danger: true,
        });
        if (!accepted) return;
        await mutate(ROUTES.close(id), body);
        await refresh();
      },
      adjustment: async () => {
        openStepForm(t('Корректировка после закрытия', 'Post-close adjustment'), costFields({ ledger, withReason: true }),
          (values) => mutate(ROUTES.adjustment(id), buildPostCloseAdjustment(costInput(values))));
      },
      reconcile: async () => {
        await mutate(ROUTES.reconcile(id, s.adjustment.id), buildReconciliation({ allocationRun: s.adjustmentRun }));
        await refresh();
      },
    });
  }

  // --- экран ------------------------------------------------------------------------------------------

  function statusText(status) {
    const labels = {
      OPEN: ['Открыта', 'Open'], WAITING_FOR_FREIGHT: ['Ожидает фрахт', 'Waiting for freight'], WAITING_FOR_DUTY: ['Ожидает пошлину', 'Waiting for duty'],
      WAITING_FOR_CREDITS: ['Ожидает кредитные корректировки', 'Waiting for credits'], READY_TO_CLOSE: ['Готова к закрытию', 'Ready to close'],
      STALE: ['Требует пересчёта', 'Needs recalculation'], CLOSED: ['Закрыта', 'Closed'], ADJUSTED: ['Закрыта с корректировками', 'Closed with adjustments'],
    };
    return labels[status] ? t(labels[status][0], labels[status][1]) : t('Неизвестно', 'Unknown');
  }

  function stateLabel(state) {
    return ({ done: t('Сделано', 'Done'), todo: t('Нужно сделать', 'To do'), optional: t('По необходимости', 'Optional'), locked: t('Недоступно', 'Unavailable') })[state] ?? state;
  }

  function moneyText(value, currency) {
    if (value === null || value === undefined) return '—';
    const text = global.I18N?.formatNumber ? global.I18N.formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : String(value);
    return `${text} ${currency}`;
  }

  async function load(order) {
    const [position, ledger] = await Promise.all([api(ROUTES.position(order.id)), api(ROUTES.ledger(order.id))]);
    for (const part of [position, ledger]) {
      if (!part || part.orderId !== order.id || part.orderCommitSnapshotId !== order.orderCommitSnapshotId) throw new Error(I18N.t('common.requestError'));
    }
    return { position, ledger };
  }

  function renderWorkspace(order, { position, ledger }, can, reopen) {
    const dialog = document.querySelector('#form-dialog');
    clear(dialog);
    const body = el('div', { className: 'dialog-body' });
    const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
    const head = el('div', { className: 'dialog-head' });
    head.append(el('h3', { text: t('Экономика заказа', 'Order economics') }), close);
    close.addEventListener('click', () => dialog.close());
    body.append(head);

    const summary = el('div', { className: 'form-grid' });
    const row = (label, value) => {
      const holder = el('label');
      holder.append(el('span', { rawText: label }), el('input', { type: 'text', value: value ?? '—', readOnly: true }));
      summary.append(holder);
    };
    row(t('Статус экономики', 'Economics status'), statusText(position.status));
    row(t('Фактическая себестоимость', 'Effective landed cost'), moneyText(position.effectiveTotalLandedCost, position.currency));
    row(t('Маржа', 'Contribution margin'), moneyText(position.effectiveContributionMarginAmount, position.currency));
    if (position.blockingReasons?.length && !CLOSED_STATUSES.includes(position.status)) row(t('Что блокирует закрытие', 'What blocks the close'), blockingText(position));
    body.append(summary);

    if (ledger.supplyCommitments.length || ledger.actualCosts.length) {
      body.append(notice(t('По заказу уже ведётся экономика: количества в заказе больше менять нельзя (ORDER_AMENDMENT_ECONOMICS_STARTED).', 'Economics is already running on this order: its quantities can no longer be changed (ORDER_AMENDMENT_ECONOMICS_STARTED).')));
    }
    if (!can.cost) body.append(notice(t('У вас право только на чтение: записывать затраты и закрывать себестоимость могут финансы, владелец и администратор.', 'You have read-only access: finance, owner and admin may record costs and close the cost.')));

    const handlers = createActions({ order, position, ledger, can, refresh: reopen, openStepForm: (title, fields, submit) => openStepForm(order, title, fields, submit, reopen) });
    for (const step of deriveSteps({ position, ledger, can })) {
      const card = el('article', { className: 'entity' });
      const titleBlock = el('div', { className: 'entity-title-block' });
      titleBlock.append(el('div', { className: 'entity-title', rawText: `${step.number}. ${step.title}` }));
      const headRow = el('div', { className: 'entity-head' });
      headRow.append(titleBlock, el('span', { className: `badge ${step.state}`, rawText: stateLabel(step.state) }));
      card.append(headRow);
      const meta = el('div', { className: 'meta' });
      step.summary.forEach((line) => meta.append(el('span', { rawText: line })));
      if (step.blocker) meta.append(el('span', { rawText: `${t('Блокирует', 'Blocked by')}: ${step.blocker}` }));
      if (step.needs && step.state !== 'done') meta.append(el('span', { rawText: `${t('Нужно ввести', 'To enter')}: ${step.needs}` }));
      card.append(meta);
      const actions = el('div', { className: 'row entity-actions' });
      for (const item of step.actions) {
        const button = el('button', { className: `button small ${item.enabled && step.state === 'todo' ? 'primary' : ''}`.trim(), rawText: item.label, type: 'button', title: item.reason ?? undefined });
        button.disabled = !item.enabled;
        button.addEventListener('click', () => runAction(() => handlers[item.id](), button));
        actions.append(button);
      }
      card.append(actions);
      body.append(card);
    }
    dialog.append(body);
    if (!dialog.open) dialog.showModal();
  }

  // Форма шага открывается в том же диалоге. `openForm` после сохранения сам перезагружает рабочее
  // пространство и перерисовывает приложение — а перерисовка создаёт диалог заново и уничтожила бы
  // экран шагов. Поэтому после сохранения экран ждёт, пока диалог пересоздан, и только потом
  // перечитывает позицию и записанное; при отмене формы перечитывает сразу.
  function openStepForm(order, title, fields, submit, reopen) {
    let saved = false;
    openForm(title, fields, async (values) => { await submit(values); saved = true; });
    const dialog = document.querySelector('#form-dialog');
    if (!dialog.querySelector('form')) return;
    dialog.addEventListener('close', () => { void (saved ? waitForRender(dialog).then(reopen) : reopen()); }, { once: true });
  }

  function waitForRender(original, { timeoutMs = 8000, stepMs = 50 } = {}) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        if (document.querySelector('#form-dialog') !== original || Date.now() - started >= timeoutMs) resolve();
        else setTimeout(check, stepMs);
      };
      check();
    });
  }

  async function open(order) {
    const can = capabilitiesFor(order);
    if (!can.read) throw new Error('CAPABILITY_DENIED');
    const reopen = async () => {
      try { renderWorkspace(order, await load(order), can, reopen); }
      catch (error) { toast(error.message, 'error'); }
    };
    renderWorkspace(order, await load(order), can, reopen);
  }

  global.SynthaOrderEconomics = Object.freeze({
    COST_TYPES, SUPPLY_SOURCES, FX_RATE_TYPES, ALLOCATION_BASES, ROUTES,
    buildSupplyCommitment, buildFxRate, buildActualCost, buildPostCloseAdjustment, buildAllocationPolicy,
    buildAllocationRun, buildMarginActualization, buildReadiness, buildCostClose, buildReconciliation,
    usablePolicies, evidenceFor, deriveSteps, createActions, capabilitiesFor, open,
  });
}(window));
