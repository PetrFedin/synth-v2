(function installMaterialsWorkspace() {
  'use strict';

  const core = window.SynthaMaterialsCore;
  if (!core) throw new Error('SynthaMaterialsCore must load before materials.js');

  const materialState = window.SynthaMaterialWorkspace || (window.SynthaMaterialWorkspace = {
    items: [], nextCursor: null, loaded: false, loading: false, error: '', generation: 0,
  });

  const materialNav = OD_V5_GROUPS.flatMap((group) => group.items)
    .find((item) => item.en === 'Materials and trims' || item.en === 'Materials / Trims');
  if (materialNav) {
    materialNav.view = 'materials';
    materialNav.ru = '\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b / Trims';
    materialNav.en = 'Materials / Trims';
    materialNav.planned = false;
  }

  installOptionalFieldSupport();

  function materialText(ru, en) { return localText(ru, en); }

  function installOptionalFieldSupport() {
    if (window.SynthaOptionalFieldSupport) return;
    const originalBuildField = buildField;
    buildField = function buildOptionalField(field) {
      const built = originalBuildField(field);
      if (field.required === false) built.control.removeAttribute('required');
      if (field.step !== undefined) built.control.setAttribute('step', String(field.step));
      return built;
    };
    window.SynthaOptionalFieldSupport = true;
  }

  function resetMaterials() {
    materialState.items = [];
    materialState.nextCursor = null;
    materialState.loaded = false;
    materialState.error = '';
    materialState.generation += 1;
  }

  async function loadMaterials({ reset = false } = {}) {
    if (materialState.loading) return;
    if (reset) resetMaterials();
    materialState.loading = true;
    materialState.error = '';
    const generation = materialState.generation;
    const query = new URLSearchParams({ limit: '100' });
    if (materialState.nextCursor) query.set('cursor', materialState.nextCursor);
    try {
      const page = await api(`/v2/materials?${query.toString()}`);
      if (generation !== materialState.generation) return;
      const byCode = new Map(materialState.items.map((item) => [item.code, item]));
      for (const item of page.items || []) byCode.set(item.code, item);
      materialState.items = [...byCode.values()].sort((left, right) => String(left.code).localeCompare(String(right.code)));
      materialState.nextCursor = page.nextCursor || null;
      materialState.loaded = true;
    } catch (error) {
      if (generation === materialState.generation) materialState.error = error.message || 'MATERIAL_LOAD_FAILED';
    } finally {
      if (generation === materialState.generation) materialState.loading = false;
      if (state.view === 'materials') renderApp();
    }
  }

  function ensureMaterials() {
    if (!materialState.loaded && !materialState.loading) queueMicrotask(() => { void loadMaterials({ reset: true }); });
  }

  function optionalText(value, label, maxLength) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const normalized = String(value).trim().replace(/\s+/g, ' ');
    if (normalized.length > maxLength) throw new Error(`${label}: ${materialText('\u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0434\u043b\u0438\u043d\u043d\u043e\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435', 'value is too long')}`);
    return normalized;
  }

  function decimal(values, field, label, { min = 0, allowZero = false } = {}) {
    const value = Number(values[field]);
    if (!Number.isFinite(value) || (allowZero ? value < min : value <= min)) throw new Error(`${label}: ${materialText('\u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u043e\u0435 \u0447\u0438\u0441\u043b\u043e', 'invalid number')}`);
    if (Math.round(value * 10_000) !== value * 10_000) throw new Error(`${label}: ${materialText('\u043d\u0435 \u0431\u043e\u043b\u0435\u0435 4 \u0437\u043d\u0430\u043a\u043e\u0432 \u043f\u043e\u0441\u043b\u0435 \u0437\u0430\u043f\u044f\u0442\u043e\u0439', 'maximum 4 decimal places')}`);
    return value;
  }

  function optionalField(name, label, value = '', maxLength = 160) {
    return { ...textDef(name, label, value || '', maxLength), required: false };
  }

  function numberField(name, label, value, min, allowZero = false) {
    return { name, label, kind: 'number', value, integer: false, min: allowZero ? 0 : min, step: '0.0001' };
  }

  function typeOptions() {
    return [
      { id: 'fabric', name: materialText('\u0422\u043a\u0430\u043d\u044c', 'Fabric') },
      { id: 'trim', name: materialText('\u0424\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430', 'Trim') },
      { id: 'packaging', name: materialText('\u0423\u043f\u0430\u043a\u043e\u0432\u043a\u0430', 'Packaging') },
      { id: 'other', name: materialText('\u041f\u0440\u043e\u0447\u0435\u0435', 'Other') },
    ];
  }

  function unitOptions() {
    return [
      { id: 'm', name: materialText('\u043c\u0435\u0442\u0440', 'metre') },
      { id: 'kg', name: materialText('\u043a\u0438\u043b\u043e\u0433\u0440\u0430\u043c\u043c', 'kilogram') },
      { id: 'pc', name: materialText('\u0448\u0442\u0443\u043a\u0430', 'piece') },
      { id: 'yd', name: materialText('\u044f\u0440\u0434', 'yard') },
    ];
  }

  function materialEditableFields(item = {}) {
    return [
      textDef('name', materialText('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Name'), item.name || '', 160),
      selectDef('type', materialText('\u0422\u0438\u043f', 'Type'), typeOptions(), (option) => option.name, item.type || 'fabric'),
      selectDef('unit', materialText('\u0415\u0434\u0438\u043d\u0438\u0446\u0430 \u0443\u0447\u0435\u0442\u0430', 'Unit'), unitOptions(), (option) => option.name, item.unit || 'm'),
      optionalField('supplierName', materialText('\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier'), item.supplierName, 160),
      optionalField('supplierReference', materialText('\u0410\u0440\u0442\u0438\u043a\u0443\u043b \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430', 'Supplier reference'), item.supplierReference, 120),
      optionalField('composition', materialText('\u0421\u043e\u0441\u0442\u0430\u0432', 'Composition'), item.composition, 500),
      optionalField('color', materialText('\u0426\u0432\u0435\u0442', 'Color'), item.color, 120),
      textDef('currency', materialText('\u0412\u0430\u043b\u044e\u0442\u0430', 'Currency'), item.currency || 'EUR', 3),
      numberField('unitCost', materialText('\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434\u0438\u043d\u0438\u0446\u0443', 'Unit cost'), item.unitCost ?? 0.0001, 0),
      numberField('minimumOrderQuantity', 'MOQ', item.minimumOrderQuantity ?? 1, 0),
      numberField('availableQuantity', materialText('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e', 'Available quantity'), item.availableQuantity ?? 0, 0, true),
    ];
  }

  function payloadFrom(values, brandId) {
    return {
      ...(brandId ? { brandId } : {}),
      name: window.SynthaUiValidation.requiredText(values.name, 'Material name'),
      type: values.type,
      unit: values.unit,
      supplierName: optionalText(values.supplierName, 'Supplier name', 160),
      supplierReference: optionalText(values.supplierReference, 'Supplier reference', 120),
      composition: optionalText(values.composition, 'Composition', 500),
      color: optionalText(values.color, 'Color', 120),
      currency: String(values.currency || '').trim().toUpperCase(),
      unitCost: decimal(values, 'unitCost', 'Unit cost'),
      minimumOrderQuantity: decimal(values, 'minimumOrderQuantity', 'MOQ'),
      availableQuantity: decimal(values, 'availableQuantity', 'Available quantity', { allowZero: true }),
    };
  }

  function materialCreateForm() {
    const caps = window.SynthaUiCapabilities;
    const brands = ownOrganisations().filter((organisation) => organisation.type === 'brand'
      && caps.hasForOrganisation(state.workspace, organisation.id, caps.CAPABILITIES.CATALOG_MANAGE));
    openForm(materialText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b', 'Create material'), [
      selectDef('brandId', materialText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), brands),
      textDef('code', materialText('\u041a\u043e\u0434 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430', 'Material code'), '', 64),
      ...materialEditableFields(),
    ], async (values) => {
      const brand = brands.find((item) => item.id === values.brandId);
      if (!brand) throw new Error('MATERIAL_BRAND_NOT_AVAILABLE');
      await mutate('/v2/materials', {
        code: window.SynthaUiValidation.sku(values.code),
        ...payloadFrom(values, brand.id),
      });
      resetMaterials();
    });
  }

  async function materialEditForm(item) {
    const latest = await api(`/v2/materials/${encodeURIComponent(item.code)}`);
    if (latest.status !== 'draft') throw Object.assign(new Error('MATERIAL_NOT_DRAFT: Only a draft material can be edited'), { code: 'MATERIAL_NOT_DRAFT' });
    openForm(materialText('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b', 'Edit material'), materialEditableFields(latest), async (values) => {
      await mutate(`/v2/materials/${encodeURIComponent(latest.code)}`, {
        expectedVersion: latest.version,
        ...payloadFrom(values),
      }, 'PATCH');
      resetMaterials();
    });
  }

  function materialMutationButton(label, action, variant = '') {
    const button = el('button', { className: `button small ${variant}`.trim(), type: 'button', rawText: label });
    button.addEventListener('click', async () => {
      if (state.busy || button.disabled) return;
      state.busy = true;
      setButtonBusy(button, true, materialText('\u0412\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442\u0441\u044f\u2026', 'Working\u2026'));
      try {
        await action();
        resetMaterials();
        await loadMaterials({ reset: true });
        toast(I18N.t('common.operationComplete'), 'success');
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        state.busy = false;
        if (button.isConnected) setButtonBusy(button, false, label);
      }
    });
    return button;
  }

  function materialActions(assessment) {
    const item = assessment.material;
    const caps = window.SynthaUiCapabilities;
    if (!caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE)) return [];
    const actions = [];
    if (item.status === 'draft') {
      actions.push(materialMutationButton(materialText('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c', 'Edit'), () => materialEditForm(item)));
      actions.push(materialMutationButton(materialText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'), () => mutate(`/v2/materials/${encodeURIComponent(item.code)}/publish`, { expectedVersion: item.version }), 'primary'));
    }
    return actions;
  }

  function riskLabel(code) {
    const labels = {
      INVALID_MATERIAL_IDENTITY: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043a\u043e\u0434 \u0438\u043b\u0438 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Invalid code or name'],
      MISSING_SUPPLIER: ['\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier is missing'],
      INVALID_CURRENCY: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0432\u0430\u043b\u044e\u0442\u0430', 'Invalid currency'],
      INVALID_UNIT_COST: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0446\u0435\u043d\u0430', 'Invalid unit cost'],
      INVALID_MOQ: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 MOQ', 'Invalid MOQ'],
      INVENTORY_INCONSISTENT: ['\u0420\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u0435 \u043e\u0441\u0442\u0430\u0442\u043a\u043e\u0432', 'Inventory mismatch'],
      MISSING_COMPOSITION: ['\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d \u0441\u043e\u0441\u0442\u0430\u0432 \u0442\u043a\u0430\u043d\u0438', 'Fabric composition is missing'],
      MATERIAL_NOT_PUBLISHED: ['\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u043d\u0435 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d', 'Material is not published'],
      AVAILABLE_BELOW_MOQ: ['\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u043c\u0435\u043d\u044c\u0448\u0435 MOQ', 'Available stock is below MOQ'],
      NO_AVAILABLE_STOCK: ['\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0433\u043e \u043e\u0441\u0442\u0430\u0442\u043a\u0430', 'No available stock'],
    };
    const value = labels[code] || [code, code];
    return materialText(value[0], value[1]);
  }

  function riskBadge(assessment) {
    return el('span', { className: `badge material-risk ${assessment.highestRisk}`, rawText: assessment.risks.length ? riskLabel(assessment.risks[0].code) : materialText('\u0413\u043e\u0442\u043e\u0432', 'Ready') });
  }

  function readinessCell(assessment) {
    const wrap = el('div', { className: 'material-readiness' });
    const bar = el('progress', { className: 'material-readiness-bar' });
    bar.max = 100;
    bar.value = Math.max(0, Math.min(100, Number(assessment.readiness) || 0));
    bar.setAttribute('aria-label', materialText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'));
    wrap.append(bar, el('strong', { rawText: `${assessment.readiness}%` }));
    return wrap;
  }

  function materialInspector(assessment) {
    const item = assessment.material;
    const risks = assessment.risks.length
      ? odMiniTable([materialText('\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u0430', 'Issue'), materialText('\u041a\u0440\u0438\u0442\u0438\u0447\u043d\u043e\u0441\u0442\u044c', 'Severity')], assessment.risks.map((risk) => [riskLabel(risk.code), riskBadge({ highestRisk: risk.severity, risks: [risk] })]))
      : notice(materialText('\u0411\u043b\u043e\u043a\u0438\u0440\u0443\u044e\u0449\u0438\u0445 \u043f\u0440\u043e\u0431\u043b\u0435\u043c \u043d\u0435\u0442', 'No blocking issues'), 'success');
    return odInspector({
      title: item.name,
      subtitle: item.code,
      status: item.status,
      tabs: [materialText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), materialText('\u041e\u0441\u0442\u0430\u0442\u043a\u0438', 'Inventory'), materialText('\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e \u0434\u0430\u043d\u043d\u044b\u0445', 'Data quality')],
      fields: [
        { label: materialText('\u0422\u0438\u043f', 'Type'), value: item.type },
        { label: materialText('\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier'), value: item.supplierName || '-' },
        { label: materialText('\u0421\u043e\u0441\u0442\u0430\u0432', 'Composition'), value: item.composition || '-' },
        { label: materialText('\u0426\u0435\u043d\u0430', 'Unit cost'), value: `${money(item.unitCost)} ${item.currency}/${item.unit}` },
        { label: 'MOQ', value: `${item.minimumOrderQuantity} ${item.unit}` },
        { label: materialText('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e', 'Available'), value: `${assessment.availableToUse} ${item.unit}` },
        { label: materialText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), value: `${assessment.readiness}%` },
        { label: materialText('\u0412\u0435\u0440\u0441\u0438\u044f', 'Version'), value: item.version || 1 },
      ],
      content: [risks],
      actions: materialActions(assessment),
    });
  }

  function materialLoadMore() {
    const row = el('div', { className: 'material-load-more' });
    const button = el('button', { className: 'button small', type: 'button', rawText: materialState.loading ? materialText('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026') : materialText('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0435\u0449\u0451', 'Load more') });
    button.disabled = materialState.loading;
    button.addEventListener('click', () => { void loadMaterials(); });
    row.append(button);
    return row;
  }

  function renderMaterials() {
    ensureMaterials();
    const caps = window.SynthaUiCapabilities;
    const canCreate = caps.hasAny(state.workspace, caps.CAPABILITIES.CATALOG_MANAGE, 'brand');
    const registry = core.buildRegistry(materialState.items);
    const header = odHeader('materials', [
      { id: 'registry', label: materialText('\u0420\u0435\u0435\u0441\u0442\u0440', 'Registry') },
      { id: 'exceptions', label: materialText('\u0418\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f', 'Exceptions') },
      { id: 'inventory', label: materialText('\u041e\u0441\u0442\u0430\u0442\u043a\u0438', 'Inventory') },
    ], [
      { label: materialText('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b', 'Materials'), value: registry.summary.total, detail: materialText('\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u043e', 'loaded') },
      { label: materialText('\u0413\u043e\u0442\u043e\u0432\u044b \u043a \u0437\u0430\u043a\u0443\u043f\u043a\u0435', 'Sourcing ready'), value: registry.summary.sourcingReady, detail: `${registry.summary.averageReadiness}%` },
      { label: materialText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: registry.summary.draft, detail: materialText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438', 'need publication') },
      { label: materialText('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435', 'Critical'), value: registry.summary.critical, detail: materialText('\u0431\u043b\u043e\u043a\u0435\u0440\u044b', 'blockers') },
      { label: materialText('\u041d\u0438\u0437\u043a\u0438\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', 'Low stock'), value: registry.summary.lowStock, detail: 'ATS / MOQ' },
    ], ['draft', 'published'], materialText('\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043a\u043e\u0434\u0443, \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e \u0438\u043b\u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0443', 'Search code, name or supplier'), canCreate ? odAction(materialText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b', 'Create material'), materialCreateForm) : null);

    if (materialState.error && !materialState.items.length) {
      const retry = el('button', { className: 'button primary', type: 'button', rawText: materialText('\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c', 'Retry') });
      retry.addEventListener('click', () => { void loadMaterials({ reset: true }); });
      const body = el('div', { className: 'material-state' });
      body.append(notice(materialState.error, 'error'), retry);
      return odPage(materialText('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0438 \u0444\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430', 'Materials and trims'), header, body);
    }
    if (!materialState.loaded && materialState.loading) {
      return odPage(materialText('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0438 \u0444\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430', 'Materials and trims'), header, notice(materialText('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0440\u0435\u0435\u0441\u0442\u0440\u0430\u2026', 'Loading material registry\u2026')));
    }

    let rows = registry.items;
    if (header.active === 'exceptions') rows = rows.filter((item) => item.risks.length > 0);
    if (header.active === 'inventory') rows = [...rows].sort((left, right) => left.availableToUse - right.availableToUse || String(left.material.code).localeCompare(String(right.material.code)));
    const content = el('div', { className: 'material-workspace' });
    content.append(odRegistry({
      scope: 'od-materials',
      filterScope: 'materials',
      rows,
      rowKey: (assessment) => assessment.material.code,
      statusAccessor: (assessment) => assessment.material.status,
      columns: [
        { label: materialText('\u041a\u043e\u0434', 'Code'), value: (assessment) => assessment.material.code },
        { label: materialText('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b', 'Material'), value: (assessment) => assessment.material.name },
        { label: materialText('\u0422\u0438\u043f', 'Type'), value: (assessment) => assessment.material.type },
        { label: materialText('\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier'), value: (assessment) => assessment.material.supplierName || '-' },
        { label: materialText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: (assessment) => statusBadge(assessment.material.status) },
        { label: materialText('\u0426\u0435\u043d\u0430', 'Unit cost'), value: (assessment) => `${money(assessment.material.unitCost)} ${assessment.material.currency}` },
        { label: 'MOQ', value: (assessment) => `${assessment.material.minimumOrderQuantity} ${assessment.material.unit}` },
        { label: 'ATS', value: (assessment) => `${assessment.availableToUse} ${assessment.material.unit}` },
        { label: materialText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), render: readinessCell },
        { label: materialText('\u0420\u0438\u0441\u043a', 'Risk'), render: riskBadge },
      ],
      inspector: materialInspector,
    }));
    if (materialState.nextCursor) content.append(materialLoadMore());
    if (materialState.error) content.append(notice(materialState.error, 'error'));
    return odPage(materialText('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0438 \u0444\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430', 'Materials and trims'), header, content);
  }

  const previousRenderView = renderView;
  renderView = function renderIndustrialView() {
    return state.view === 'materials' ? renderMaterials() : previousRenderView();
  };
  const previousViewTitle = viewTitle;
  viewTitle = function materialViewTitle(view) {
    return view === 'materials' ? materialText('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b / Trims', 'Materials / Trims') : previousViewTitle(view);
  };
  const previousViewSectionName = viewSectionName;
  viewSectionName = function materialViewSection(view) {
    return view === 'materials' ? 'PLM / Sourcing' : previousViewSectionName(view);
  };
})();