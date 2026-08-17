function renderRetailDoorWorkspace() {
  const caps = window.SynthaUiCapabilities;
  const readableShops = retailDoorShopsFor(caps.CAPABILITIES.RETAIL_DOOR_READ);
  const manageableShops = retailDoorShopsFor(caps.CAPABILITIES.RETAIL_DOOR_MANAGE);
  const card = sectionCard(
    localText('Торговые точки', 'Retail doors'),
    [empty(readableShops.length ? localText('Загрузка торговых точек…', 'Loading retail doors…') : localText('Нет доступных магазинов.', 'No accessible shops.'))],
    manageableShops.length ? localText('Добавить точку', 'Add retail door') : undefined,
    manageableShops.length ? () => retailDoorCreateForm(manageableShops) : undefined,
  );
  if (readableShops.length) void hydrateRetailDoorWorkspace(card, readableShops);
  return card;
}

function retailDoorShopsFor(capability) {
  const caps = window.SynthaUiCapabilities;
  const ids = new Set(caps.organisationIds(state.workspace, capability, 'shop'));
  return state.workspace.organisations.filter(organisation => organisation.type === 'shop' && ids.has(organisation.id));
}

async function hydrateRetailDoorWorkspace(card, shops) {
  const stack = card.querySelector('.stack');
  const count = card.querySelector('.section-count');
  try {
    const groups = await Promise.all(shops.map(async shop => ({
      shop,
      doors: await api(`/v2/shops/${encodeURIComponent(shop.id)}/doors`),
    })));
    const rows = groups.flatMap(({ shop, doors }) => (Array.isArray(doors) ? doors : []).map(door => ({ shop, door })));
    rows.sort((left, right) => `${left.shop.name}:${left.door.code}`.localeCompare(`${right.shop.name}:${right.door.code}`));
    clear(stack);
    if (!rows.length) stack.append(empty(localText('Торговые точки ещё не созданы.', 'No retail doors yet.')));
    else rows.forEach(({ shop, door }) => stack.append(retailDoorEntity(shop, door)));
    if (count) count.textContent = String(rows.length);
  } catch (error) {
    clear(stack);
    const failure = notice(`${localText('Не удалось загрузить торговые точки:', 'Could not load retail doors:')} ${error.message}`, 'error');
    const retry = el('button', { className: 'button small', rawText: localText('Повторить', 'Retry'), type: 'button' });
    retry.addEventListener('click', () => {
      clear(stack);
      stack.append(empty(localText('Загрузка торговых точек…', 'Loading retail doors…')));
      void hydrateRetailDoorWorkspace(card, shops);
    });
    stack.append(failure, retry);
    if (count) count.textContent = '0';
  }
}

function retailDoorEntity(shop, door) {
  const caps = window.SynthaUiCapabilities;
  const canManage = caps.hasForOrganisation(state.workspace, shop.id, caps.CAPABILITIES.RETAIL_DOOR_MANAGE);
  const actions = [];
  if (canManage && door.status === 'active') {
    const edit = el('button', { className: 'button small', rawText: localText('Редактировать', 'Edit'), type: 'button' });
    edit.addEventListener('click', () => retailDoorEditForm(door));
    actions.push(edit);
    actions.push(actionButton(
      localText('Деактивировать', 'Deactivate'),
      () => mutate(`/v2/retail-doors/${encodeURIComponent(door.id)}/deactivate`, { expectedVersion: door.version }),
      'danger',
      localText('Деактивировать торговую точку? Новые заказы больше нельзя будет привязать к ней.', 'Deactivate this retail door? New orders will no longer be assignable to it.'),
    ));
  }
  return entity(
    `${door.code} · ${door.name}`,
    door.status,
    [
      shop.name,
      retailDoorAddressLabel(door.shipToAddress, localText('Ship-to', 'Ship-to')),
      retailDoorAddressLabel(door.billToAddress, localText('Bill-to', 'Bill-to')),
      `v${door.version}`,
    ],
    actions,
  );
}

function retailDoorCreateForm(shops) {
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
    });
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
  }, 'PATCH'));
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
  const code = validation.requiredText(value, 'Retail door code', { minLength: 1, maxLength: 32 }).toUpperCase();
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

function retailDoorAddressLabel(address, label) {
  if (!address) return `${label}: —`;
  return `${label}: ${[address.countryCode, address.postalCode, address.city, address.region, address.line1, address.line2].filter(Boolean).join(', ')}`;
}
