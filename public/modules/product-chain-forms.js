(function installProductChainForms(global) {
  'use strict';

  // Цепочка «слот плана → модель → версия → размерная шкала → SKU → коллекция» была целиком в API и в
  // домене, но не в интерфейсе: стиль создавался скриптом, версия — скриптом, шкала — скриптом, а в
  // коллекцию модель попадала только через HTTP. Человек доходил до пустого реестра моделей и не мог
  // сделать ни одного шага. Здесь собраны формы, которые проходят эти шаги кликами.
  //
  // Правило этого файла то же, что у остальных форм: полезная нагрузка собирается чистыми функциями
  // (`build*`) по границам, которые держит домен (`product-identity/public.mjs`, `collections/public.mjs`),
  // а форма только собирает значения и зовёт маршруты. Тест гоняет эти же функции через доменные
  // конструкторы и контракты маршрутов — расхождение форм и сервера ловится там, а не на экране.

  const STYLE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
  const SCALE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
  const SKU_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
  const TERMINAL_STYLE_STATUSES = Object.freeze(['discontinued', 'rejected', 'superseded']);
  const MAX_SIZES = 40;

  const LIBRARIES = Object.freeze({
    category: 'assortment.category',
    productType: 'assortment.product_type',
    gender: 'assortment.gender',
    sizeSystem: 'size.system',
  });

  function t(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }

  function fail(code, ru, en) {
    const error = new Error(t(ru, en));
    error.code = code;
    throw error;
  }

  function length(value) { return String(value ?? '').trim().length; }

  // --- чистые сборщики полезной нагрузки -----------------------------------------------------------

  function normaliseCode(value) { return String(value ?? '').trim().toUpperCase(); }

  function requireText(value, min, max, label, labelEn) {
    const size = length(value);
    if (size < min || size > max) {
      fail('FIELD_LENGTH_INVALID', `${label}: от ${min} до ${max} символов.`, `${labelEn}: ${min} to ${max} characters.`);
    }
    return String(value).trim();
  }

  function buildStyleCreate({ brandId, styleCode }) {
    const code = normaliseCode(styleCode);
    if (!STYLE_CODE_PATTERN.test(code)) {
      fail('PRODUCT_STYLE_CODE_INVALID', 'Код модели: 2–64 символа, заглавные латинские буквы, цифры, точка, подчёркивание, косая черта или дефис.', 'Style code: 2-64 characters, uppercase Latin letters, digits, dot, underscore, slash or dash.');
    }
    if (!brandId) fail('PRODUCT_BRAND_REQUIRED', 'Выберите бренд.', 'Choose a brand.');
    return { brandId, styleCode: code };
  }

  function refOrNull(ref) {
    return ref && ref.entryId && Number.isInteger(ref.version) && ref.version > 0 ? { entryId: ref.entryId, version: ref.version } : null;
  }

  // Ссылки на справочники необязательны: отсутствующий ключ — это «не указано», а `null` маршрут
  // отвергает как неверное поле.
  function buildStyleVersion({ expectedLatestVersionNo, titleRu, titleEn, categoryRef, productTypeRef, genderRef, technicalPayload }) {
    if (!Number.isInteger(expectedLatestVersionNo) || expectedLatestVersionNo < 0) {
      fail('PRODUCT_STYLE_VERSION_EXPECTATION_INVALID', 'Не удалось определить текущую версию модели. Обновите страницу.', 'The current style version could not be determined. Refresh the page.');
    }
    const body = {
      expectedLatestVersionNo,
      titleRu: requireText(titleRu, 2, 200, 'Название RU', 'Title RU'),
      titleEn: requireText(titleEn, 2, 200, 'Название EN', 'Title EN'),
    };
    const category = refOrNull(categoryRef);
    const productType = refOrNull(productTypeRef);
    const gender = refOrNull(genderRef);
    if (category) body.categoryRef = category;
    if (productType) body.productTypeRef = productType;
    if (gender) body.genderRef = gender;
    if (technicalPayload && typeof technicalPayload === 'object' && !Array.isArray(technicalPayload)) body.technicalPayload = technicalPayload;
    return body;
  }

  function buildSizeScaleCreate({ brandId, scaleCode, nameRu, nameEn }) {
    const code = normaliseCode(scaleCode);
    if (!SCALE_CODE_PATTERN.test(code)) {
      fail('PRODUCT_SIZE_SCALE_CODE_INVALID', 'Код шкалы: 2–64 символа, заглавные латинские буквы, цифры, точка, подчёркивание, косая черта или дефис.', 'Scale code: 2-64 characters, uppercase Latin letters, digits, dot, underscore, slash or dash.');
    }
    if (!brandId) fail('PRODUCT_BRAND_REQUIRED', 'Выберите бренд.', 'Choose a brand.');
    return {
      brandId,
      scaleCode: code,
      nameRu: requireText(nameRu, 2, 160, 'Название RU', 'Name RU'),
      nameEn: requireText(nameEn, 2, 160, 'Название EN', 'Name EN'),
    };
  }

  function buildSizeScaleVersion({ expectedLatestVersionNo, sizeSystemRef }) {
    const body = { expectedLatestVersionNo };
    const system = refOrNull(sizeSystemRef);
    if (system) body.sizeSystemRef = system;
    return body;
  }

  // «XS, S, M, L» → упорядоченный список кодов. Порядок ввода становится порядком размерного ряда.
  function parseSizeCodes(raw) {
    const codes = String(raw ?? '').split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean);
    if (!codes.length) fail('PRODUCT_SIZE_VALUE_CODE_INVALID', 'Укажите хотя бы один размер.', 'Enter at least one size.');
    if (codes.length > MAX_SIZES) fail('PRODUCT_SIZE_SCALE_TOO_LONG', `В одной шкале не больше ${MAX_SIZES} размеров.`, `One scale holds at most ${MAX_SIZES} sizes.`);
    const seen = new Set();
    for (const code of codes) {
      if (code.length > 64) fail('PRODUCT_SIZE_VALUE_CODE_INVALID', `Размер «${code.slice(0, 20)}…» длиннее 64 символов.`, `Size "${code.slice(0, 20)}..." is longer than 64 characters.`);
      const key = code.toLowerCase();
      if (seen.has(key)) fail('PRODUCT_SIZE_VALUE_CODE_DUPLICATE', `Размер «${code}» повторяется.`, `Size "${code}" repeats.`);
      seen.add(key);
    }
    return codes;
  }

  // Подпись размера совпадает с кодом: для S/M/L и числовых рядов это то, что печатается на ярлыке.
  function buildSizeValue(code, index) {
    return { sizeCode: code, labelRu: code, labelEn: code, sortOrder: index };
  }

  function buildSizeScaleActivation(scale) {
    return { expectedVersion: scale.version, nameRu: scale.nameRu, nameEn: scale.nameEn, status: 'active' };
  }

  function skuCodeFor(styleCode, colorwayCode, sizeCode) {
    const joined = `${styleCode}-${colorwayCode}-${sizeCode}`.toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/-{2,}/g, '-');
    if (!SKU_CODE_PATTERN.test(joined)) {
      fail('PRODUCT_SKU_CODE_INVALID', `Из кода «${joined.slice(0, 24)}…» не получается код SKU (2–64 символа). Заведите SKU по одному.`, `A SKU code cannot be made from "${joined.slice(0, 24)}..." (2-64 characters). Add the SKUs one by one.`);
    }
    return joined;
  }

  // По одному SKU на каждый размер шкалы, которого у цветомодели ещё нет.
  function buildSkuPayloads({ styleVersionId, styleCode, colorway, sizeValues, existingSizeValueIds = [] }) {
    const taken = new Set(existingSizeValueIds);
    return [...sizeValues]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .filter((value) => !taken.has(value.id))
      .map((value) => ({
        skuCode: skuCodeFor(styleCode, colorway.colorwayCode, value.sizeCode),
        styleVersionId,
        colorwayId: colorway.id,
        sizeValueId: value.id,
      }));
  }

  function buildCollectionAssignment({ styleVersionId }) {
    if (!styleVersionId) fail('PRODUCT_STYLE_VERSION_NOT_FOUND', 'У модели ещё нет версии, которую можно положить в коллекцию.', 'This style has no version to put into a collection yet.');
    return { styleVersionId };
  }

  // --- чтение справочников и состояние -------------------------------------------------------------

  const libraryCache = global.SynthaProductChainLibraries || (global.SynthaProductChainLibraries = new Map());

  async function loadLibrary(code) {
    if (libraryCache.has(code)) return libraryCache.get(code);
    try {
      const page = await api(`/v2/libraries/${encodeURIComponent(code)}/entries?limit=200`);
      const items = Array.isArray(page?.items) ? page.items.filter((entry) => !entry.status || entry.status === 'active') : [];
      libraryCache.set(code, items);
      return items;
    } catch {
      // Справочник — удобство, а не условие: без него поле остаётся «не указано», и модель заводится.
      return [];
    }
  }

  function entryName(entry) { return (global.I18N?.getLocale?.() === 'en' ? entry.nameEn : entry.nameRu) || entry.nameRu || entry.nameEn || entry.code || entry.id; }
  function libraryOptions(items) { return [{ id: '' }, ...items]; }
  function libraryFormat(entry) { return entry.id === '' ? t('— не указано —', '— not set —') : `${entry.code ? `${entry.code} · ` : ''}${entryName(entry)}`; }
  function refFromChoice(items, id) {
    const entry = items.find((candidate) => candidate.id === id);
    return entry ? { entryId: entry.id, version: Number(entry.version) } : null;
  }

  function caps() { return global.SynthaUiCapabilities; }
  function mayManageProducts(brandId) {
    const c = caps();
    return Boolean(c?.hasForOrganisation(state.workspace, brandId, c.CAPABILITIES.PRODUCT_MANAGE));
  }
  function manageableBrands() {
    const orgs = Array.isArray(state.workspace?.organisations) ? state.workspace.organisations : [];
    return orgs.filter((org) => org.type === 'brand' && mayManageProducts(org.id));
  }
  function brandLabel(org) { return org.name || org.id; }

  function notePartial(error, stage) {
    // Цепочка из нескольких вызовов может оборваться посередине. Человек должен знать, что уже
    // сделано, а не гадать по голому коду отказа.
    if (!stage) return error;
    const wrapped = new Error(`${error.message} ${t(`Уже выполнено: ${stage.ru}. Повторите отправку — выполненные шаги не повторятся.`, `Already done: ${stage.en}. Submit again — completed steps are not repeated.`)}`);
    wrapped.code = error.code;
    wrapped.details = error.details;
    return wrapped;
  }

  // --- 1. Создать модель (из слота плана или с нуля) ------------------------------------------------

  async function createStyleForm({ placeholder = null } = {}) {
    const brands = placeholder ? [] : manageableBrands();
    const brandId = placeholder ? placeholder.brandId : null;
    if (placeholder) {
      if (!mayManageProducts(placeholder.brandId)) throw new Error('CAPABILITY_DENIED');
      if (placeholder.status === 'dropped') { toast(t('Слот снят с плана — модель к нему не привязать.', 'The slot was dropped from the plan, so a style cannot be linked to it.'), 'error'); return; }
    } else if (!brands.length) { toast(t('Нет бренда, в котором у вас есть право заводить модели.', 'There is no brand in which you may create styles.'), 'error'); return; }

    const [categories, productTypes, genders] = await Promise.all([loadLibrary(LIBRARIES.category), loadLibrary(LIBRARIES.productType), loadLibrary(LIBRARIES.gender)]);
    const fields = [];
    if (!placeholder) fields.push(selectDef('brandId', t('Бренд', 'Brand'), brands, brandLabel));
    fields.push(
      textDef('styleCode', t('Код модели', 'Style code'), placeholder ? normaliseCode(placeholder.placeholderCode) : '', 64, true, 2),
      textDef('titleRu', t('Название RU', 'Title RU'), placeholder?.nameRu && length(placeholder.nameRu) >= 2 ? String(placeholder.nameRu).trim().slice(0, 200) : '', 200, true, 2),
      textDef('titleEn', t('Название EN', 'Title EN'), placeholder?.nameEn && length(placeholder.nameEn) >= 2 ? String(placeholder.nameEn).trim().slice(0, 200) : '', 200, true, 2),
      selectDef('categoryId', t('Категория', 'Category'), libraryOptions(categories), libraryFormat, '', false),
      selectDef('productTypeId', t('Тип изделия', 'Product type'), libraryOptions(productTypes), libraryFormat, '', false),
      selectDef('genderId', t('Пол', 'Gender'), libraryOptions(genders), libraryFormat, '', false),
    );

    // Что уже создано в этой форме, если цепочка оборвалась на середине: стиль без версии не должен
    // мешать повторной отправке упереться в «такой код уже есть».
    const done = { createdStyle: null, version: false, link: false };
    openForm(placeholder ? t('Создать модель из слота', 'Create a style from the slot') : t('Создать модель', 'Create a style'), fields, async (values) => {
      const chosenBrand = placeholder ? brandId : values.brandId;
      const styleBody = buildStyleCreate({ brandId: chosenBrand, styleCode: values.styleCode });
      const versionBody = buildStyleVersion({
        expectedLatestVersionNo: 0,
        titleRu: values.titleRu,
        titleEn: values.titleEn,
        categoryRef: refFromChoice(categories, values.categoryId),
        productTypeRef: refFromChoice(productTypes, values.productTypeId),
        genderRef: refFromChoice(genders, values.genderId),
      });
      try {
        if (!done.createdStyle) done.createdStyle = await mutate('/v2/product/styles', styleBody);
        if (!done.version) { await mutate(`/v2/product/styles/${encodeURIComponent(done.createdStyle.id)}/versions`, versionBody); done.version = true; }
        if (placeholder && !done.link) { await mutate(`/v2/assortment/placeholders/${encodeURIComponent(placeholder.id)}/styles`, { styleId: done.createdStyle.id }); done.link = true; }
      } catch (error) {
        throw notePartial(error, done.createdStyle ? { ru: done.version ? 'модель и её первая версия созданы' : 'модель создана', en: done.version ? 'the style and its first version are created' : 'the style is created' } : null);
      }
    });
  }

  // --- 2. Новая версия модели ----------------------------------------------------------------------

  async function newStyleVersionForm(product) {
    if (!mayManageProducts(product.brandId)) throw new Error('CAPABILITY_DENIED');
    if (TERMINAL_STYLE_STATUSES.includes(product.lifecycleStatus)) {
      toast(t('Модель в конечном состоянии — новую версию завести нельзя.', 'The style is in a final state, so a new version cannot be created.'), 'error');
      return;
    }
    // Номер последней версии берётся с сервера, а не с карточки: сервер сверяет его и отказывает,
    // если за это время версию завёл кто-то другой.
    const aggregate = await api(`/v2/product/styles/${encodeURIComponent(product.id)}`);
    const latest = aggregate?.styleVersion;
    if (!latest || !Number.isInteger(latest.versionNo)) throw new Error('PRODUCT_STYLE_VERSION_NOT_FOUND');
    const [categories, productTypes, genders] = await Promise.all([loadLibrary(LIBRARIES.category), loadLibrary(LIBRARIES.productType), loadLibrary(LIBRARIES.gender)]);
    const keep = (items, ref) => (ref && items.some((entry) => entry.id === ref.entryId) ? ref.entryId : '');
    openForm(t(`Новая версия модели ${product.styleCode}`, `New version of style ${product.styleCode}`), [
      textDef('titleRu', t('Название RU', 'Title RU'), latest.titleRu || '', 200, true, 2),
      textDef('titleEn', t('Название EN', 'Title EN'), latest.titleEn || '', 200, true, 2),
      selectDef('categoryId', t('Категория', 'Category'), libraryOptions(categories), libraryFormat, keep(categories, latest.categoryRef), false),
      selectDef('productTypeId', t('Тип изделия', 'Product type'), libraryOptions(productTypes), libraryFormat, keep(productTypes, latest.productTypeRef), false),
      selectDef('genderId', t('Пол', 'Gender'), libraryOptions(genders), libraryFormat, keep(genders, latest.genderRef), false),
    ], (values) => mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/versions`, buildStyleVersion({
      expectedLatestVersionNo: latest.versionNo,
      titleRu: values.titleRu,
      titleEn: values.titleEn,
      categoryRef: refFromChoice(categories, values.categoryId),
      productTypeRef: refFromChoice(productTypes, values.productTypeId),
      genderRef: refFromChoice(genders, values.genderId),
      technicalPayload: latest.technicalPayload,
    })));
  }

  // --- 3. Размерная шкала --------------------------------------------------------------------------

  async function createSizeScaleForm({ brandId = null, onSaved } = {}) {
    const brands = brandId ? [] : manageableBrands();
    if (brandId) { if (!mayManageProducts(brandId)) throw new Error('CAPABILITY_DENIED'); }
    else if (!brands.length) { toast(t('Нет бренда, в котором у вас есть право заводить шкалы.', 'There is no brand in which you may create size scales.'), 'error'); return; }
    const systems = await loadLibrary(LIBRARIES.sizeSystem);
    const fields = [];
    if (!brandId) fields.push(selectDef('brandId', t('Бренд', 'Brand'), brands, brandLabel));
    fields.push(
      textDef('scaleCode', t('Код шкалы', 'Scale code'), '', 64, true, 2),
      textDef('nameRu', t('Название RU', 'Name RU'), '', 160, true, 2),
      textDef('nameEn', t('Название EN', 'Name EN'), '', 160, true, 2),
      selectDef('sizeSystemId', t('Система размеров', 'Size system'), libraryOptions(systems), libraryFormat, '', false),
      textDef('sizes', t('Размеры по порядку, через запятую (например: XS, S, M, L, XL)', 'Sizes in order, comma separated (for example: XS, S, M, L, XL)'), '', 600, true, 1),
    );
    // Шкала — несколько вызовов подряд (шапка, версия, размеры, активация). Что уже сделано,
    // запоминается, чтобы повторная отправка после обрыва достраивала шкалу, а не упиралась в «код занят».
    const done = { scale: null, version: null, sizes: 0, active: false };
    openForm(t('Создать размерную шкалу', 'Create a size scale'), fields, async (values) => {
      const scaleBody = buildSizeScaleCreate({ brandId: brandId || values.brandId, scaleCode: values.scaleCode, nameRu: values.nameRu, nameEn: values.nameEn });
      const codes = parseSizeCodes(values.sizes);
      const versionBody = buildSizeScaleVersion({ expectedLatestVersionNo: 0, sizeSystemRef: refFromChoice(systems, values.sizeSystemId) });
      try {
        if (!done.scale) done.scale = await mutate('/v2/product/size-scales', scaleBody);
        if (!done.version) done.version = await mutate(`/v2/product/size-scales/${encodeURIComponent(done.scale.id)}/versions`, versionBody);
        while (done.sizes < codes.length) {
          await mutate(`/v2/product/size-scale-versions/${encodeURIComponent(done.version.id)}/values`, buildSizeValue(codes[done.sizes], done.sizes));
          done.sizes += 1;
        }
        if (!done.active) { await mutate(`/v2/product/size-scales/${encodeURIComponent(done.scale.id)}`, buildSizeScaleActivation(done.scale), 'PATCH'); done.active = true; }
      } catch (error) {
        throw notePartial(error, done.scale ? { ru: `шкала создана, размеров записано: ${done.sizes}`, en: `the scale is created, sizes written: ${done.sizes}` } : null);
      }
      if (typeof onSaved === 'function') onSaved();
    });
  }

  // Привязка шкалы к цветомодели: SKU по каждому размеру выбранной шкалы. Дальше отдельные размеры
  // добавляет уже существующая форма «Добавить SKU».
  async function bindSizeScaleForm({ product, colorway, existingSizeValueIds = [], onSaved } = {}) {
    if (!mayManageProducts(product.brandId)) throw new Error('CAPABILITY_DENIED');
    if (!product.styleVersionId) { toast(t('У модели ещё нет версии.', 'The style has no version yet.'), 'error'); return; }
    const listing = await api(`/v2/product/size-scales?brandId=${encodeURIComponent(product.brandId)}`);
    const scales = (Array.isArray(listing?.items) ? listing.items : []).filter((scale) => scale.latestVersionNo && !['archived', 'inactive'].includes(scale.status));
    if (!scales.length) { toast(t('У бренда нет размерной шкалы с размерами. Сначала создайте шкалу.', 'The brand has no size scale with sizes. Create a scale first.'), 'error'); return; }
    const created = new Set();
    openForm(t(`Привязать размерную шкалу к цветомодели ${colorway.colorwayCode || ''}`, `Bind a size scale to colourway ${colorway.colorwayCode || ''}`), [
      selectDef('sizeScaleId', t('Размерная шкала', 'Size scale'), scales, (scale) => `${scale.scaleCode} · ${global.I18N?.getLocale?.() === 'en' ? scale.nameEn : scale.nameRu} · v${scale.latestVersionNo}`),
    ], async (values) => {
      const scale = scales.find((candidate) => candidate.id === values.sizeScaleId);
      if (!scale) throw new Error('PRODUCT_SIZE_SCALE_NOT_FOUND');
      const aggregate = await api(`/v2/product/size-scales/${encodeURIComponent(scale.id)}?versionNo=${encodeURIComponent(scale.latestVersionNo)}`);
      const sizeValues = Array.isArray(aggregate?.values) ? aggregate.values : [];
      if (!sizeValues.length) fail('PRODUCT_SIZE_VALUE_REQUIRED', 'В этой шкале нет размеров.', 'This scale has no sizes.');
      const payloads = buildSkuPayloads({ styleVersionId: product.styleVersionId, styleCode: product.styleCode, colorway, sizeValues, existingSizeValueIds: [...existingSizeValueIds, ...created] });
      if (!payloads.length) fail('PRODUCT_SKU_ALREADY_EXISTS', 'Все размеры этой шкалы у цветомодели уже есть.', 'Every size of this scale already exists on the colourway.');
      try {
        for (const body of payloads) { await mutate('/v2/product/skus', body); created.add(body.sizeValueId); }
      } catch (error) {
        throw notePartial(error, created.size ? { ru: `SKU заведено: ${created.size}`, en: `SKUs created: ${created.size}` } : null);
      }
      if (typeof onSaved === 'function') onSaved();
    });
  }

  // --- 4. В коллекцию ------------------------------------------------------------------------------

  // Вызывается с двух сторон: от модели («В коллекцию») выбирается коллекция, от коллекции («Добавить
  // модель») — модель. Состав меняется только пока коллекция черновик; повторное добавление той же
  // версии сервер принимает без последствий.
  function addToCollectionForm({ product = null, collection = null } = {}) {
    const c = caps();
    const manageable = (item) => item.status === 'draft' && c?.hasForOrganisation(state.workspace, item.brandId, c.CAPABILITIES.COLLECTION_MANAGE);
    if (product) {
      if (!product.styleVersionId) { toast(t('У модели ещё нет версии, которую можно положить в коллекцию.', 'This style has no version to put into a collection yet.'), 'error'); return; }
      const collections = (state.workspace.collections || []).filter((item) => item.brandId === product.brandId && manageable(item));
      if (!collections.length) { toast(t('У бренда нет коллекции-черновика: состав опубликованной коллекции не меняется.', 'The brand has no draft collection: a published collection’s assortment does not change.'), 'error'); return; }
      openForm(t(`Добавить модель ${product.styleCode} в коллекцию`, `Add style ${product.styleCode} to a collection`), [
        selectDef('collectionId', t('Коллекция', 'Collection'), collections, (item) => `${item.name} · ${item.currency}`),
      ], (values) => mutate(`/v2/collections/${encodeURIComponent(values.collectionId)}/style-versions`, buildCollectionAssignment({ styleVersionId: product.styleVersionId })));
      return;
    }
    if (!collection || !manageable(collection)) { toast(t('Состав коллекции можно менять, только пока она черновик.', 'A collection’s assortment can only change while it is a draft.'), 'error'); return; }
    const styles = (state.workspace.productStyles || []).filter((item) => item.brandId === collection.brandId && item.styleVersionId && !TERMINAL_STYLE_STATUSES.includes(item.lifecycleStatus));
    if (!styles.length) { toast(t('У бренда нет моделей с версией. Сначала создайте модель.', 'The brand has no styles with a version. Create a style first.'), 'error'); return; }
    openForm(t(`Добавить модель в коллекцию ${collection.name}`, `Add a style to collection ${collection.name}`), [
      selectDef('styleVersionId', t('Модель', 'Style'), styles.map((item) => ({ ...item, id: item.styleVersionId })), (item) => `${item.styleCode} · ${(global.I18N?.getLocale?.() === 'en' ? item.titleEn : item.titleRu) || item.titleRu || item.titleEn || ''} · v${item.styleVersionNo}`),
    ], (values) => mutate(`/v2/collections/${encodeURIComponent(collection.id)}/style-versions`, buildCollectionAssignment({ styleVersionId: values.styleVersionId })));
  }

  global.SynthaProductChainForms = Object.freeze({
    createStyleForm,
    newStyleVersionForm,
    createSizeScaleForm,
    bindSizeScaleForm,
    addToCollectionForm,
    mayManageProducts,
    build: Object.freeze({
      styleCreate: buildStyleCreate,
      styleVersion: buildStyleVersion,
      sizeScaleCreate: buildSizeScaleCreate,
      sizeScaleVersion: buildSizeScaleVersion,
      sizeCodes: parseSizeCodes,
      sizeValue: buildSizeValue,
      sizeScaleActivation: buildSizeScaleActivation,
      skuPayloads: buildSkuPayloads,
      collectionAssignment: buildCollectionAssignment,
    }),
  });
}(typeof window !== 'undefined' ? window : globalThis));
