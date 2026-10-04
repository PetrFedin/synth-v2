(function installCanonicalMeasurementForm(global) {
  'use strict';

  // Каноническая таблица мер — та, которую готовность модели считает за «измерения сошлись»: одна
  // опубликованная таблица на пару «цветомодель × версия размерной шкалы», с единицей и точками
  // измерения из справочника (`measurement.unit`, `measurement.point`) и значением на каждый
  // размер шкалы. Маршруты (`POST/PATCH /v2/measurements/canonical`, `…/{id}/publish`) и домен были,
  // формы — нет: экран «Таблицы мерок» заводил только старую таблицу по каталожному SKU, которую
  // готовность не засчитывает, и из интерфейса «готово» было недостижимо.
  //
  // Правило этого файла то же, что у product-chain-forms.js: тело запроса собирают чистые функции
  // (`build.*`) строго по границам домена и контракта маршрута, а диалог только собирает значения и
  // зовёт `persist`. Тест гоняет те же функции через настоящие маршруты и службу — расхождение формы
  // и сервера ловится там, а не на экране.

  const MAX_SIZES = 50;
  const MAX_POINTS = 300;
  const DECIMAL_PATTERN = /^\d+(?:[.,]\d{1,4})?$/;
  const LIBRARIES = Object.freeze({ unit: 'measurement.unit', point: 'measurement.point' });

  function t(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }

  function fail(code, ru, en, details) {
    const error = new Error(t(ru, en));
    error.code = code;
    if (details) error.details = details;
    throw error;
  }

  // --- чистые сборщики полезной нагрузки -----------------------------------------------------------

  // Домен принимает число до четырёх знаков после запятой; русский ввод с запятой — обычное дело.
  function parseDecimal(raw, { allowZero, code, label, labelEn }) {
    const text = String(raw ?? '').trim();
    if (!DECIMAL_PATTERN.test(text)) {
      fail(code, `${label}: число не больше чем с четырьмя знаками после запятой.`, `${labelEn}: a number with at most four decimal places.`);
    }
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
      fail(code, `${label}: ${allowZero ? 'не меньше нуля' : 'больше нуля'}.`, `${labelEn}: ${allowZero ? 'not below zero' : 'above zero'}.`);
    }
    return value;
  }

  function buildValue(raw) {
    return parseDecimal(raw, { allowZero: false, code: 'MEASUREMENT_VALUE_INVALID', label: 'Значение', labelEn: 'Value' });
  }
  function buildTolerance(raw, side) {
    return side === 'minus'
      ? parseDecimal(raw, { allowZero: true, code: 'MEASUREMENT_TOLERANCE_MINUS_INVALID', label: 'Допуск «−»', labelEn: 'Tolerance "-"' })
      : parseDecimal(raw, { allowZero: true, code: 'MEASUREMENT_TOLERANCE_PLUS_INVALID', label: 'Допуск «+»', labelEn: 'Tolerance "+"' });
  }

  // Общая часть создания и правки. `draft.sizes` — упорядоченные размеры шкалы (`{ id }`), порядок
  // которых домен требует и в значениях. `complete` — публикация: таблица должна быть заполнена целиком.
  function buildEditable(draft, { complete = false } = {}) {
    if (!draft?.unitEntryId) fail('MEASUREMENT_UNIT_MDM_REQUIRED', 'Выберите единицу измерения.', 'Choose a measurement unit.');
    const sizes = Array.isArray(draft.sizes) ? draft.sizes : [];
    if (!sizes.length || sizes.length > MAX_SIZES) {
      fail('MEASUREMENT_SIZES_INVALID', `В таблице от 1 до ${MAX_SIZES} размеров шкалы.`, `A chart holds 1 to ${MAX_SIZES} sizes of the scale.`);
    }
    if (!sizes.some((size) => size.id === draft.baseSizeValueId)) {
      fail('MEASUREMENT_BASE_SIZE_INVALID', 'Базовый размер должен входить в шкалу таблицы.', 'The base size must be part of the chart scale.');
    }
    const rows = Array.isArray(draft.points) ? draft.points : [];
    if (rows.length > MAX_POINTS) fail('MEASUREMENT_POINTS_INVALID', `В таблице не больше ${MAX_POINTS} точек.`, `A chart holds at most ${MAX_POINTS} points.`);
    if (complete && !rows.length) fail('MEASUREMENT_POINTS_REQUIRED', 'Добавьте хотя бы одну точку измерения.', 'Add at least one point of measure.');
    const seen = new Set();
    const points = rows.map((row) => {
      if (!row.pointEntryId) fail('MEASUREMENT_POINT_MDM_REQUIRED', 'Выберите точку измерения в каждой строке.', 'Choose a point of measure in every row.');
      if (seen.has(row.pointEntryId)) fail('MEASUREMENT_POINT_MDM_DUPLICATE', 'Точка измерения повторяется — каждая нужна один раз.', 'A point of measure repeats — each is needed once.');
      seen.add(row.pointEntryId);
      const measurements = [];
      for (const size of sizes) {
        const raw = row.cells?.[size.id];
        if (raw === undefined || raw === null || String(raw).trim() === '') {
          if (complete) fail('MEASUREMENT_MATRIX_INCOMPLETE', 'Для публикации нужно значение на каждую точку и каждый размер.', 'Publishing needs a value for every point and every size.', { pointEntryId: row.pointEntryId });
          continue;
        }
        measurements.push({ sizeValueId: size.id, value: buildValue(raw) });
      }
      const description = String(row.description ?? '').trim();
      if (description.length > 500) fail('MEASUREMENT_POINT_DESCRIPTION_INVALID', 'Описание точки — не больше 500 символов.', 'A point description is at most 500 characters.');
      const point = {
        pointEntryId: row.pointEntryId,
        description: description || null,
        toleranceMinus: buildTolerance(row.toleranceMinus ?? '0', 'minus'),
        tolerancePlus: buildTolerance(row.tolerancePlus ?? '0', 'plus'),
        measurements,
        qcChecked: row.qcChecked === true,
      };
      // Правило градации при правке переносится как есть: без него PATCH молча теряет его, и
      // выведенные значения становятся набранными вручную.
      if (Array.isArray(row.gradeSteps)) point.gradeSteps = [...row.gradeSteps];
      return point;
    });
    const notes = String(draft.notes ?? '').trim();
    if (notes.length > 2000) fail('MEASUREMENT_NOTES_INVALID', 'Примечание — не больше 2000 символов.', 'Notes are at most 2000 characters.');
    return {
      measurementUnitEntryId: draft.unitEntryId,
      baseSizeValueId: draft.baseSizeValueId,
      sizes: sizes.map((size) => ({ sizeValueId: size.id })),
      points,
      notes: notes || null,
      // Сервер требует изображение схемы в каждой записи; правка не должна его стирать.
      schemaImageUri: draft.schemaImageUri ?? null,
    };
  }

  function buildCreate(draft, options) {
    for (const [field, ru, en] of [
      ['styleVersionId', 'У модели нет версии.', 'The style has no version.'],
      ['colorwayId', 'Выберите цветомодель.', 'Choose a colourway.'],
      ['sizeScaleVersionId', 'Выберите версию размерной шкалы.', 'Choose a size scale version.'],
    ]) if (!draft?.[field]) fail('MEASUREMENT_CANONICAL_LINEAGE_INVALID', ru, en);
    return { styleVersionId: draft.styleVersionId, colorwayId: draft.colorwayId, sizeScaleVersionId: draft.sizeScaleVersionId, ...buildEditable(draft, options) };
  }

  // Правка идёт с версией, которую форма прочитала: сервер сверяет её и отказывает, если таблицу
  // за это время изменил кто-то другой. Происхождение (модель, цветомодель, шкала) в правке не
  // меняется и не отправляется.
  function buildUpdate(draft, expectedVersion, options) {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      fail('MEASUREMENT_EXPECTED_VERSION_INVALID', 'Не удалось определить версию таблицы. Откройте форму заново.', 'The chart version could not be determined. Reopen the form.');
    }
    return { expectedVersion, ...buildEditable(draft, options) };
  }

  function buildPublish(chart) {
    if (!chart || !Number.isInteger(chart.version) || chart.version < 1) {
      fail('MEASUREMENT_EXPECTED_VERSION_INVALID', 'Не удалось определить версию таблицы. Откройте форму заново.', 'The chart version could not be determined. Reopen the form.');
    }
    return { expectedVersion: chart.version };
  }

  // Состояние формы по прочитанной с сервера таблице: значения приходят числами, форма держит строки.
  function draftFromChart(chart, base) {
    const cellsOf = (point) => Object.fromEntries((point.measurements || []).map((m) => [m.sizeValueId, String(m.value)]));
    return {
      ...base,
      unitEntryId: chart.measurementUnitEntryId,
      baseSizeValueId: chart.baseSizeValueId,
      notes: chart.notes ?? '',
      schemaImageUri: chart.schemaImageUri ?? null,
      points: (chart.points || []).map((point) => ({
        pointEntryId: point.pointEntryId,
        description: point.description ?? '',
        toleranceMinus: String(point.toleranceMinus),
        tolerancePlus: String(point.tolerancePlus),
        cells: cellsOf(point),
        qcChecked: point.qcChecked === true,
        gradeSteps: Array.isArray(point.gradeSteps) ? [...point.gradeSteps] : null,
      })),
    };
  }

  // Сохранить черновик и, если нужно, опубликовать. Цепочка из двух вызовов может оборваться на
  // середине: тогда человек узнаёт, что черновик уже сохранён, и повтор не создаёт вторую таблицу —
  // `existing` обновляется возвращённой таблицей.
  async function persist(draft, { existing = null, publish = false, send = global.mutate } = {}) {
    const options = { complete: publish };
    let chart;
    if (existing) chart = await send(`/v2/measurements/canonical/${encodeURIComponent(existing.id)}`, buildUpdate(draft, existing.version, options), 'PATCH');
    else chart = await send('/v2/measurements/canonical', buildCreate(draft, options));
    if (!publish) return { chart, published: false };
    try {
      chart = await send(`/v2/measurements/canonical/${encodeURIComponent(chart.id)}/publish`, buildPublish(chart));
    } catch (error) {
      const wrapped = new Error(`${error.message} ${t('Черновик таблицы сохранён — исправьте замечание и нажмите «Опубликовать» снова.', 'The chart draft is saved — fix the issue and press “Publish” again.')}`);
      wrapped.code = error.code;
      wrapped.details = error.details;
      wrapped.savedChart = chart;
      throw wrapped;
    }
    return { chart, published: true };
  }

  // --- чтение контекста ----------------------------------------------------------------------------

  function name(entry) { return (global.I18N?.getLocale?.() === 'en' ? entry.nameEn : entry.nameRu) || entry.nameRu || entry.nameEn || entry.code || entry.id; }
  function isLength(entry) { return !entry.attributes || entry.attributes.dimension === undefined || entry.attributes.dimension === 'length'; }
  function isMetricLength(entry) { return isLength(entry) && (!entry.attributes || entry.attributes.system === undefined || entry.attributes.system === 'metric'); }

  async function loadLibrary(code, accept) {
    const items = [];
    let cursor = null;
    // Справочник точек невелик, но страница — это страница: дочитываем, пока сервер называет продолжение.
    for (let page = 0; page < 10; page += 1) {
      const query = `limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const result = await global.api(`/v2/libraries/${encodeURIComponent(code)}/entries?${query}`);
      for (const entry of Array.isArray(result?.items) ? result.items : []) if ((!entry.status || entry.status === 'active') && accept(entry)) items.push(entry);
      cursor = result?.nextCursor || null;
      if (!cursor) break;
    }
    return items;
  }

  // Пары «цветомодель → версии шкалы» берутся из SKU цветомодели: готовность читает таблицы ровно по
  // тем версиям шкалы, на которые указывают продаваемые SKU.
  function scaleVersionsOf(colorway) {
    const byVersion = new Map();
    for (const sku of Array.isArray(colorway?.skus) ? colorway.skus : []) {
      const size = sku.size || {};
      if (size.sizeScaleVersionId && !byVersion.has(size.sizeScaleVersionId)) {
        byVersion.set(size.sizeScaleVersionId, { id: size.sizeScaleVersionId, sizeScaleId: size.sizeScaleId, versionNo: size.sizeScaleVersionNo, scaleCode: size.scaleCode, nameRu: size.scaleNameRu, nameEn: size.scaleNameEn });
      }
    }
    return [...byVersion.values()];
  }

  function mayManage(brandId) {
    const caps = global.SynthaUiCapabilities;
    return Boolean(caps?.hasForOrganisation(global.state?.workspace ?? state.workspace, brandId, caps.CAPABILITIES.MEASUREMENT_MANAGE));
  }

  // --- диалог ---------------------------------------------------------------------------------------

  async function open({ product, colorwayId = null, onSaved } = {}) {
    if (!product?.id) throw new Error('PRODUCT_STYLE_NOT_FOUND');
    if (!mayManage(product.brandId)) throw new Error('CAPABILITY_DENIED');
    if (!product.styleVersionId) { toast(t('У модели ещё нет версии.', 'The style has no version yet.'), 'error'); return; }
    const aggregate = await api(`/v2/product/styles/${encodeURIComponent(product.id)}`);
    const colorways = (Array.isArray(aggregate?.colorways) ? aggregate.colorways : []).filter((entry) => scaleVersionsOf(entry).length);
    if (!colorways.length) {
      toast(t('У цветомоделей нет SKU с размерной шкалой. Сначала привяжите шкалу к цветомодели.', 'No colourway has SKUs on a size scale yet. Bind a size scale to a colourway first.'), 'error');
      return;
    }
    const [units, points] = await Promise.all([loadLibrary(LIBRARIES.unit, isMetricLength), loadLibrary(LIBRARIES.point, isLength)]);
    if (!units.length || !points.length) {
      toast(t('Справочники единиц и точек измерения пусты. Загрузите справочники (bootstrap-mdm-reference).', 'The unit and point-of-measure libraries are empty. Load the reference data first.'), 'error');
      return;
    }
    const preferred = colorways.find((entry) => entry.id === colorwayId) || colorways[0];
    const view = { colorway: preferred, scale: scaleVersionsOf(preferred)[0], sizes: [], existing: null, draft: null, busy: false, token: 0 };

    const modal = el('dialog', { className: 'od-form-dialog od-measurement-dialog' });
    const form = el('form', { method: 'dialog' });
    const head = el('header');
    head.append(el('h2', { rawText: t(`Каноническая таблица мер · ${product.styleCode}`, `Canonical measurement chart · ${product.styleCode}`) }));
    head.append(el('p', { className: 'muted', rawText: t(
      'Одна таблица на пару «цветомодель × версия размерной шкалы». Единица и точки измерения — из справочника; значения — на каждый размер шкалы. Именно опубликованная каноническая таблица закрывает измерение «Таблицы измерений» в готовности.',
      'One chart per colourway × size-scale-version pair. The unit and points come from the reference library; values are given for every size of the scale. A published canonical chart is what closes the “Measurement charts” readiness dimension.') }));

    const label = (text, control) => { const node = el('label', { className: 'od-form-field' }); node.append(el('span', { rawText: text }), control); return node; };
    const selectOf = (nameAttr, options, value) => {
      const node = el('select', { name: nameAttr });
      for (const [optionValue, text] of options) { const option = el('option', { value: optionValue, rawText: text }); if (optionValue === value) option.selected = true; node.append(option); }
      return node;
    };
    const colorwaySelect = selectOf('colorwayId', colorways.map((entry) => [entry.id, `${entry.colorwayCode || entry.article || entry.id} · ${name(entry)}`]), view.colorway.id);
    const scaleSelect = el('select', { name: 'sizeScaleVersionId' });
    const unitSelect = selectOf('measurementUnitEntryId', units.map((entry) => [entry.id, `${entry.code ? `${entry.code} · ` : ''}${name(entry)}`]),
      (units.find((entry) => entry.code === 'CM') || units[0]).id);
    const baseSelect = el('select', { name: 'baseSizeValueId' });
    const notes = el('textarea', { name: 'notes', maxlength: '2000', rows: '2' });
    const status = el('p', { className: 'muted' });
    const matrix = el('div', { className: 'od-measurement-matrix' });
    const error = el('div', { className: 'od-form-error' });
    const footer = el('footer');
    const cancel = el('button', { className: 'button secondary', type: 'button', rawText: I18N.t('common.cancel') });
    const saveDraft = el('button', { className: 'button', type: 'button', rawText: t('Сохранить черновик', 'Save draft') });
    const publish = el('button', { className: 'button primary', type: 'submit', rawText: t('Опубликовать', 'Publish') });
    footer.append(cancel, saveDraft, publish);
    const addPoint = el('button', { className: 'button small', type: 'button', rawText: t('Добавить точку измерения', 'Add a point of measure') });

    const row = (children) => { const node = el('div', { className: 'od-inline-actions' }); node.append(...children); return node; };
    form.append(head, label(t('Цветомодель', 'Colourway'), colorwaySelect), label(t('Версия размерной шкалы', 'Size scale version'), scaleSelect),
      label(t('Единица измерения', 'Measurement unit'), unitSelect), label(t('Базовый размер', 'Base size'), baseSelect),
      status, matrix, row([addPoint]), label(t('Примечание', 'Notes'), notes), footer);

    const setBusy = (busy) => { view.busy = busy; for (const node of [saveDraft, publish, addPoint, colorwaySelect, scaleSelect]) node.disabled = busy; };
    // Сообщение вставляется и убирается, а не скрывается атрибутом: правила дизайн-системы для
    // дочерних блоков формы перебивают `[hidden]`, и пустая розовая плашка висела над кнопками.
    const showError = (problem) => { error.textContent = problem?.message || String(problem); footer.before(error); };
    const clearError = () => { error.remove(); };

    function pointOptions() { return [['', t('— точка измерения —', '— point of measure —')], ...points.map((entry) => [entry.id, `${entry.code ? `${entry.code} · ` : ''}${name(entry)}`])]; }

    function newPointRow() { return { pointEntryId: '', description: '', toleranceMinus: '0.5', tolerancePlus: '0.5', cells: {}, qcChecked: false, gradeSteps: null }; }

    // Значения из полей в состояние: перерисовка не должна стирать набранное.
    function syncFromDom() {
      if (!view.draft) return;
      view.draft.unitEntryId = unitSelect.value;
      view.draft.baseSizeValueId = baseSelect.value;
      view.draft.notes = notes.value;
      matrix.querySelectorAll('tr[data-row]').forEach((tr) => {
        const point = view.draft.points[Number(tr.dataset.row)];
        if (!point) return;
        point.pointEntryId = tr.querySelector('[data-field="pointEntryId"]').value;
        point.description = tr.querySelector('[data-field="description"]').value;
        point.toleranceMinus = tr.querySelector('[data-field="toleranceMinus"]').value;
        point.tolerancePlus = tr.querySelector('[data-field="tolerancePlus"]').value;
        tr.querySelectorAll('[data-size]').forEach((input) => { point.cells[input.dataset.size] = input.value; });
      });
    }

    function renderMatrix() {
      matrix.replaceChildren();
      const table = el('table', { className: 'od-mini-table' });
      const headRow = el('tr');
      for (const text of [t('Точка измерения', 'Point of measure'), t('Описание', 'Description'), t('Допуск «−»', 'Tol. “−”'), t('Допуск «+»', 'Tol. “+”')]) headRow.append(el('th', { rawText: text }));
      for (const size of view.sizes) headRow.append(el('th', { rawText: size.sizeCode }));
      headRow.append(el('th', { rawText: '' }));
      const thead = el('thead');
      thead.append(headRow);
      table.append(thead);
      const body = el('tbody');
      view.draft.points.forEach((point, index) => {
        const tr = el('tr', { 'data-row': index });
        const cell = (control) => { const td = el('td'); td.append(control); tr.append(td); return control; };
        const pointSelect = cell(selectOf('pointEntryId', pointOptions(), point.pointEntryId)); pointSelect.dataset.field = 'pointEntryId';
        const description = cell(el('input', { type: 'text', maxlength: '500', value: point.description })); description.dataset.field = 'description';
        for (const key of ['toleranceMinus', 'tolerancePlus']) {
          const input = cell(el('input', { type: 'text', inputmode: 'decimal', size: '5', value: point[key] })); input.dataset.field = key;
        }
        for (const size of view.sizes) {
          const input = cell(el('input', { type: 'text', inputmode: 'decimal', size: '6', value: point.cells[size.id] ?? '', 'aria-label': `${size.sizeCode}` }));
          input.dataset.size = size.id;
        }
        const remove = el('button', { className: 'button small', type: 'button', rawText: '×', title: t('Убрать точку', 'Remove the point') });
        remove.addEventListener('click', () => { syncFromDom(); view.draft.points.splice(index, 1); renderMatrix(); });
        cell(remove);
        body.append(tr);
      });
      table.append(body);
      matrix.append(table);
    }

    function applyBase() {
      baseSelect.replaceChildren();
      for (const size of view.sizes) {
        const option = el('option', { value: size.id, rawText: `${size.sizeCode} · ${(global.I18N?.getLocale?.() === 'en' ? size.labelEn : size.labelRu) || size.sizeCode}` });
        if (size.id === view.draft.baseSizeValueId) option.selected = true;
        baseSelect.append(option);
      }
    }

    // Контекст пары «цветомодель × шкала»: размеры шкалы и уже существующая таблица этой пары.
    async function loadContext() {
      const token = ++view.token;
      setBusy(true);
      clearError();
      matrix.replaceChildren(el('p', { className: 'muted', rawText: t('Читаем шкалу и таблицу…', 'Reading the scale and the chart…') }));
      try {
        const scaleAggregate = await api(`/v2/product/size-scales/${encodeURIComponent(view.scale.sizeScaleId)}?versionNo=${encodeURIComponent(view.scale.versionNo)}`);
        const sizes = (Array.isArray(scaleAggregate?.values) ? scaleAggregate.values : []).filter((value) => !value.sizeScaleVersionId || value.sizeScaleVersionId === view.scale.id)
          .sort((left, right) => left.sortOrder - right.sortOrder);
        const listing = await api(`/v2/measurements/canonical?styleVersionId=${encodeURIComponent(product.styleVersionId)}&colorwayId=${encodeURIComponent(view.colorway.id)}`);
        const found = (Array.isArray(listing?.items) ? listing.items : []).find((item) => item.sizeScaleVersionId === view.scale.id) || null;
        const existing = found ? await api(`/v2/measurements/canonical/${encodeURIComponent(found.id)}`) : null;
        if (token !== view.token) return;
        view.sizes = sizes;
        view.existing = existing;
        const base = { styleVersionId: product.styleVersionId, colorwayId: view.colorway.id, sizeScaleVersionId: view.scale.id, sizes: sizes.map((size) => ({ id: size.id })) };
        view.draft = existing
          ? draftFromChart(existing, base)
          : { ...base, unitEntryId: unitSelect.value, baseSizeValueId: sizes[Math.floor((sizes.length - 1) / 2)]?.id ?? '', notes: '', schemaImageUri: null, points: [newPointRow()] };
        if (existing) unitSelect.value = existing.measurementUnitEntryId;
        notes.value = view.draft.notes;
        status.textContent = existing
          ? (existing.status === 'published'
            ? t(`Таблица опубликована (версия ${existing.version}). Правка создаст новую черновую ревизию; прежняя сохранится в архиве.`, `The chart is published (version ${existing.version}). An edit starts a new draft revision; the published one stays in the archive.`)
            : t(`Черновик таблицы (версия ${existing.version}).`, `Chart draft (version ${existing.version}).`))
          : t('Таблицы для этой пары ещё нет — она будет создана.', 'There is no chart for this pair yet — it will be created.');
        applyBase();
        renderMatrix();
        setBusy(!sizes.length);
        if (!sizes.length) showError(new Error(t('В этой версии шкалы нет размеров.', 'This scale version has no sizes.')));
      } catch (problem) {
        if (token !== view.token) return;
        matrix.replaceChildren();
        showError(problem);
        setBusy(true);
      }
    }

    function fillScaleSelect() {
      scaleSelect.replaceChildren();
      for (const version of scaleVersionsOf(view.colorway)) {
        const option = el('option', { value: version.id, rawText: `${version.scaleCode || version.sizeScaleId} · v${version.versionNo}` });
        if (version.id === view.scale.id) option.selected = true;
        scaleSelect.append(option);
      }
    }

    colorwaySelect.addEventListener('change', () => {
      view.colorway = colorways.find((entry) => entry.id === colorwaySelect.value);
      view.scale = scaleVersionsOf(view.colorway)[0];
      fillScaleSelect();
      void loadContext();
    });
    scaleSelect.addEventListener('change', () => {
      view.scale = scaleVersionsOf(view.colorway).find((version) => version.id === scaleSelect.value);
      void loadContext();
    });
    addPoint.addEventListener('click', () => { syncFromDom(); view.draft.points.push(newPointRow()); renderMatrix(); });
    cancel.addEventListener('click', () => modal.close());

    async function submit(publishNow) {
      if (view.busy || !view.draft) return;
      syncFromDom();
      clearError();
      setBusy(true);
      try {
        const result = await persist(view.draft, { existing: view.existing, publish: publishNow });
        view.existing = result.chart;
        modal.close();
        if (typeof onSaved === 'function') onSaved(result.chart);
        try { await reload(); renderApp(); } catch { /* таблица сохранена; обновление экрана не обязательно */ }
        toast(result.published ? t('Каноническая таблица опубликована.', 'The canonical chart is published.') : t('Черновик таблицы сохранён.', 'The chart draft is saved.'), 'success');
      } catch (problem) {
        if (problem?.savedChart) view.existing = problem.savedChart;
        showError(problem);
        setBusy(false);
      }
    }
    form.addEventListener('submit', (event) => { event.preventDefault(); void submit(true); });
    saveDraft.addEventListener('click', () => { void submit(false); });
    modal.addEventListener('close', () => modal.remove(), { once: true });
    modal.append(form);
    document.body.append(modal);
    modal.showModal();
    fillScaleSelect();
    await loadContext();
  }

  global.SynthaCanonicalMeasurementForm = Object.freeze({
    open,
    mayManage,
    persist,
    scaleVersionsOf,
    build: Object.freeze({
      create: buildCreate,
      update: buildUpdate,
      publish: buildPublish,
      value: buildValue,
      tolerance: buildTolerance,
      draftFromChart,
    }),
  });
}(typeof window !== 'undefined' ? window : globalThis));
