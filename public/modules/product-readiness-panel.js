(function initializeProductReadinessPanel(global) {
  'use strict';

  // Готовность модели к продаже: восемнадцать измерений и причина по каждому, которое не сошлось.
  //
  // Рабочее пространство несёт по каждой модели статус готовности, четыре счётчика измерений и
  // идентификатор снимка — и ничего из этого на экране не было. Вкладка «Готовность» показывала
  // статус, процент и список рисков, а на вопрос «чего именно не хватает» не отвечала: сам снимок
  // (`GET /v2/product/readiness/{id}`) в клиенте не читался ни разу.
  //
  // Между тем снимок отвечает на этот вопрос прямо: у каждого заблокированного измерения есть
  // `evidence.reason` — предложение о том, чего недостаёт. Человек упирался в «blocked 8 из 15» и
  // шёл выяснять причину к тому, кто умеет читать журнал.
  //
  // И названия измерений, и причины блокировки переводятся здесь: оба набора замкнуты — восемнадцать
  // кодов и двадцать девять предложений, которые порождает сам оценщик. Переводит их тот модуль,
  // который их показывает, ровно как отказы форм переводит модуль, которому они принадлежат.
  // Предложение, которого в наборе нет, остаётся словами службы — это честнее выдуманного перевода
  // и заметно, если оценщик заговорит по-новому.

  const SNAPSHOTS = { byId: new Map(), loading: new Set() };

  const DIMENSION_NAMES = Object.freeze({
    product_identity: ['Идентичность модели', 'Product identity'],
    category: ['Категория', 'Category'],
    colorways: ['Цветовые варианты', 'Colorways'],
    size_scale: ['Размерная шкала', 'Size scale'],
    sku_matrix: ['Матрица SKU', 'SKU matrix'],
    product_attributes: ['Атрибуты категории', 'Category attributes'],
    bom: ['Спецификация', 'Bill of materials'],
    measurements: ['Таблицы измерений', 'Measurement charts'],
    samples: ['Образцы', 'Samples'],
    tech_pack: ['Технический пакет', 'Tech pack'],
    sourcing: ['Снабжение', 'Sourcing'],
    purchase_or_production_commitment: ['Обязательство на закупку или производство', 'Purchase or production commitment'],
    quality: ['Контроль качества', 'Quality'],
    compliance: ['Соответствие и маркировка', 'Compliance and marking'],
    commercial_media: ['Коммерческие изображения', 'Commercial media'],
    commercial_content: ['Коммерческие тексты', 'Commercial content'],
    commercial_terms: ['Коммерческие условия', 'Commercial terms'],
    availability_delivery: ['Доступность и поставка', 'Availability and delivery'],
  });

  function text(ru, en) { return global.odText ? global.odText(ru, en) : ru; }

  // Причины блокировки — замкнутый набор из двадцати девяти предложений, которые порождает сам
  // оценщик готовности. Поэтому они переводимы точным совпадением, и переводит их тот модуль,
  // который их показывает, — ровно как отказы форм переводит модуль, которому они принадлежат.
  //
  // Неизвестное предложение остаётся словами службы: это честнее выдуманного перевода и заметно,
  // если оценщик заговорит по-новому.
  const REASONS = new Map([
    ['Exact immutable StyleVersion is missing.', 'Нет точной неизменяемой версии модели.'],
    ['Governed category MDM reference is missing.', 'Нет управляемой ссылки на категорию.'],
    ['No immutable Colorway is available for this StyleVersion.', 'У этой версии модели нет ни одного неизменяемого цветового варианта.'],
    ['Every sellable SKU must point to an ordered SizeValue/SizeScaleVersion.', 'Каждый продаваемый SKU должен указывать на упорядоченный размер и версию размерной шкалы.'],
    ['Every Colorway must contain at least one canonical Product SKU.', 'В каждом цветовом варианте должен быть хотя бы один канонический товарный SKU.'],
    ['Governed category attribute coverage has not been confirmed.', 'Заполненность атрибутов категории не подтверждена.'],
    ['Governed category attribute coverage is confirmed but the register holds no governed attribute value for this StyleVersion or its SKUs.', 'Заполненность подтверждена, но в реестре нет ни одного управляемого значения атрибута — ни у версии модели, ни у её SKU.'],
    ['Published BOM is required for every canonical SKU.', 'На каждый канонический SKU нужна опубликованная спецификация.'],
    ['Canonical ProductSku lineage is incomplete; BOM evidence cannot be resolved.', 'Родословная канонических SKU неполна — спецификацию не к чему привязать.'],
    ['BOM is not required for governed READY_GOODS route.', 'На маршруте готовых изделий спецификация не требуется.'],
    ['Every Colorway × SizeScaleVersion requires one published canonical Measurement Chart with a frozen governed unit and coverage of every sellable ProductSizeValue.', 'На каждую пару «цветовой вариант × версия размерной шкалы» нужна одна опубликованная каноническая таблица измерений с замороженной единицей и покрытием всех продаваемых размеров.'],
    ['Approved pre-production sample is required for every canonical SKU.', 'На каждый канонический SKU нужен утверждённый предпроизводственный образец.'],
    ['Canonical ProductSku lineage is incomplete; sample evidence cannot be resolved.', 'Родословная канонических SKU неполна — образец не к чему привязать.'],
    ['Sample approval is recommended but not a hard gate for READY_GOODS.', 'Утверждение образца желательно, но на маршруте готовых изделий не обязательно.'],
    ['Acknowledged Tech Pack is required for every canonical SKU.', 'На каждый канонический SKU нужен технический пакет, подтверждённый получателем.'],
    ['Canonical ProductSku lineage is incomplete; Tech Pack evidence cannot be resolved.', 'Родословная канонических SKU неполна — технический пакет не к чему привязать.'],
    ['Tech Pack is not required for governed READY_GOODS route.', 'На маршруте готовых изделий технический пакет не требуется.'],
    ['Allocated sourcing RFQ is required for every canonical SKU; external evidence cannot replace it for development routes.', 'На каждый канонический SKU нужен размещённый запрос цен; на маршрутах разработки внешнее подтверждение его не заменяет.'],
    ['READY_GOODS requires immutable finished-goods supplier selection evidence.', 'Маршрут готовых изделий требует неизменяемого подтверждения выбора поставщика.'],
    ['Confirmed Production Order is required for every canonical SKU.', 'На каждый канонический SKU нужен подтверждённый производственный заказ.'],
    ['MATERIALS_SEPARATE requires both confirmed Production Order and immutable material-purchase evidence.', 'Маршрут с раздельной закупкой материалов требует и подтверждённого производственного заказа, и неизменяемого подтверждения закупки материалов.'],
    ['READY_GOODS requires immutable Finished Goods Purchase Order evidence.', 'Маршрут готовых изделий требует неизменяемого подтверждения заказа на готовую продукцию.'],
    ['Released Final Quality evidence is required for every canonical SKU; external evidence cannot replace repository Final Quality for development routes.', 'На каждый канонический SKU нужен выпущенный финальный контроль; на маршрутах разработки внешнее подтверждение его не заменяет.'],
    ['READY_GOODS requires immutable incoming-QC release evidence.', 'Маршрут готовых изделий требует неизменяемого подтверждения входного контроля.'],
    ['Russian/EAEU compliance and marking readiness evidence is required.', 'Нужно подтверждение соответствия и готовности маркировки для России и ЕАЭС.'],
    ['Commercial media must select existing immutable media, include a hero image and cover every Colorway.', 'Отобранные изображения должны существовать, включать главное фото и покрывать каждый цветовой вариант.'],
    ['Bilingual commercial title/description/composition and ISO country of origin are required.', 'Нужны название, описание и состав на двух языках и код страны происхождения.'],
    ['Currency, positive wholesale/RRP, MOQ and valid optional MOV/pack ratio are required.', 'Нужны валюта, положительные оптовая и розничная цены, минимальный заказ и — если заданы — верные сумма заказа и ростовка.'],
    ['Valid delivery window and governed availability mode/quantity are required.', 'Нужны верное окно поставки и управляемый режим доступности с количеством.'],
  ]);

  function reasonText(reason) {
    const value = String(reason ?? '').trim();
    if (!value) return '\u2014';
    const russian = REASONS.get(value);
    return russian && global.SynthaI18n?.getLocale?.() !== 'en' ? russian : value;
  }


  function dimensionName(code) {
    const pair = DIMENSION_NAMES[code];
    return pair ? text(pair[0], pair[1]) : code;
  }

  // Снимок читается по требованию и запоминается: он неизменяем, поэтому второй раз спрашивать
  // нечего. Экран рисуется сразу и перерисовывается, когда снимок придёт.
  function snapshot(snapshotId, { onLoaded } = {}) {
    if (!snapshotId) return null;
    if (SNAPSHOTS.byId.has(snapshotId)) return SNAPSHOTS.byId.get(snapshotId);
    if (!SNAPSHOTS.loading.has(snapshotId)) {
      SNAPSHOTS.loading.add(snapshotId);
      queueMicrotask(async () => {
        try {
          SNAPSHOTS.byId.set(snapshotId, await api(`/v2/product/readiness/${encodeURIComponent(snapshotId)}`));
        } catch (problem) {
          // Снимка нет или он не читается — это не повод утверждать, что измерения сошлись.
          SNAPSHOTS.byId.set(snapshotId, null);
        } finally {
          SNAPSHOTS.loading.delete(snapshotId);
          if (typeof onLoaded === 'function') onLoaded();
        }
      });
    }
    return null;
  }

  // Разбор по измерениям. Сначала то, что не сошлось: читают этот список ради него.
  function dimensionsPanel(product, { onLoaded } = {}) {
    if (!product?.readinessSnapshotId) {
      return notice(text(
        'Готовность этой модели ещё не оценивали. Оценка записывает снимок из восемнадцати измерений и говорит по каждому, чего недостаёт.',
        'This style has not been assessed yet. An assessment records a snapshot of eighteen dimensions and says what each one is missing.',
      ));
    }
    const loaded = snapshot(product.readinessSnapshotId, { onLoaded });
    if (!loaded) {
      return notice(text('Читаем снимок готовности…', 'Loading the readiness snapshot…'));
    }
    const dimensions = [...(loaded.dimensions || [])].sort((left, right) => rank(left) - rank(right));
    if (!dimensions.length) return notice(text('Снимок не содержит измерений.', 'The snapshot carries no dimensions.'));
    return odMiniTable(
      [text('Измерение', 'Dimension'), text('Состояние', 'State'), text('Чего недостаёт', 'What is missing')],
      dimensions.map((dimension) => [
        dimensionName(dimension.code),
        statusLabel(dimension.status),
        // Причина — слова самой службы. Переводить их здесь значило бы пересказывать систему за
        // неё; название измерения рядом уже сказано на языке читателя.
        dimension.status === 'blocked' ? reasonText(dimension.evidence?.reason) : '\u2014',
      ]),
    );
  }

  function rank(dimension) {
    if (dimension.status === 'blocked') return 0;
    if (dimension.status === 'ready') return 1;
    return 2;
  }

  // Коммерческая проекция — следующий шаг после готовой оценки, и до сих пор его делал только
  // скрипт: строка `commercial-projection` в клиенте не встречалась вовсе. Публикация коллекции
  // выбирает из проекций, поэтому без этого шага цепочка до байера не замыкалась.
  function projectionAction(product) {
    const caps = global.SynthaUiCapabilities;
    if (!caps?.hasForOrganisation(state.workspace, product.brandId, caps.CAPABILITIES.CATALOG_MANAGE)) return null;
    if (!product.readinessSnapshotId) return null;
    if (product.readinessStatus !== 'ready') {
      return el('p', { className: 'od-action-note', rawText: text(
        'Проекция публикуется из готовой оценки. Пока есть незакрытые измерения — список выше называет каждое.',
        'A projection is published from a ready assessment. Some dimensions are still blocked — the list above names each one.',
      ) });
    }
    return actionButton(
      text('Опубликовать коммерческую проекцию', 'Publish commercial projection'),
      () => publishProjection(product),
      'primary',
    );
  }

  // Номер последней проекции берётся из рабочего пространства, но между чтением и нажатием кто-то
  // мог опубликовать свою. Служба на этот случай отвечает не просто отказом: в `details` она
  // называет действительный номер — и повтор с ним честнее, чем заставлять человека обновлять
  // экран и нажимать снова. Повтор ровно один: если и он разошёлся, значит рядом работают двое, и
  // решать это должен человек, а не цикл.
  async function publishProjection(product) {
    const path = `/v2/product/readiness/${encodeURIComponent(product.readinessSnapshotId)}/commercial-projection`;
    const known = Number(product.commercialProjectionVersionNo ?? 0);
    try {
      return await mutate(path, { expectedLatestVersionNo: Number.isFinite(known) ? known : 0 });
    } catch (problem) {
      const actual = problem?.details?.actualLatestVersionNo;
      if (problem?.code !== 'COMMERCIAL_PROJECTION_CONCURRENCY_CONFLICT' || !Number.isInteger(actual)) throw problem;
      return mutate(path, { expectedLatestVersionNo: actual });
    }
  }

  function reset() {
    SNAPSHOTS.byId.clear();
    SNAPSHOTS.loading.clear();
  }

  global.SynthaProductReadinessPanel = Object.freeze({ dimensionsPanel, projectionAction, dimensionName, reset });
})(window);
