(function initializeProductReadinessAssessment(global) {
  'use strict';

  // Оценка готовности модели — последний из четырёх коммерческих шагов, который делал только
  // скрипт. `POST /v2/product/style-versions/{id}/readiness` в клиенте не вызывался ни разу, а
  // без снимка нет проекции, без проекции — публикации, без публикации — каталога байера.
  //
  // Оценка всегда записывает снимок, даже заблокированный: её смысл не в том, чтобы пройти, а в
  // том, чтобы узнать, чего не хватает. Поэтому форма не требует от человека невозможного —
  // внешних подтверждений с хешами из чужих систем она не спрашивает вовсе: такие измерения
  // останутся заблокированными, и панель рядом назовёт каждое словами оценщика.
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

  function minorToMajor(value) {
    return Number.isSafeInteger(Number(value)) ? String(Number(value) / 100) : '';
  }

  async function assessForm(product) {
    const validation = global.SynthaUiValidation;
    const [styleRead, previous] = await Promise.all([
      api(`/v2/product/styles/${encodeURIComponent(product.id)}`).catch(() => null),
      previousPreparation(product),
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
      selectDef('attributeCoverageConfirmed', text('Атрибуты категории заполнены', 'Category attributes are filled in'), [
        { id: 'yes', name: text('да, подтверждаю', 'yes, I confirm') },
        { id: 'no', name: text('нет', 'no') },
      ], undefined, prep.attributeCoverageConfirmed === false ? 'no' : 'yes'),
    ];
    openForm(text('Оценить готовность', 'Assess readiness'), fields, (values) => {
      const money = (value, label) => Math.round(validation.number(value, label, { min: 0.01 }) * 100);
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
        attributeCoverageConfirmed: values.attributeCoverageConfirmed === 'yes',
      };
      validation.dateRange(preparation.deliveryStart, preparation.deliveryEnd, text('Окно поставки', 'Delivery window'));
      if (!/^[A-Z]{2}$/.test(preparation.countryOfOrigin)) {
        const problem = new Error(text('Страна происхождения: две буквы кода ISO, например TR', 'Country of origin: a two-letter ISO code, for example TR'));
        problem.code = 'COUNTRY_INVALID';
        throw problem;
      }
      return mutate(`/v2/product/style-versions/${encodeURIComponent(product.styleVersionId)}/readiness`, {
        developmentRoute: values.developmentRoute,
        commercialPreparation: preparation,
      });
    });
  }

  function assessAction(product) {
    if (!canAssess(product) || !product.styleVersionId) return null;
    return actionButton(
      product.readinessSnapshotId ? text('Оценить заново', 'Assess again') : text('Оценить готовность', 'Assess readiness'),
      () => assessForm(product),
    );
  }

  global.SynthaProductReadinessAssessment = Object.freeze({ assessForm, assessAction, mediaIdsOf });
})(window);
