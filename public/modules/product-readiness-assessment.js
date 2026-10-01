(function initializeProductReadinessAssessment(global) {
  'use strict';

  // Оценка готовности модели — последний из четырёх коммерческих шагов, который делал только
  // скрипт. `POST /v2/product/style-versions/{id}/readiness` в клиенте не вызывался ни разу, а
  // без снимка нет проекции, без проекции — публикации, без публикации — каталога байера.
  //
  // Оценка всегда записывает снимок, даже заблокированный: её смысл не в том, чтобы пройти, а в
  // том, чтобы узнать, чего не хватает.
  //
  // Раньше форма внешних подтверждений не спрашивала вовсе, а соответствие требуется на каждом
  // маршруте, — поэтому из интерфейса модель нельзя было довести до «готова» никому. Теперь
  // человек, чья роль вправе подтверждать измерение (соответствие, качество, закупка, выбор
  // поставщика), подтверждает его в форме сам: ссылка на документ и «подтверждаю». Хеш, время и
  // подписавшего форма ставит сама, а служба проверяет источник, свежесть и роль. Тот, чья роль не
  // вправе подтверждать, этих полей не видит — они ему не помогли бы: служба откажет.
  //
  // Форма предзаполняется прежним снимком, когда он есть: коммерческая подготовка меняется
  // редко, а набирать шестнадцать полей заново ради поправки цены — способ сделать ошибку в
  // цене. Изображения она берёт из самой модели: правило домена — главное фото и покрытие
  // каждого цветового варианта — проверяет сервер, а не человек в диалоге.

  const ROUTES = Object.freeze([
    { id: 'OWN_DEVELOPMENT', ru: 'Собственная разработка', en: 'Own development' },
    { id: 'MATERIALS_SEPARATE', ru: 'Материалы закупаются отдельно', en: 'Materials bought separately' },
    { id: 'READY_GOODS', ru: 'Готовые изделия', en: 'Ready goods' },
  ]);
  const AVAILABILITY = Object.freeze([
    { id: 'available_to_sell', ru: 'В наличии', en: 'Available to sell' },
    { id: 'made_to_order', ru: 'Под заказ', en: 'Made to order' },
    { id: 'preorder', ru: 'Предзаказ', en: 'Pre-order' },
  ]);

  // Измерения, подтверждаемые не платформой, и то, кто вправе их подтверждать. Совпадает с тем, что
  // проверяет служба (EXTERNAL_EVIDENCE_CAPABILITIES): расхождение здесь означало бы кнопку,
  // которая всегда отвечает отказом.
  const EVIDENCE_DIMENSIONS = Object.freeze([
    { code: 'sourcing', ru: 'Выбор поставщика', en: 'Supplier selection', capabilities: ['SOURCING_AWARD'], routes: ['READY_GOODS'] },
    { code: 'purchase_or_production_commitment', ru: 'Закупка / заказ', en: 'Purchase / order', capabilities: ['PRODUCTION_ORDER_CONFIRM', 'MATERIAL_PURCHASE_MANAGE'], routes: ['MATERIALS_SEPARATE', 'READY_GOODS'] },
    { code: 'quality', ru: 'Входной контроль качества', en: 'Incoming quality control', capabilities: ['QUALITY_APPROVE'], routes: ['READY_GOODS'] },
    { code: 'compliance', ru: 'Соответствие и маркировка (РФ/ЕАЭС)', en: 'Compliance and marking (RU/EAEU)', capabilities: ['PRODUCT_CERTIFICATION_MANAGE', 'COMPLIANCE_DOCUMENT_MANAGE'], routes: ['OWN_DEVELOPMENT', 'MATERIALS_SEPARATE', 'READY_GOODS'] },
  ]);
  const ATTESTATION_SOURCE = 'syntha-attestation';

  function attestableDimensions(product) {
    const caps = global.SynthaUiCapabilities;
    return EVIDENCE_DIMENSIONS.filter((dimension) => dimension.capabilities.some((name) => {
      const capability = caps?.CAPABILITIES?.[name];
      return capability && caps.hasForOrganisation(state.workspace, product.brandId, capability);
    }));
  }

  function actorIdOf() { return state.user?.actorId || state.user?.id || null; }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Подтверждение собирается из того, что сказал человек (ссылка), и того, что знает форма (кто, когда,
  // что именно подтверждено). Хеш — от всего этого вместе, чтобы подтверждение нельзя было переназначить
  // на другую модель или другое измерение.
  async function buildEvidence(product, dimension, reference, approvedBy) {
    const approvedAt = new Date().toISOString();
    const contentHash = await sha256Hex(JSON.stringify({ dimension: dimension.code, styleVersionId: product.styleVersionId, reference, approvedBy, approvedAt }));
    return {
      status: 'ready',
      evidenceId: `attest:${product.styleVersionId}:${dimension.code}:${approvedAt.replace(/[^0-9]/g, '')}`.slice(0, 160),
      sourceSystem: ATTESTATION_SOURCE,
      version: reference,
      contentHash,
      approvedAt,
      approvedBy,
    };
  }

  function text(ru, en) { return global.odText ? global.odText(ru, en) : ru; }
  function options(list) { return list.map((item) => ({ id: item.id, name: text(item.ru, item.en) })); }

  function canAssess(product) {
    const caps = global.SynthaUiCapabilities;
    return !!caps?.hasForOrganisation(state.workspace, product.brandId, caps.CAPABILITIES.PRODUCT_MANAGE);
  }

  // Изображения модели: и общие, и по цветовым вариантам. Домен требует хотя бы одно, среди них
  // главное фото, и покрытие каждого варианта — всё это он проверит сам; здесь собирается то, из
  // чего ему выбирать.
  function mediaIdsOf(styleRead) {
    const ids = [];
    for (const media of styleRead?.styleMedia || []) if (media?.id && media.mediaType === 'image') ids.push(media.id);
    for (const colorway of styleRead?.colorways || []) {
      for (const media of colorway?.media || []) if (media?.id && media.mediaType === 'image') ids.push(media.id);
    }
    return [...new Set(ids)];
  }

  async function previousPreparation(product) {
    if (!product.readinessSnapshotId) return null;
    try {
      const snapshot = await api(`/v2/product/readiness/${encodeURIComponent(product.readinessSnapshotId)}`);
      return { route: snapshot?.developmentRoute || null, preparation: snapshot?.commercialPreparationSnapshot || null };
    } catch (problem) {
      return null;
    }
  }

  // Библиотека ростовок бренда: именованные шаблоны `packRatio`, набранные один раз и
  // переиспользуемые в оценке готовности любой модели того же бренда.
  async function packRatioTemplatesOf(brandId) {
    try {
      return await api(`/v2/product/pack-ratio-templates?brandId=${encodeURIComponent(brandId)}`);
    } catch (problem) {
      return [];
    }
  }

  function parseRatio(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    const parts = trimmed.split(',').map((part) => Number.parseInt(part.trim(), 10));
    if (!parts.length || parts.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      const problem = new Error(text('Ростовка: список положительных целых чисел через запятую, например 1,2,2,1', 'Pack ratio: a comma-separated list of positive integers, e.g. 1,2,2,1'));
      problem.code = 'PACK_RATIO_INVALID';
      throw problem;
    }
    return parts;
  }

  function createPackRatioTemplateForm(brandId) {
    openForm(text('Создать шаблон ростовки', 'Create a pack ratio template'), [
      textDef('name', text('Название', 'Name'), '', 160),
      textDef('ratio', text('Ростовка (через запятую)', 'Pack ratio (comma-separated)'), '', 200),
    ], (values) => mutate('/v2/product/pack-ratio-templates', {
      brandId,
      name: values.name,
      ratio: parseRatio(values.ratio) || [],
    }));
  }

  function minorToMajor(value) {
    return Number.isSafeInteger(Number(value)) ? String(Number(value) / 100) : '';
  }

  async function assessForm(product) {
    const validation = global.SynthaUiValidation;
    const [styleRead, previous, packRatioTemplates] = await Promise.all([
      api(`/v2/product/styles/${encodeURIComponent(product.id)}`).catch(() => null),
      previousPreparation(product),
      packRatioTemplatesOf(product.brandId),
    ]);
    const mediaIds = mediaIdsOf(styleRead);
    if (!mediaIds.length) {
      toast(text(
        'У модели нет ни одного изображения — оценка требует главное фото и покрытие каждого цветового варианта. Сначала добавьте изображения на экране модели.',
        'This style has no images — an assessment needs a hero image and coverage of every colorway. Add images on the style screen first.',
      ), 'error');
      return;
    }
    const prep = previous?.preparation || {};
    const fields = [
      selectDef('developmentRoute', text('Маршрут разработки', 'Development route'), options(ROUTES), undefined, previous?.route || 'OWN_DEVELOPMENT'),
      textDef('titleRu', text('Название (рус.)', 'Title (RU)'), prep.titleRu || product.titleRu || '', 200),
      textDef('titleEn', text('Название (англ.)', 'Title (EN)'), prep.titleEn || product.titleEn || '', 200),
      textDef('descriptionRu', text('Описание (рус.)', 'Description (RU)'), prep.descriptionRu || '', 2000),
      textDef('descriptionEn', text('Описание (англ.)', 'Description (EN)'), prep.descriptionEn || '', 2000),
      textDef('compositionRu', text('Состав (рус.)', 'Composition (RU)'), prep.compositionRu || '', 500),
      textDef('compositionEn', text('Состав (англ.)', 'Composition (EN)'), prep.compositionEn || '', 500),
      textDef('countryOfOrigin', text('Страна происхождения (ISO, 2 буквы)', 'Country of origin (ISO, 2 letters)'), prep.countryOfOrigin || '', 2),
      textDef('currency', text('Валюта', 'Currency'), prep.currency || 'EUR', 3),
      // Деньги набираются в основных единицах — 129,00, а не 12900: минорные считает форма, и
      // именно здесь, а не в голове у человека, лежит место для ошибки в сто раз.
      numberDef('wholesalePrice', text('Оптовая цена', 'Wholesale price'), minorToMajor(prep.wholesalePriceMinor), false, 0),
      numberDef('rrp', text('Рекомендованная розничная цена', 'Recommended retail price'), minorToMajor(prep.rrpMinor), false, 0),
      numberDef('minimumOrderQuantity', text('Минимальный заказ, шт', 'Minimum order, units'), prep.minimumOrderQuantity ?? '', true, 1),
      dateDef('deliveryStart', text('Поставка с', 'Delivery from'), prep.deliveryStart || ''),
      dateDef('deliveryEnd', text('Поставка по', 'Delivery to'), prep.deliveryEnd || ''),
      selectDef('availabilityMode', text('Доступность', 'Availability'), options(AVAILABILITY), undefined, prep.availability?.mode || 'available_to_sell'),
      numberDef('availabilityQuantity', text('Доступное количество', 'Available quantity'), prep.availability?.quantity ?? '', true, 0),
      selectDef('packRatioTemplateId', text('Шаблон ростовки', 'Pack ratio template'), [
        { id: '', name: text('— не из библиотеки —', '— not from the library —') },
        ...packRatioTemplates.map((template) => ({ id: template.id, name: `${template.name} (${template.ratio.join('/')})` })),
      ], undefined, '', false),
      textDef('packRatio', text('Ростовка вручную (через запятую)', 'Pack ratio by hand (comma-separated)'), Array.isArray(prep.packRatio) ? prep.packRatio.join(',') : '', 200, false),
      selectDef('attributeCoverageConfirmed', text('Атрибуты категории заполнены', 'Category attributes are filled in'), [
        { id: 'yes', name: text('да, подтверждаю', 'yes, I confirm') },
        { id: 'no', name: text('нет', 'no') },
      ], undefined, prep.attributeCoverageConfirmed === false ? 'no' : 'yes'),
    ];
    const attestable = attestableDimensions(product);
    for (const dimension of attestable) {
      fields.push(
        selectDef(`evidence_${dimension.code}`, `${text(dimension.ru, dimension.en)}: ${text('подтверждаю', 'I confirm')}`, [
          { id: 'no', name: text('нет', 'no') },
          { id: 'yes', name: text('да, подтверждаю', 'yes, I confirm') },
        ], undefined, 'no'),
        textDef(`evidenceRef_${dimension.code}`, `${text(dimension.ru, dimension.en)}: ${text('номер или название документа', 'document number or name')}`, '', 128, false),
      );
    }
    openForm(text('Оценить готовность', 'Assess readiness'), fields, async (values) => {
      const money = (value, label) => Math.round(validation.number(value, label, { min: 0.01 }) * 100);
      // Шаблон из библиотеки побеждает ручной ввод: выбрав шаблон, человек явно отказывается от
      // ручного набора, а не забывает очистить поле рядом.
      const selectedTemplate = packRatioTemplates.find((template) => template.id === values.packRatioTemplateId);
      const packRatio = selectedTemplate ? selectedTemplate.ratio : parseRatio(values.packRatio);
      const preparation = {
        titleRu: validation.requiredText(values.titleRu, text('Название (рус.)', 'Title (RU)'), { minLength: 2, maxLength: 200 }),
        titleEn: validation.requiredText(values.titleEn, text('Название (англ.)', 'Title (EN)'), { minLength: 2, maxLength: 200 }),
        descriptionRu: validation.requiredText(values.descriptionRu, text('Описание (рус.)', 'Description (RU)'), { minLength: 2, maxLength: 2000 }),
        descriptionEn: validation.requiredText(values.descriptionEn, text('Описание (англ.)', 'Description (EN)'), { minLength: 2, maxLength: 2000 }),
        compositionRu: validation.requiredText(values.compositionRu, text('Состав (рус.)', 'Composition (RU)'), { minLength: 2, maxLength: 500 }),
        compositionEn: validation.requiredText(values.compositionEn, text('Состав (англ.)', 'Composition (EN)'), { minLength: 2, maxLength: 500 }),
        countryOfOrigin: String(values.countryOfOrigin || '').trim().toUpperCase(),
        currency: validation.currency(values.currency),
        wholesalePriceMinor: money(values.wholesalePrice, text('Оптовая цена', 'Wholesale price')),
        rrpMinor: money(values.rrp, text('Рекомендованная розничная цена', 'Recommended retail price')),
        minimumOrderQuantity: validation.number(values.minimumOrderQuantity, text('Минимальный заказ, шт', 'Minimum order, units'), { integer: true, min: 1 }),
        deliveryStart: values.deliveryStart,
        deliveryEnd: values.deliveryEnd,
        availability: {
          mode: values.availabilityMode,
          quantity: validation.number(values.availabilityQuantity, text('Доступное количество', 'Available quantity'), { integer: true, min: 0 }),
        },
        mediaIds,
        packRatio,
        attributeCoverageConfirmed: values.attributeCoverageConfirmed === 'yes',
      };
      validation.dateRange(preparation.deliveryStart, preparation.deliveryEnd, text('Окно поставки', 'Delivery window'));
      if (!/^[A-Z]{2}$/.test(preparation.countryOfOrigin)) {
        const problem = new Error(text('Страна происхождения: две буквы кода ISO, например TR', 'Country of origin: a two-letter ISO code, for example TR'));
        problem.code = 'COUNTRY_INVALID';
        throw problem;
      }
      const externalEvidence = {};
      for (const dimension of attestable) {
        if (values[`evidence_${dimension.code}`] !== 'yes') continue;
        if (!dimension.routes.includes(values.developmentRoute)) {
          const problem = new Error(text(
            `«${dimension.ru}» на выбранном маршруте подтверждается самой платформой — снимите подтверждение.`,
            `"${dimension.en}" is established by the platform itself on the chosen route — clear the confirmation.`,
          ));
          problem.code = 'EVIDENCE_NOT_ALLOWED_FOR_ROUTE';
          throw problem;
        }
        const reference = String(values[`evidenceRef_${dimension.code}`] || '').trim();
        if (reference.length < 2) {
          const problem = new Error(text(
            `«${dimension.ru}»: укажите номер или название документа, на котором держится подтверждение.`,
            `"${dimension.en}": give the number or name of the document the confirmation rests on.`,
          ));
          problem.code = 'EVIDENCE_REFERENCE_REQUIRED';
          throw problem;
        }
        externalEvidence[dimension.code] = await buildEvidence(product, dimension, reference.slice(0, 128), actorIdOf());
      }
      const body = { developmentRoute: values.developmentRoute, commercialPreparation: preparation };
      if (Object.keys(externalEvidence).length) body.externalEvidence = externalEvidence;
      return mutate(`/v2/product/style-versions/${encodeURIComponent(product.styleVersionId)}/readiness`, body);
    });
  }

  function assessAction(product) {
    if (!canAssess(product) || !product.styleVersionId) return null;
    return actionButton(
      product.readinessSnapshotId ? text('Оценить заново', 'Assess again') : text('Оценить готовность', 'Assess readiness'),
      () => assessForm(product),
    );
  }

  function packRatioTemplateAction(product) {
    if (!canAssess(product) || !product.brandId) return null;
    return actionButton(text('Шаблон ростовки', 'Pack ratio template'), () => createPackRatioTemplateForm(product.brandId));
  }

  global.SynthaProductReadinessAssessment = Object.freeze({ assessForm, assessAction, packRatioTemplateAction, mediaIdsOf, attestableDimensions, evidenceDimensions: EVIDENCE_DIMENSIONS });
})(window);
