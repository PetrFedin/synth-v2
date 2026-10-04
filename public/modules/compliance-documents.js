// Реестр документов соответствия (УПД, декларация/сертификат ЕАЭС) — как юрлица, реестр без
// привязки к заказу или отгрузке (docs/backlog-not-yet-integrated.md, раздел 3/4): документ
// выставляется на юрлицо и, необязательно, на юрлицо контрагента, и живёт своим жизненным циклом
// «черновик → выставлен → заменён». Загружается лениво по организации, тем же приёмом, что и
// юрлица (`legal-entities.js`) — список организаций короткий, а данные нужны, только если есть
// право их видеть. Экран — `renderPartners()` в omnidata-workspace.js, вкладка «Документы».
const complianceDocumentState = window.SynthaComplianceDocumentState
  || (window.SynthaComplianceDocumentState = { data: {}, loading: {}, failed: {} });

const COMPLIANCE_DOCUMENT_TYPE_NAMES = {
  upd: () => localText('УПД', 'UPD (transfer document)'),
  eaeu_declaration_of_conformity: () => localText('Декларация соответствия ЕАЭС', 'EAEU declaration of conformity'),
  eaeu_certificate_of_conformity: () => localText('Сертификат соответствия ЕАЭС', 'EAEU certificate of conformity'),
};

const COMPLIANCE_DOCUMENT_EDO_NEXT = {
  null: [['sent', () => localText('Отправить в ЭДО', 'Send via ЭДО')]],
  sent: [
    ['delivered', () => localText('Отметить доставленным', 'Mark delivered')],
    ['rejected', () => localText('Отклонён оператором', 'Rejected by operator')],
  ],
  delivered: [
    ['signed', () => localText('Отметить подписанным', 'Mark signed')],
    ['rejected', () => localText('Отклонён контрагентом', 'Rejected by counterparty')],
  ],
  rejected: [['sent', () => localText('Отправить повторно', 'Resend')]],
  signed: [],
};

function complianceDocumentManageableOrganisations() {
  const caps = window.SynthaUiCapabilities;
  const allowedIds = new Set(caps.organisationIds(state.workspace, caps.CAPABILITIES.COMPLIANCE_DOCUMENT_READ));
  return ownOrganisations().filter((item) => allowedIds.has(item.id));
}

function loadComplianceDocuments(organisationId) {
  if (complianceDocumentState.data[organisationId] || complianceDocumentState.loading[organisationId] || complianceDocumentState.failed[organisationId]) return;
  complianceDocumentState.loading[organisationId] = true;
  api(`/v2/organisations/${encodeURIComponent(organisationId)}/compliance-documents`)
    .then((value) => { complianceDocumentState.data[organisationId] = value; })
    .catch(() => { complianceDocumentState.failed[organisationId] = true; })
    .finally(() => { complianceDocumentState.loading[organisationId] = false; if (state.view === 'partners') renderApp(); });
}

/** Flattened rows across every organisation the actor may see, triggering the lazy loads as a side effect. */
function complianceDocumentRows() {
  const owned = complianceDocumentManageableOrganisations();
  // Реквизиты юрлиц читает только тот, кто управляет организацией; остальным запрос — гарантированный
  // отказ, и названий они всё равно не получат, поэтому не спрашивают.
  const caps = window.SynthaUiCapabilities;
  owned.forEach((org) => {
    loadComplianceDocuments(org.id);
    if (caps.hasForOrganisation(state.workspace, org.id, caps.CAPABILITIES.ORGANISATION_MANAGE)) loadLegalEntities(org.id);
  });
  return owned.flatMap((org) => (complianceDocumentState.data[org.id] || []).map((item) => ({ ...item, orgName: org.name || org.id })));
}

function complianceDocumentTypeName(documentType) {
  return (COMPLIANCE_DOCUMENT_TYPE_NAMES[documentType] || (() => documentType))();
}

function legalEntityLabel(organisationId, legalEntityId) {
  const entity = (legalEntityState.data[organisationId] || []).find((item) => item.id === legalEntityId);
  if (entity) return `${entity.entityCode} (${entity.latestVersion?.nameRu || '—'})`;
  // Названия нет, когда у читателя нет права читать реквизиты. Сырой идентификатор
  // (`legal-entity_<uuid>`) в колонке эмитента ничего не говорит: «Юрлицо» и короткий код, по
  // которому его можно найти.
  const id = String(legalEntityId ?? '');
  if (!id) return '—';
  const shortCode = id.replace(/^[a-z-]+_/i, '').replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${localText('Юрлицо', 'Legal entity')} ${shortCode}`;
}

function complianceDocumentInvalidate(item) {
  delete complianceDocumentState.data[item.organisationId];
}

function complianceDocumentIssue(item) {
  return mutate(`/v2/compliance-documents/${encodeURIComponent(item.id)}/issue`, { expectedVersion: item.version })
    .then((result) => { complianceDocumentInvalidate(item); return result; });
}

function complianceDocumentRecordEdoStatus(item, edoStatus) {
  return mutate(`/v2/compliance-documents/${encodeURIComponent(item.id)}/edo-status`, { expectedVersion: item.version, edoStatus })
    .then((result) => { complianceDocumentInvalidate(item); return result; });
}

function complianceDocumentSupersedeForm(item) {
  openForm(localText('Заменить документ', 'Supersede document'), [
    textDef('replacementDocumentNumber', localText('Номер нового документа', 'New document number'), '', 80),
  ], async (values) => {
    const result = await mutate(`/v2/compliance-documents/${encodeURIComponent(item.id)}/supersede`, {
      expectedVersion: item.version, replacementDocumentNumber: values.replacementDocumentNumber,
    });
    complianceDocumentInvalidate(item);
    return result;
  });
}

function complianceDocumentActions(item) {
  const caps = window.SynthaUiCapabilities;
  const canManage = caps.hasForOrganisation(state.workspace, item.organisationId, caps.CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE);
  if (!canManage) return [];
  const actions = [];
  if (item.status === 'draft') {
    actions.push(actionButton(localText('Выставить', 'Issue'), () => complianceDocumentIssue(item), 'primary'));
  }
  if (item.status === 'issued') {
    if (item.documentType === 'upd') {
      for (const [next, label] of (COMPLIANCE_DOCUMENT_EDO_NEXT[item.edoStatus ?? 'null'] || [])) {
        actions.push(actionButton(label(), () => complianceDocumentRecordEdoStatus(item, next)));
      }
    }
    actions.push(actionButton(
      localText('Заменить', 'Supersede'),
      () => complianceDocumentSupersedeForm(item),
      'danger',
      localText('Выставленный документ заменяется новым черновиком, а не правится на месте.', 'An issued document is replaced by a new draft, never edited in place.'),
    ));
  }
  return actions;
}

function complianceDocumentForm() {
  const owned = complianceDocumentManageableOrganisations();
  const validation = window.SynthaUiValidation;
  owned.forEach((org) => loadLegalEntities(org.id));
  const entityOptions = owned.flatMap((org) => (legalEntityState.data[org.id] || [])
    .filter((item) => item.status === 'active')
    .map((item) => ({ id: item.id, name: `${item.entityCode} (${org.name || org.id})` })));
  openForm(localText('Новый документ соответствия', 'New compliance document'), [
    selectDef('organisationId', localText('Организация', 'Organisation'), owned),
    selectDef('documentType', localText('Тип документа', 'Document type'), [
      { id: 'upd', name: localText('УПД', 'UPD') },
      { id: 'eaeu_declaration_of_conformity', name: localText('Декларация соответствия ЕАЭС', 'EAEU declaration') },
      { id: 'eaeu_certificate_of_conformity', name: localText('Сертификат соответствия ЕАЭС', 'EAEU certificate') },
    ], (option) => option.name, 'upd'),
    textDef('documentNumber', localText('Номер документа', 'Document number'), '', 80),
    selectDef('issuerLegalEntityId', localText('Юрлицо-эмитент', 'Issuer Legal Entity'), entityOptions, (option) => option.name),
    optionalSelectDef('counterpartyLegalEntityId', localText('Юрлицо-контрагент (необязательно)', 'Counterparty Legal Entity (optional)'), [{ id: '', name: localText('— не указано —', '— none —') }, ...entityOptions], (option) => option.name),
    textDef('validFrom', localText('Действует с (только для ЕАЭС, ГГГГ-ММ-ДД)', 'Valid from (EAEU only, YYYY-MM-DD)'), '', 10, false),
    textDef('validTo', localText('Действует по (только для ЕАЭС, ГГГГ-ММ-ДД)', 'Valid to (EAEU only, YYYY-MM-DD)'), '', 10, false),
    // Нет отдельного экрана отгрузок, где документ можно было бы выбрать из списка — тот же разрыв,
    // что и у самой отгрузки (`order-fulfillment-view.js` только читает). Идентификатор вставляется
    // вручную; сервер отклонит чужой или несуществующий, а не примет молча.
    textDef('linkedShipmentNoticeSnapshotId', localText('ID отгрузки (необязательно)', 'Shipment notice id (optional)'), '', 200, false),
    // У заказа свой экран со списком («Оптовые заказы»), но не отсюда — тем же приёмом, что и
    // отгрузка выше, а не отдельным зависимым выбором.
    textDef('linkedOrderId', localText('ID заказа (необязательно)', 'Order id (optional)'), '', 200, false),
  ], async (values) => {
    const organisationId = validation.requiredText(values.organisationId, localText('Организация', 'Organisation'), { minLength: 1, maxLength: 120 });
    const result = await mutate('/v2/compliance-documents', {
      organisationId,
      documentNumber: values.documentNumber,
      documentType: values.documentType,
      issuerLegalEntityId: values.issuerLegalEntityId,
      counterpartyLegalEntityId: values.counterpartyLegalEntityId || null,
      validFrom: values.documentType === 'upd' ? null : (values.validFrom || null),
      validTo: values.documentType === 'upd' ? null : (values.validTo || null),
      linkedShipmentNoticeSnapshotId: values.linkedShipmentNoticeSnapshotId?.trim() || null,
      linkedOrderId: values.linkedOrderId?.trim() || null,
    });
    delete complianceDocumentState.data[organisationId];
    return result;
  });
}
