// Точки розницы магазина — код, название, адрес отгрузки и адрес для документов. Бэкенд
// (src/http/retail-door-routes.mjs, src/application/retail-door-service.mjs) существовал и
// раньше и полностью рабочий; недоставало экрана, который заводит и редактирует дверь. До этой
// правки единственной активной точкой входа было `SynthaRetailDoorUi.activeDoorsForSelection`
// в `retail-door-ui-core.js` — она лишь выбирает уже существующую дверь при оформлении заказа,
// поэтому завести точку розницы через интерфейс было нечем (docs/backlog-not-yet-integrated.md,
// раздел 5: «распределение по магазинам и дверям (`retail_doors` есть, распределения нет)» —
// сама дверь теперь заводится здесь, распределение заказа по ней остаётся отдельным слоем).
// Прежняя версия этого файла собирала собственную карточку (`renderRetailDoorWorkspace`) и
// вызывалась только из мёртвого `partners.js`, затенённого одноимённым `renderPartners()` в
// `omnidata-workspace.js` — экран, который её звал, никогда не выполнялся.
//
// Экран — `renderPartners()` в omnidata-workspace.js (вкладка «Точки розницы»). Данные не входят
// в общую пачку `state.workspace` — подгружаются лениво по магазинам, которыми актёр вправе
// видеть/вести двери, тем же способом, каким это делают `legal-entities.js` и
// `compliance-documents.js`.
const retailDoorState = window.SynthaRetailDoorState
  || (window.SynthaRetailDoorState = { data: {}, loading: {}, failed: {}, error: {} });

function retailDoorShopsFor(capability) {
  const caps = window.SynthaUiCapabilities;
  const ids = new Set(caps.organisationIds(state.workspace, capability, 'shop'));
  return state.workspace.organisations.filter(organisation => organisation.type === 'shop' && ids.has(organisation.id));
}

function retailDoorReadableShops() {
  const caps = window.SynthaUiCapabilities;
  return retailDoorShopsFor(caps.CAPABILITIES.RETAIL_DOOR_READ);
}

function retailDoorManageableShops() {
  const caps = window.SynthaUiCapabilities;
  return retailDoorShopsFor(caps.CAPABILITIES.RETAIL_DOOR_MANAGE);
}

function loadRetailDoors(shopId) {
  if (retailDoorState.data[shopId] || retailDoorState.loading[shopId] || retailDoorState.failed[shopId]) return;
  retailDoorState.loading[shopId] = true;
  api(`/v2/shops/${encodeURIComponent(shopId)}/doors`)
    .then((value) => { retailDoorState.data[shopId] = value; })
    .catch((error) => { retailDoorState.failed[shopId] = true; retailDoorState.error[shopId] = error; })
    .finally(() => { retailDoorState.loading[shopId] = false; if (state.view === 'partners') renderApp(); });
}

/** Flattened rows across every shop the actor may see, triggering the lazy loads as a side effect. */
function retailDoorRows() {
  const shops = retailDoorReadableShops();
  shops.forEach((shop) => loadRetailDoors(shop.id));
  return shops.flatMap((shop) => (retailDoorState.data[shop.id] || []).map((door) => ({ ...door, shopName: shop.name || shop.id })));
}

function retailDoorInvalidate(shopId) {
  // `actionButton` and `openForm`'s own success paths only reload `state.workspace`; this
  // screen's data lives in its own lazily-loaded cache, which nothing else knows to invalidate.
  delete retailDoorState.data[shopId];
}

// Отказ по правам виден как состояние раздела, а не как сбой загрузки: см. ARCHITECTURE.md,
// `fix/forbidden-reads-as-a-refusal` — «не удалось загрузить» неправда, если роль просто не даёт
// видеть точки этого магазина, и повторять тут нечего. Показывается первый отказавший магазин
// среди читаемых по капабилити; остальные тем временем продолжают подгружаться независимо.
function retailDoorErrorNotice() {
  const failedShop = retailDoorReadableShops().find(shop => retailDoorState.failed[shop.id]);
  if (!failedShop) return null;
  const error = retailDoorState.error[failedShop.id];
  const denied = isForbiddenText(error.message);
  const group = el('div', { className: 'stack' });
  group.append(notice(
    denied
      ? error.message
      : `${localText('Не удалось загрузить точки магазина', 'Could not load doors for the shop')} «${failedShop.name}»: ${error.message}`,
    'error',
  ));
  if (!denied) {
    const retry = el('button', { className: 'button small', rawText: localText('Повторить', 'Retry'), type: 'button' });
    retry.addEventListener('click', () => {
      delete retailDoorState.failed[failedShop.id];
      delete retailDoorState.error[failedShop.id];
      loadRetailDoors(failedShop.id);
      renderApp();
    });
    group.append(retry);
  }
  return group;
}

function retailDoorActions(door) {
  const caps = window.SynthaUiCapabilities;
  const canManage = caps.hasForOrganisation(state.workspace, door.shopId, caps.CAPABILITIES.RETAIL_DOOR_MANAGE);
  const actions = [];
  if (!canManage) return actions;
  if (door.status === 'active') {
    actions.push(actionButton(localText('Редактировать', 'Edit'), () => retailDoorEditForm(door)));
    actions.push(actionButton(
      localText('Деактивировать', 'Deactivate'),
      () => mutate(`/v2/retail-doors/${encodeURIComponent(door.id)}/deactivate`, { expectedVersion: door.version })
        .then((result) => { retailDoorInvalidate(door.shopId); return result; }),
      'danger',
      localText('Деактивировать торговую точку? Новые заказы больше нельзя будет привязать к ней.', 'Deactivate this retail door? New orders will no longer be assignable to it.'),
    ));
  } else if (door.status === 'inactive') {
    actions.push(actionButton(
      localText('Активировать', 'Reactivate'),
      () => mutate(`/v2/retail-doors/${encodeURIComponent(door.id)}/reactivate`, { expectedVersion: door.version })
        .then((result) => { retailDoorInvalidate(door.shopId); return result; }),
      undefined,
      localText('Активировать торговую точку? После этого её снова можно будет выбирать для новых заказов.', 'Reactivate this retail door? It will become available for new orders again.'),
    ));
  }
  return actions;
}

function retailDoorForm() {
  const shops = retailDoorManageableShops();
  openForm(localText('Новая торговая точка', 'New retail door'), [
    selectDef('shopId', localText('Магазин', 'Shop'), shops),
    textDef('code', localText('Код точки', 'Door code'), '', 32),
    textDef('name', localText('Название точки', 'Door name'), '', 160),
    ...retailDoorAddressFields('shipTo', localText('Ship-to', 'Ship-to')),
    ...retailDoorAddressFields('billTo', localText('Bill-to', 'Bill-to')),
  ], values => {
    const shop = shops.find(item => item.id === values.shopId);
    if (!shop) throw new Error('RETAIL_DOOR_SHOP_INVALID');
    return mutate(`/v2/shops/${encodeURIComponent(shop.id)}/doors`, {
      shopId: shop.id,
      code: retailDoorCode(values.code),
      name: retailDoorName(values.name),
      shipToAddress: retailDoorAddress(values, 'shipTo'),
      billToAddress: retailDoorAddress(values, 'billTo'),
    }).then((result) => { retailDoorInvalidate(shop.id); return result; });
  });
}

function retailDoorEditForm(door) {
  openForm(`${localText('Торговая точка', 'Retail door')} ${door.code}`, [
    textDef('name', localText('Название точки', 'Door name'), door.name, 160),
    ...retailDoorAddressFields('shipTo', localText('Ship-to', 'Ship-to'), door.shipToAddress),
    ...retailDoorAddressFields('billTo', localText('Bill-to', 'Bill-to'), door.billToAddress),
  ], values => mutate(`/v2/retail-doors/${encodeURIComponent(door.id)}`, {
    expectedVersion: door.version,
    name: retailDoorName(values.name),
    shipToAddress: retailDoorAddress(values, 'shipTo'),
    billToAddress: retailDoorAddress(values, 'billTo'),
  }, 'PATCH').then((result) => { retailDoorInvalidate(door.shopId); return result; }));
}

function retailDoorAddressFields(prefix, title, address = {}) {
  return [
    textDef(`${prefix}CountryCode`, `${title} · ${localText('страна, ISO-2', 'country, ISO-2')}`, address.countryCode || '', 2),
    optionalTextDef(`${prefix}PostalCode`, `${title} · ${localText('индекс', 'postal code')}`, address.postalCode || '', 32),
    textDef(`${prefix}City`, `${title} · ${localText('город', 'city')}`, address.city || '', 160),
    optionalTextDef(`${prefix}Region`, `${title} · ${localText('регион', 'region')}`, address.region || '', 160),
    textDef(`${prefix}Line1`, `${title} · ${localText('адрес', 'address line 1')}`, address.line1 || '', 200),
    optionalTextDef(`${prefix}Line2`, `${title} · ${localText('адрес 2', 'address line 2')}`, address.line2 || '', 200),
  ];
}

function retailDoorAddress(values, prefix) {
  const validation = window.SynthaUiValidation;
  const countryCode = validation.requiredText(values[`${prefix}CountryCode`], `${prefix} country`, { minLength: 2, maxLength: 2 }).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('RETAIL_DOOR_COUNTRY_CODE_INVALID');
  return {
    countryCode,
    postalCode: retailDoorOptional(values[`${prefix}PostalCode`]),
    city: validation.requiredText(values[`${prefix}City`], `${prefix} city`, { minLength: 1, maxLength: 160 }),
    region: retailDoorOptional(values[`${prefix}Region`]),
    line1: validation.requiredText(values[`${prefix}Line1`], `${prefix} address`, { minLength: 1, maxLength: 200 }),
    line2: retailDoorOptional(values[`${prefix}Line2`]),
  };
}

function retailDoorCode(value) {
  const validation = window.SynthaUiValidation;
  const code = validation.requiredText(value, localText('Код точки', 'Door code'), { minLength: 1, maxLength: 32 }).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,31}$/.test(code)) throw new Error('RETAIL_DOOR_CODE_INVALID');
  return code;
}

function retailDoorName(value) {
  return window.SynthaUiValidation.requiredText(value, 'Retail door name', { minLength: 1, maxLength: 160 });
}

function retailDoorOptional(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function retailDoorAddressText(address) {
  if (!address) return '—';
  return [address.countryCode, address.postalCode, address.city, address.region, address.line1, address.line2].filter(Boolean).join(', ') || '—';
}
