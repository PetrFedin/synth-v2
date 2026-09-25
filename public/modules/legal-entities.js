// Юридические лица организации — реестр без потребителя: сюда бренд заводит реквизиты (ИНН/ОГРН/КПП
// или зарубежные регистрационный и налоговый номера), а к заказам и документам это ещё не привязано —
// отдельный, следующий слайс (docs/backlog-not-yet-integrated.md, раздел 3).
//
// Данные лежат не в общей пачке рабочего пространства (`state.workspace`), а подгружаются лениво,
// организация за организацией, тем же способом, каким styles.js подгружает размерный ряд ведомости:
// список организаций короткий, а состояние на экране появляется, только если у кого-то есть право
// им управлять. Экран, который это показывает, — `renderPartners()` в omnidata-workspace.js
// (вкладка «Юридические лица»); здесь только данные и форма.
const legalEntityState = window.SynthaLegalEntityState
  || (window.SynthaLegalEntityState = { data: {}, loading: {}, failed: {} });

function legalEntityManageableOrganisations() {
  const caps = window.SynthaUiCapabilities;
  const allowedIds = new Set(caps.organisationIds(state.workspace, caps.CAPABILITIES.ORGANISATION_MANAGE));
  return ownOrganisations().filter((item) => allowedIds.has(item.id));
}

function loadLegalEntities(organisationId) {
  if (legalEntityState.data[organisationId] || legalEntityState.loading[organisationId] || legalEntityState.failed[organisationId]) return;
  legalEntityState.loading[organisationId] = true;
  api(`/v2/organisations/${encodeURIComponent(organisationId)}/legal-entities`)
    .then((value) => { legalEntityState.data[organisationId] = value; })
    .catch(() => { legalEntityState.failed[organisationId] = true; })
    .finally(() => { legalEntityState.loading[organisationId] = false; if (state.view === 'partners') renderApp(); });
}

/** Flattened rows across every organisation the actor may manage, triggering the lazy loads as a side effect. */
function legalEntityRows() {
  const owned = legalEntityManageableOrganisations();
  owned.forEach((org) => loadLegalEntities(org.id));
  return owned.flatMap((org) => (legalEntityState.data[org.id] || []).map((item) => ({ ...item, orgName: org.name || org.id })));
}

function legalEntityRequisiteSummary(item) {
  const latest = item.latestVersion;
  if (!latest) return localText('Реквизиты не заведены', 'No requisites yet');
  return latest.jurisdiction === 'RU'
    ? `ИНН ${latest.requisites.inn}${latest.requisites.kpp ? ` · КПП ${latest.requisites.kpp}` : ''} · ОГРН ${latest.requisites.ogrn}`
    : `${localText('Рег. номер', 'Reg. no.')} ${latest.requisites.registrationNumber} · ${localText('Налоговый номер', 'Tax no.')} ${latest.requisites.taxNumber}`;
}

function legalEntityTransition(item, nextStatus) {
  // `actionButton`'s own success path only reloads `state.workspace`; this screen's data lives in
  // its own lazily-loaded cache (`legalEntityState`), which nothing else knows to invalidate.
  return mutate(`/v2/legal-entities/${encodeURIComponent(item.id)}/transition`, { expectedVersion: item.version, nextStatus })
    .then((result) => { delete legalEntityState.data[item.organisationId]; return result; });
}

function legalEntityActions(item) {
  const caps = window.SynthaUiCapabilities;
  const canManage = caps.hasForOrganisation(state.workspace, item.organisationId, caps.CAPABILITIES.ORGANISATION_MANAGE);
  const actions = [];
  if (canManage && item.status === 'draft') {
    actions.push(actionButton(
      localText('Активировать', 'Activate'),
      () => legalEntityTransition(item, 'active'),
      'primary',
    ));
  }
  if (canManage && item.status === 'active') {
    actions.push(actionButton(
      localText('В архив', 'Archive'),
      () => legalEntityTransition(item, 'archived'),
      'danger',
      localText('Перевести юрлицо в архив? Действующие ссылки на него не изменятся.', 'Archive this legal entity? Existing references to it are unaffected.'),
    ));
  }
  return actions;
}

function legalEntityForm() {
  const owned = legalEntityManageableOrganisations();
  const validation = window.SynthaUiValidation;
  openForm(localText('Новое юридическое лицо', 'New legal entity'), [
    selectDef('organisationId', localText('Организация', 'Organisation'), owned),
    textDef('entityCode', localText('Код юрлица (например RU-MAIN)', 'Legal Entity code (e.g. RU-MAIN)'), '', 32),
    selectDef('jurisdiction', localText('Юрисдикция', 'Jurisdiction'), [
      { id: 'RU', name: localText('Россия', 'Russia') },
      { id: 'FOREIGN', name: localText('Зарубежная', 'Foreign') },
    ], (option) => option.name, 'RU'),
    textDef('nameRu', localText('Наименование (рус.)', 'Name (Russian)'), '', 320),
    textDef('nameEn', localText('Наименование (англ.)', 'Name (English)'), '', 320),
    textDef('legalAddress', localText('Юридический адрес', 'Legal address'), '', 400),
    textDef('inn', localText('ИНН (для РФ)', 'INN (RU only)'), '', 12, false),
    textDef('ogrn', localText('ОГРН (для РФ)', 'OGRN (RU only)'), '', 15, false),
    textDef('kpp', localText('КПП (необязательно)', 'KPP (optional)'), '', 9, false),
    textDef('registrationNumber', localText('Регистрационный номер (зарубежное)', 'Registration number (foreign)'), '', 64, false),
    textDef('taxNumber', localText('Налоговый номер (зарубежное)', 'Tax number (foreign)'), '', 64, false),
  ], async (values) => {
    const organisationId = validation.requiredText(values.organisationId, localText('Организация', 'Organisation'), { minLength: 1, maxLength: 120 });
    const created = await mutate('/v2/legal-entities', { organisationId, entityCode: values.entityCode });
    const requisites = values.jurisdiction === 'RU'
      ? { inn: values.inn, ogrn: values.ogrn, kpp: values.kpp || undefined, legalAddress: values.legalAddress }
      : { registrationNumber: values.registrationNumber, taxNumber: values.taxNumber, legalAddress: values.legalAddress };
    const result = await mutate(`/v2/legal-entities/${encodeURIComponent(created.id)}/versions`, {
      expectedLatestVersionNo: 0, jurisdiction: values.jurisdiction, nameRu: values.nameRu, nameEn: values.nameEn, requisites,
    });
    delete legalEntityState.data[organisationId];
    return result;
  });
}
