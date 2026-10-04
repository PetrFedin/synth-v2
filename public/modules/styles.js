(function installStyleMasterV6() {
  'use strict';

  const core = window.SynthaStylesCore;
  if (!core) throw new Error('SynthaStylesCore must load before styles.js');
  const nav = OD_V5_GROUPS.flatMap((group) => group.items).find((item) => item.en === 'Styles and colourways' || item.en === 'Styles / SKU');
  if (nav) { nav.view = 'styles'; nav.ru = 'Модели'; nav.en = 'Product Master'; nav.planned = false; }

  function text(ru, en) { return localText(ru, en); }
  function title(product) { return I18N.getLocale?.() === 'en' ? (product.titleEn || product.titleRu || product.styleCode) : (product.titleRu || product.titleEn || product.styleCode); }
  function riskLabel(code) {
    const labels = {
      STYLE_VERSION_MISSING: ['Нет канонической версии модели', 'Canonical StyleVersion is missing'],
      COLORWAYS_MISSING: ['Нет цветовых вариантов', 'No Colorways'],
      PRODUCT_SKUS_MISSING: ['Нет канонических товарных SKU', 'No canonical Product SKUs'],
      READINESS_NOT_ASSESSED: ['Готовность модели не оценена', 'Product Readiness not assessed'],
      READINESS_BLOCKED: ['Готовность модели заблокирована', 'Product Readiness is blocked'],
      COMMERCIAL_PROJECTION_MISSING: ['Нет коммерческой проекции', 'Commercial Projection is missing'],
      LEGACY_BRIDGE_INCOMPLETE: ['Связка с каталогом неполна', 'Legacy SKU migration bridge incomplete'],
    };
    const pair = labels[code] || [code, code];
    return text(pair[0], pair[1]);
  }

  function readiness(item) {
    const node = el('div', { className: 'industrial-readiness', 'data-ods-part': 'progress' });
    const bar = el('progress', { className: 'industrial-readiness-bar' });
    bar.max = 100;
    bar.value = Math.max(0, Math.min(100, item.readinessPercent));
    bar.setAttribute('aria-label', text('Готовность модели', 'Product Readiness'));
    node.append(bar, el('strong', { rawText: item.product.readinessSnapshotId ? `${item.readinessPercent}%` : '—' }));
    return node;
  }

  function readinessBadge(item) {
    if (!item.product.readinessSnapshotId) return statusBadge('not_assessed');
    return statusBadge(item.product.readinessStatus);
  }

  // Governed product dimensions. They are written as MDM-referenced attribute values on the style
  // version and projected by product_master_workspace with both names resolved, so the section reads
  // them without knowing anything about the dictionary they came from.
  function dimension(product, attributeCode) {
    const value = product?.dimensions?.[attributeCode];
    if (!value) return '';
    const name = I18N.getLocale?.() === 'en' ? value.nameEn : value.nameRu;
    return name || value.code || '';
  }
  // The desks that answer for a style. A register in this industry is read by asking "which of these
  // are mine", so every role is a column of its own and therefore filterable like any other.
  const ROLE_LABELS = [
    ['buyer', 'Байер', 'Buyer'],
    ['product_manager', 'Продуктовый менеджер', 'Product manager'],
    ['fabric_manager', 'Менеджер по тканям', 'Fabric manager'],
    ['technologist', 'Технолог', 'Technologist'],
    ['designer', 'Дизайнер', 'Designer'],
    ['constructor', 'Конструктор', 'Patternmaker'],
  ];
  function people(product, role) {
    const list = product?.responsibilities?.[role];
    if (!Array.isArray(list) || !list.length) return '';
    return list.map((person) => person.displayName || person.email || person.userId).join(', ');
  }

  // Every governed attribute the style carries, labelled by the catalogue rather than by a hardcoded
  // list here, so a card can show an attribute nobody thought to write a label for.
  // The lifecycle comes from the server so this screen offers exactly the steps the domain allows and
  // cannot drift from them. It is the same for every style, so it is fetched once.
  const lifecycle = { statuses: [], transitions: null, loading: false, error: '' };
  // The main line of development, in order. The remaining states (on hold, rejected, superseded) are
  // exits from it rather than steps along it, so they are shown as where the style is, not as a rail.
  const LIFECYCLE_MAIN_LINE = [
    'draft', 'in_development', 'sample_review', 'technically_approved', 'sourcing_approved',
    'purchase_or_production_ready', 'compliance_ready', 'commercial_ready', 'active',
  ];
  function ensureLifecycle() {
    if (lifecycle.transitions || lifecycle.loading) return;
    lifecycle.loading = true;
    api('/v2/product/lifecycle')
      .then((result) => { lifecycle.statuses = result.statuses || []; lifecycle.transitions = result.transitions || {}; lifecycle.readinessGated = result.readinessGated || []; })
      .catch((error) => { lifecycle.error = error?.message || ''; })
      .finally(() => { lifecycle.loading = false; renderApp(); });
  }
  function lifecycleRail(product) {
    const rail = el('div', { className: 'od-lifecycle-rail' });
    const currentIndex = LIFECYCLE_MAIN_LINE.indexOf(product.lifecycleStatus);
    LIFECYCLE_MAIN_LINE.forEach((status, index) => {
      const step = el('span', {
        className: `od-lifecycle-step${index === currentIndex ? ' current' : ''}${currentIndex >= 0 && index < currentIndex ? ' passed' : ''}`,
        rawText: statusLabel(status),
      });
      step.title = statusLabel(status);
      rail.append(step);
    });
    return rail;
  }
  function transitionButtons(item) {
    const product = item.product;
    const next = lifecycle.transitions?.[product.lifecycleStatus] || [];
    if (!lifecycle.transitions) return [notice(text('Загрузка жизненного цикла…', 'Loading the lifecycle…'))];
    if (!next.length) {
      return [notice(text(
        `Состояние «${statusLabel(product.lifecycleStatus)}» конечное: дальше модель не переводится.`,
        `"${statusLabel(product.lifecycleStatus)}" is a final state: the style goes no further.`,
      ))];
    }
    const row = el('div', { className: 'od-lifecycle-actions' });
    const gated = Array.isArray(lifecycle.readinessGated) ? lifecycle.readinessGated : [];
    next.forEach((status) => {
      const button = el('button', { className: 'button small', type: 'button', rawText: statusLabel(status) });
      // «Готова к коммерции» и «активна» опираются на оценку готовности: служба откажет, пока
      // последняя оценка не «готова», так что кнопка заранее говорит, чего не хватает.
      if (gated.includes(status) && !(product.readinessSnapshotId && product.readinessStatus === 'ready')) {
        button.disabled = true;
        button.title = product.readinessSnapshotId
          ? text('Последняя оценка готовности заблокирована — закройте незакрытые измерения.', 'The latest readiness assessment is blocked — close the open dimensions.')
          : text('Сначала оцените готовность модели.', 'Assess the style readiness first.');
      }
      button.addEventListener('click', () => runAction(async () => {
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/transition`, {
          expectedVersion: product.styleHeadVersion,
          nextStatus: status,
        });
        await reload();
        renderApp();
        toast(text(`Модель переведена в «${statusLabel(status)}».`, `The style moved to "${statusLabel(status)}".`), 'success');
      }, button));
      row.append(button);
    });
    return [row];
  }

  // A register of garments that shows no garment is hard to read. The image is whatever the read model
  // chose — the hero shot, else the technical sketch — and it has to survive a URI that does not load
  // as well as one that is missing, because a broken-image icon in every row is worse than no image.
  function mediaFor(item) {
    const all = Array.isArray(state.workspace.media) ? state.workspace.media : [];
    return all.find((entry) => entry.styleVersionId === item.product.styleVersionId && !entry.colorwayId) || null;
  }
  function initialsTile(product) {
    const code = String(product.styleCode || '').replace(/[^A-Za-z0-9]/g, '');
    const tile = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tile.setAttribute('class', 'od-thumb od-thumb-empty');
    tile.setAttribute('viewBox', '0 0 48 48');
    tile.setAttribute('width', '48');
    tile.setAttribute('height', '48');
    tile.setAttribute('role', 'img');
    tile.setAttribute('aria-label', text('Изображение не загружено', 'No image'));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0.5'); rect.setAttribute('y', '0.5');
    rect.setAttribute('width', '47'); rect.setAttribute('height', '47');
    rect.setAttribute('rx', '4'); rect.setAttribute('fill', '#F6F7F8'); rect.setAttribute('stroke', '#E1E4E7');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', '24'); label.setAttribute('y', '29');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '13');
    label.setAttribute('fill', '#98A2B3');
    label.textContent = code.slice(0, 3).toUpperCase() || '—';
    tile.append(rect, label);
    return tile;
  }
  function productThumb(item) {
    const media = mediaFor(item);
    if (!media?.uri || !imageSource(media.uri)) return initialsTile(item.product);
    const wrap = el('span', { className: 'od-thumb-wrap' });
    const image = el('img', { className: 'od-thumb', src: imageSource(media.uri), alt: title(item.product), loading: 'lazy' });
    // A stored URI is not a promise that it resolves. When it does not, the row falls back to the
    // same tile an image-less style gets instead of showing a broken picture.
    image.addEventListener('error', () => {
      if (!wrap.isConnected) return;
      wrap.replaceChildren(initialsTile(item.product));
    }, { once: true });
    wrap.append(image);
    return wrap;
  }

  // What the object has been through. Every mutation already recorded who did it and when; until now
  // none of it could be read back, so the audit trail existed only for someone with a SQL prompt.
  const HISTORY = { items: [], loading: false, loadedFor: null };
  // The attribute stream is loaded and filtered on its own, because an auditor narrows it and a
  // reader of the event feed does not.
  const CHANGES = { items: [], loading: false, loadedFor: null, attribute: '', actor: '', from: '', to: '' };
  const HISTORY_LABELS = {
    'ProductStyleCreated': ['\u041c\u043e\u0434\u0435\u043b\u044c \u0441\u043e\u0437\u0434\u0430\u043d\u0430', 'Style created'],
    'ProductStyleChanged': ['\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u043c\u043e\u0434\u0435\u043b\u0438 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u043e', 'Style state changed'],
    'ProductStyleVersionCreated': ['\u0421\u043e\u0437\u0434\u0430\u043d\u0430 \u0432\u0435\u0440\u0441\u0438\u044f \u043c\u043e\u0434\u0435\u043b\u0438', 'Style version created'],
    'ProductColorwayCreated': ['\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430 \u0446\u0432\u0435\u0442\u043e\u043c\u043e\u0434\u0435\u043b\u044c', 'Colourway added'],
    'ProductSkuCreated': ['\u0421\u043e\u0437\u0434\u0430\u043d \u0442\u043e\u0432\u0430\u0440\u043d\u044b\u0439 SKU', 'Product SKU created'],
    'ProductAttributeValueCreated': ['\u0417\u0430\u0434\u0430\u043d \u0430\u0442\u0440\u0438\u0431\u0443\u0442', 'Attribute set'],
    'ProductMediaCreated': ['\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435', 'Image added'],
    'ProductReadinessSnapshotCreated': ['\u041e\u0446\u0435\u043d\u0435\u043d\u0430 \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness assessed'],
    'product.responsibility.assigned': ['\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439', 'A desk was assigned'],
    'product.responsibility.released': ['\u0421\u043d\u044f\u0442 \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439', 'A desk was released'],
    'assortment.placeholder.style-linked': ['\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u043d\u0430 \u043a \u043f\u043b\u0435\u0439\u0441\u0445\u043e\u043b\u0434\u0435\u0440\u0443', 'Linked to a placeholder'],
    'ProductCatalogSkuLinkCreated': ['\u0421\u0432\u044f\u0437\u0430\u043d\u0430 \u0441 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u043e\u043c', 'Linked to the catalogue'],
  };
  function historyLabel(type) {
    const pair = HISTORY_LABELS[type];
    return pair ? text(pair[0], pair[1]) : type;
  }
  async function loadHistory(subjectId) {
    if (!subjectId || HISTORY.loading) return;
    HISTORY.loading = true;
    try {
      const result = await api(`/v2/history/${encodeURIComponent(subjectId)}?limit=50`);
      HISTORY.items = result.items || [];
      HISTORY.loadedFor = subjectId;
    } catch (error) {
      HISTORY.items = [];
      toast(error?.message || I18N.t('common.requestError'), 'error');
    } finally {
      HISTORY.loading = false;
      if (state.view === 'styles') renderApp();
    }
  }
  // What an attribute is called, said the way the interface says it everywhere else. A column name
  // is our word, not the reader's: nobody outside the schema calls it lifecycle_status.
  const ATTRIBUTE_LABELS = {
    lifecycle_status: ['Состояние', 'Lifecycle status'],
    style_code: ['Код модели', 'Style code'],
    title_ru: ['Название (RU)', 'Title (RU)'],
    title_en: ['Название (EN)', 'Title (EN)'],
    description_ru: ['Описание (RU)', 'Description (RU)'],
    description_en: ['Описание (EN)', 'Description (EN)'],
    category_entry_id: ['Категория', 'Category'],
    gender_entry_id: ['Пол', 'Gender'],
    season_entry_id: ['Сезон', 'Season'],
    colorway_code: ['Код цветомодели', 'Colourway code'],
    swatch_hex: ['Образец цвета', 'Swatch'],
    name_ru: ['Название (RU)', 'Name (RU)'],
    name_en: ['Название (EN)', 'Name (EN)'],
    version_no: ['Номер версии', 'Version number'],
    media_role: ['Роль изображения', 'Media role'],
    uri: ['Ссылка', 'Link'],
    payload: ['Дополнительные поля', 'Extra fields'],
  };
  function changedAttributeLabel(name) {
    const pair = ATTRIBUTE_LABELS[name];
    return pair ? text(pair[0], pair[1]) : name;
  }
  // A value as a person reads it. A JSON null is "not set", not the word null; an object is shown
  // compactly rather than as [object Object], which is what a raw template literal would print.
  //
  // Named for what it is rather than the obvious `attributeValue`, which this file already declares
  // further down for the category-attribute panel. Two function declarations of one name in one
  // scope do not collide loudly: the later simply wins, and every caller of the earlier one gets
  // the wrong function. Here that showed as a column of dashes where the old and new values belong.
  // The stored enums are our words. The interface already says them in the reader's language
  // everywhere else, and an audit line reading "draft -> in_development" beside a badge reading
  // «черновик» is two names for one thing.
  const CHANGED_VALUES = {
    draft: ['черновик', 'draft'],
    in_development: ['в разработке', 'in development'],
    approved: ['утверждена', 'approved'],
    published: ['опубликована', 'published'],
    archived: ['в архиве', 'archived'],
    cancelled: ['отменена', 'cancelled'],
    active: ['активна', 'active'],
  };
  function changedValue(raw) {
    if (raw === null || raw === undefined || raw === '') return '—';
    if (typeof raw === 'object') { try { return JSON.stringify(raw); } catch { return '—'; } }
    const value = String(raw);
    if (value.trim() === '') return '—';
    const known = CHANGED_VALUES[value];
    return known ? text(known[0], known[1]) : value;
  }

  async function loadChanges(subjectId) {
    if (!subjectId || CHANGES.loading) return;
    CHANGES.loading = true;
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (CHANGES.attribute) query.set('attribute', CHANGES.attribute);
      if (CHANGES.actor) query.set('actor', CHANGES.actor);
      if (CHANGES.from) query.set('from', CHANGES.from);
      if (CHANGES.to) query.set('to', CHANGES.to);
      const result = await api(`/v2/history/${encodeURIComponent(subjectId)}/attributes?${query}`);
      CHANGES.items = result.items || [];
      CHANGES.loadedFor = subjectId;
    } catch (error) {
      CHANGES.items = [];
      toast(error?.message || I18N.t('common.requestError'), 'error');
    } finally {
      CHANGES.loading = false;
      if (state.view === 'styles') renderApp();
    }
  }

  // Omnidata's change history puts three streams side by side: state, version, and the value of
  // each attribute before and after. The first two are the event feed above; this is the third, and
  // it is the one an audit, a supplier dispute and a post-season review are actually made of.
  function changesPanel(item) {
    const subjectId = item.product.id;
    if (CHANGES.loadedFor !== subjectId && !CHANGES.loading) queueMicrotask(() => { void loadChanges(subjectId); });
    const block = el('div', { className: 'stack' });
    // Not `.od-commandbar`: that class means "this view's registry command bar", and the fidelity
    // layer moves every one of them into the registry column. A filter row that belongs to a panel
    // inside the inspector has to carry its own name or it silently teleports out of the panel.
    const filters = el('div', { className: 'od-change-filters', 'data-od14-component': 'filterbar' });
    const names = [...new Set(CHANGES.items.map((entry) => entry.attribute))].sort();
    const people = [...new Map(CHANGES.items.filter((entry) => entry.actorId)
      .map((entry) => [entry.actorId, entry.actorName || entry.actorEmail || entry.actorId])).entries()];
    filters.append(
      changeFilter(text('Атрибут', 'Attribute'), 'attribute', subjectId,
        [['', text('Все', 'All')], ...names.map((name) => [name, changedAttributeLabel(name)])]),
      changeFilter(text('Кто', 'Who'), 'actor', subjectId,
        [['', text('Все', 'All')], ...people.map(([id, name]) => [id, name])]),
      changeDate(text('С', 'From'), 'from', subjectId),
      changeDate(text('По', 'To'), 'to', subjectId),
    );
    block.append(filters);
    if (CHANGES.loading || CHANGES.loadedFor !== subjectId) {
      block.append(notice(text('Загрузка изменений…', 'Loading the changes…')));
      return block;
    }
    if (!CHANGES.items.length) {
      // An empty list means one of two different things, and saying which is the difference between
      // "nothing happened" and "your filter hid it".
      const filtered = CHANGES.attribute || CHANGES.actor || CHANGES.from || CHANGES.to;
      block.append(notice(filtered
        ? text('По заданным фильтрам изменений нет.', 'No changes match these filters.')
        : text('Значения атрибутов ещё не менялись — модель только создана.', 'No attribute has changed yet — the style has only been created.')));
      return block;
    }
    block.append(odMiniTable(
      [text('Когда', 'When'), text('Атрибут', 'Attribute'), text('Было', 'Was'), text('Стало', 'Became'), text('Кто', 'Who')],
      CHANGES.items.map((entry) => [
        entry.occurredAt ? formatDate(entry.occurredAt) : '—',
        changedAttributeLabel(entry.attribute),
        changedValue(entry.before),
        changedValue(entry.after),
        entry.actorName || entry.actorEmail || '—',
      ]),
    ));
    return block;
  }

  function changeFilter(label, key, subjectId, options) {
    const field = el('label', { className: 'od-filter' });
    field.append(el('span', { rawText: label }));
    const select = el('select', { 'data-od14-component': 'field' });
    options.forEach(([value, caption]) => {
      const option = el('option', { value: String(value), rawText: String(caption) });
      if (String(value) === String(CHANGES[key] || '')) option.selected = true;
      select.append(option);
    });
    select.addEventListener('change', () => { CHANGES[key] = select.value; CHANGES.loadedFor = null; void loadChanges(subjectId); });
    field.append(select);
    return field;
  }

  function changeDate(label, key, subjectId) {
    const field = el('label', { className: 'od-filter' });
    field.append(el('span', { rawText: label }));
    const input = el('input', { type: 'date', value: CHANGES[key] || '', 'data-od14-component': 'field' });
    input.addEventListener('change', () => { CHANGES[key] = input.value; CHANGES.loadedFor = null; void loadChanges(subjectId); });
    field.append(input);
    return field;
  }

  function historyPanel(item) {
    const subjectId = item.product.id;
    if (HISTORY.loadedFor !== subjectId && !HISTORY.loading) queueMicrotask(() => { void loadHistory(subjectId); });
    if (HISTORY.loading || HISTORY.loadedFor !== subjectId) return notice(text('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0438\u0441\u0442\u043e\u0440\u0438\u0438\u2026', 'Loading the history\u2026'));
    if (!HISTORY.items.length) return notice(text('\u041f\u043e \u044d\u0442\u043e\u0439 \u043c\u043e\u0434\u0435\u043b\u0438 \u043f\u043e\u043a\u0430 \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u043e.', 'Nothing has been recorded for this style yet.'));
    return odMiniTable(
      [text('\u041a\u043e\u0433\u0434\u0430', 'When'), text('\u0427\u0442\u043e \u043f\u0440\u043e\u0438\u0437\u043e\u0448\u043b\u043e', 'What happened'), text('\u041a\u0442\u043e', 'Who')],
      HISTORY.items.map((entry) => [
        entry.occurredAt ? formatDate(entry.occurredAt) : '\u2014',
        historyLabel(entry.type),
        entry.actorName || entry.actorEmail || '\u2014',
      ]),
    );
  }

  // Colourways of the style, with the governed colour resolved. The article is derived by the read
  // model from the style code and the colourway code, which is how it is read off a label.
  function colorwaysOf(item) {
    const all = Array.isArray(state.workspace.colorways) ? state.workspace.colorways : [];
    return all.filter((entry) => entry.styleVersionId === item.product.styleVersionId);
  }
  // One swatch for the product, shared from the DOM helpers.
  function swatch(entry) {
    return colourSwatch(entry.swatchHex, entry.swatchHex || text('\u0426\u0432\u0435\u0442 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d', 'No colour set'));
  }
  // Товарный SKU уже полностью проведён через домен/стор/HTTP — вплоть до поля `gtin`
  // (docs/backlog-not-yet-integrated.md, раздел 4: «применимость маркировки, GTIN... поле `gtin` на
  // SKU есть, обвязки нет»). Формы создания SKU не было нигде: таблица цветомоделей показывала
  // только число `skuCount`, без единого кода или возможности завести новый. Детальный список берём
  // из того же полного агрегата стиля, каким уже пользуется квотирование чуть ниже
  // (`GET /v2/product/styles/:id`, `colorways[].skus[]` уже несёт `gtin` и `size.sizeScaleId`).
  const styleSkuAggregateState = window.SynthaStyleSkuAggregateState
    || (window.SynthaStyleSkuAggregateState = { data: {}, loading: {}, failed: {} });

  function loadStyleSkuAggregate(styleId) {
    if (styleSkuAggregateState.data[styleId] || styleSkuAggregateState.loading[styleId] || styleSkuAggregateState.failed[styleId]) return;
    styleSkuAggregateState.loading[styleId] = true;
    api(`/v2/product/styles/${encodeURIComponent(styleId)}`)
      .then((aggregate) => { styleSkuAggregateState.data[styleId] = Array.isArray(aggregate?.colorways) ? aggregate.colorways : []; })
      .catch(() => { styleSkuAggregateState.failed[styleId] = true; })
      .finally(() => { styleSkuAggregateState.loading[styleId] = false; if (state.view === 'styles') renderApp(); });
  }
  function invalidateStyleSkuAggregate(styleId) {
    delete styleSkuAggregateState.data[styleId];
    delete styleSkuAggregateState.failed[styleId];
  }
  function skusOfColorway(item, colorwayId) {
    const colorways = styleSkuAggregateState.data[item.product.id] || [];
    return colorways.find((entry) => entry.id === colorwayId)?.skus || [];
  }

  // Размерная шкала уже полностью читается через `GET /v2/product/size-scales/:id` (используется в
  // редакторе самой шкалы), но форма SKU — первый вызов этого маршрута отсюда. Кешируется по паре
  // id шкалы + номер версии: та же версия, что уже несёт первый SKU этой цветомодели, не обязательно
  // последняя версия шкалы бренда.
  const sizeScaleLibraryState = window.SynthaSizeScaleLibraryState
    || (window.SynthaSizeScaleLibraryState = { data: {}, loading: {}, failed: {} });

  function loadSizeScale(sizeScaleId, versionNo) {
    const key = `${sizeScaleId}@${versionNo}`;
    if (sizeScaleLibraryState.data[key] || sizeScaleLibraryState.loading[key] || sizeScaleLibraryState.failed[key]) return;
    sizeScaleLibraryState.loading[key] = true;
    api(`/v2/product/size-scales/${encodeURIComponent(sizeScaleId)}?versionNo=${encodeURIComponent(versionNo)}`)
      .then((aggregate) => { sizeScaleLibraryState.data[key] = Array.isArray(aggregate?.values) ? aggregate.values : []; })
      .catch(() => { sizeScaleLibraryState.failed[key] = true; })
      .finally(() => { sizeScaleLibraryState.loading[key] = false; if (state.view === 'styles') renderApp(); });
  }

  function addSkuForm(item, colorwayEntry, existingSkus) {
    const product = item.product;
    const reference = existingSkus[0];
    const sizeScaleId = reference.size.sizeScaleId;
    const versionNo = reference.size.sizeScaleVersionNo;
    const key = `${sizeScaleId}@${versionNo}`;
    const values = sizeScaleLibraryState.data[key];
    if (!values) { toast(text('Размерная шкала ещё загружается, попробуйте через момент.', 'The size scale is still loading, try again in a moment.'), 'error'); return; }
    const used = new Set(existingSkus.map((sku) => sku.sizeValueId));
    const options = values
      .filter((value) => !used.has(value.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((value) => [value.id, `${value.sizeCode} · ${I18N.getLocale?.() === 'en' ? value.labelEn : value.labelRu}`]);
    if (!options.length) { toast(text('В этой размерной шкале не осталось свободных размеров.', 'No remaining sizes are left in this size scale.'), 'error'); return; }
    openForm({
      title: text('Добавить SKU', 'Add a SKU'),
      hint: text('Размер — из той же размерной шкалы, что уже несут SKU этой цветомодели.', 'Size — from the same size scale this colourway’s SKUs already use.'),
      fields: [
        field(text('Размер', 'Size'), select('sizeValueId', options)),
        field(text('Код SKU', 'SKU code'), input('skuCode', 'text', { required: true, maxlength: '64', placeholder: `${product.styleCode}-${colorwayEntry.colorwayCode}-...` })),
        field('GTIN', input('gtin', 'text', { maxlength: '14', pattern: '([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})', title: text('8, 12, 13 или 14 цифр', '8, 12, 13 or 14 digits') })),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values2) => {
        await mutate('/v2/product/skus', {
          styleVersionId: product.styleVersionId,
          colorwayId: colorwayEntry.id,
          sizeValueId: values2.sizeValueId,
          skuCode: values2.skuCode.trim().toUpperCase(),
          gtin: values2.gtin?.trim() || undefined,
        });
        invalidateStyleSkuAggregate(product.id);
        toast(text('SKU добавлен.', 'The SKU was added.'), 'success');
      },
    });
  }

  function skuCell(item, entry) {
    const skus = skusOfColorway(item, entry.id);
    const wrap = el('div', { className: 'od-inline-actions' });
    if (skus.length) {
      const list = el('div', {});
      skus.forEach((sku) => {
        const line = el('div', { className: 'od-inline-actions' });
        line.append(el('span', { rawText: `${sku.skuCode} · ${sku.size?.code || '—'}${sku.gtin ? ` · GTIN ${sku.gtin}` : ''}${sku.legacyCatalogSku ? ` · ${text('витрина', 'catalog')}: ${sku.legacyCatalogSku}` : ''}` }));
        // Без связи с витринным SKU измерения спецификации, образцов и техпакета в готовности не
        // сходятся: они читают таблицы по каталожному коду. Связь выбирается из витринных SKU бренда.
        const forms = chainForms();
        if (!sku.legacyCatalogSku && forms?.mayManageProducts(item.product.brandId)) {
          const link = el('button', { className: 'button small', type: 'button', rawText: text('Связать с витринным SKU', 'Link to a catalog SKU') });
          link.addEventListener('click', () => forms.linkCatalogSkuForm({
            product: item.product,
            sku,
            onSaved: () => invalidateStyleSkuAggregate(item.product.id),
          }).catch((problem) => toast(styleErrorMessage(problem), 'error')));
          line.append(link);
        }
        list.append(line);
      });
      wrap.append(list);
      loadSizeScale(skus[0].size.sizeScaleId, skus[0].size.sizeScaleVersionNo);
    } else {
      wrap.append(el('span', { rawText: String(entry.skuCount ?? 0) }));
    }
    const caps = window.SynthaUiCapabilities;
    const manage = caps?.hasForOrganisation(state.workspace, item.product.brandId, caps.CAPABILITIES.PRODUCT_MANAGE);
    // Размер нового SKU резолвится по размерной шкале уже существующего SKU этой цветомодели —
    // без единого SKU взять эту шкалу неоткуда, поэтому кнопка появляется только когда есть за что
    // зацепиться.
    const measurementForm = window.SynthaCanonicalMeasurementForm;
    if (skus.length && measurementForm?.mayManage(item.product.brandId)) {
      const chart = el('button', { className: 'button small', type: 'button', rawText: text('Каноническая таблица мер', 'Canonical measurement chart') });
      chart.addEventListener('click', () => measurementForm.open({ product: item.product, colorwayId: entry.id })
        .catch((problem) => toast(styleErrorMessage(problem), 'error')));
      wrap.append(chart);
    }
    if (manage && skus.length) {
      const button = el('button', { className: 'button small', type: 'button', rawText: text('Добавить SKU', 'Add a SKU') });
      button.addEventListener('click', () => addSkuForm(item, entry, skus));
      wrap.append(button);
    } else if (manage && !skus.length && styleSkuAggregateState.data[item.product.id]) {
      // Первый SKU цветомодели: шкалу взять не у чего, поэтому она выбирается из шкал бренда, и SKU
      // заводятся по всем её размерам. Кнопка ждёт загрузки состава, чтобы не предлагать шкалу
      // цветомодели, у которой SKU уже есть, но ещё не подгрузились.
      const bind = el('button', { className: 'button small', type: 'button', rawText: text('Привязать размерную шкалу', 'Bind a size scale') });
      bind.addEventListener('click', () => chainForms()?.bindSizeScaleForm({
        product: item.product,
        colorway: { id: entry.id, colorwayCode: entry.colorwayCode },
        onSaved: () => invalidateStyleSkuAggregate(item.product.id),
      }).catch((problem) => toast(styleErrorMessage(problem), 'error')));
      wrap.append(bind);
    }
    return wrap;
  }

  function colorwayPanel(item) {
    const rows = colorwaysOf(item);
    if (!rows.length) return notice(text('У модели пока нет цветомоделей.', 'This style has no colourways yet.'));
    loadStyleSkuAggregate(item.product.id);
    // The inspector is 360px wide. Six columns (swatch, name, Pantone, family, article, SKU) made a 616px
    // table behind a horizontal scrollbar, and the SKU list with its buttons, the part that tells two
    // rows apart, was the part cut off. One card per colourway: swatch and name with the descriptive
    // fields under it, then the SKUs and their actions across the full width.
    const english = I18N.getLocale?.() === 'en';
    const list = el('div', { className: 'od-colourway-list' });
    rows.forEach((entry) => {
      const family = (english ? entry.familyNameEn : entry.familyNameRu) || '';
      const detail = [entry.pantone, family, entry.article].filter(Boolean).join(' \u00b7 ');
      const head = el('div', { className: 'od-colourway-head' });
      const name = el('div', { className: 'od-colourway-name' });
      name.append(el('strong', { rawText: (english ? (entry.nameEn || entry.nameRu) : (entry.nameRu || entry.nameEn)) || '\u2014' }));
      if (detail) name.append(el('small', { className: 'muted', rawText: detail }));
      head.append(swatch(entry), name);
      const card = el('article', { className: 'od-colourway-card' });
      card.append(head, skuCell(item, entry));
      list.append(card);
    });
    return list;
  }

  function dimensionLabel(product) {
    return (I18N.getLocale?.() === 'en' ? product.categoryNameEn : product.categoryNameRu) || product.categoryCode || '—';
  }
  function attributeValue(item) {
    const named = I18N.getLocale?.() === 'en' ? item.nameEn : item.nameRu;
    if (named) return named;
    // A boolean false is an answer, not a missing value: showing it as a dash said "not filled in"
    // about a field that said "no".
    if (typeof item.value === 'boolean') return item.value ? text('Да', 'Yes') : text('Нет', 'No');
    if (Array.isArray(item.value)) return item.value.length ? item.value.join(', ') : '—';
    if (item.value === null || item.value === undefined || item.value === '') return '—';
    return String(item.value);
  }
  function categoryAttributes(product) {
    const values = product?.dimensions || {};
    return Object.entries(values).map(([code, item]) => ({
      code,
      label: (I18N.getLocale?.() === 'en' ? item.labelEn : item.labelRu) || code,
      value: attributeValue(item),
    })).sort((left, right) => left.label.localeCompare(right.label));
  }

  function gender(product) {
    const name = I18N.getLocale?.() === 'en' ? product.genderNameEn : product.genderNameRu;
    return name || product.genderCode || '';
  }

  function projectionBadge(item) {
    return item.projected ? statusBadge('published') : statusBadge('not_published');
  }


  // ---------------------------------------------------------------------------------------------
  // Writing.
  //
  // This register is the core of the product model and until now it could only be read. The card
  // announced its own gaps — «Ответственные не назначены», «Заполнено 0 из 40 полей» — with nothing
  // to press: every command existed in the API and none of them had a control. A screen that states
  // a gap and offers no way to close it is worse than one that says nothing, because it teaches the
  // reader that the gap is permanent.
  //
  // Each form below writes through the command the domain already exposes, so the rules that refuse
  // a bad value are the same ones a script would meet.

  function field(labelText, control) {
    const label = el('label', { className: 'od-form-field' });
    label.append(el('span', { rawText: labelText }), control);
    return label;
  }

  function input(name, type, attrs = {}) {
    const node = el('input', { name, type, ...attrs });
    return node;
  }

  function select(name, options, attrs = {}) {
    const node = el('select', { name, ...attrs });
    options.forEach(([value, label]) => node.append(el('option', { value, rawText: label })));
    return node;
  }

  // One dialog shape for this section, so filling a field, adding a colourway and assigning a desk
  // all feel like the same act. It borrows the geometry the rest of the application already uses.
  function openForm({ title: heading, hint, fields, submitLabel, onSubmit }) {
    const modal = el('dialog', { className: 'od-form-dialog' });
    const form = el('form', { method: 'dialog' });
    const head = el('header');
    head.append(el('h2', { rawText: heading }));
    if (hint) head.append(el('p', { className: 'muted', rawText: hint }));
    // The design system lays a dialog's form out as a two-column grid and forces every direct <div>
    // to span both columns as a flex row. Wrapping the fields in a grid of my own therefore made one
    // flex row of them and squeezed a number field to 147 pixels. The fields are direct children of
    // the form instead, which is the shape the rest of the application's dialogs already have.
    const error = el('div', { className: 'od-form-error', hidden: true });
    const footer = el('footer');
    const cancel = el('button', { className: 'button secondary', type: 'button', rawText: I18N.t('common.cancel') });
    const submit = el('button', { className: 'button primary', type: 'submit', rawText: submitLabel });
    cancel.addEventListener('click', () => modal.close());
    footer.append(cancel, submit);
    form.append(head, ...fields, error, footer);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      error.hidden = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(form).entries()));
        modal.close();
        await reload();
        renderApp();
      } catch (problem) {
        // The refusal belongs beside the field that caused it, not in a toast that has moved on by
        // the time the reader looks up.
        error.textContent = styleErrorMessage(problem);
        error.hidden = false;
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });
    modal.addEventListener('close', () => modal.remove(), { once: true });
    modal.append(form);
    document.body.append(modal);
    modal.showModal();
    return modal;
  }

  const STYLE_ERRORS = {
    PRODUCT_RESPONSIBILITY_NOT_A_MEMBER: ['Ответственным может быть только сотрудник бренда, которому принадлежит модель.', 'Only a member of the brand that owns the style can take a desk.'],
    PRODUCT_RESPONSIBILITY_ALREADY_ASSIGNED: ['Этот человек уже отвечает за этот стол.', 'This person already holds that desk.'],
    PRODUCT_ATTRIBUTE_NOT_IN_CATALOGUE: ['Такого поля нет в каталоге атрибутов.', 'That field is not in the attribute catalogue.'],
    PRODUCT_ATTRIBUTE_CATEGORY_MISMATCH: ['Это поле не относится к категории модели.', 'That field does not belong to this style\u2019s category.'],
    PRODUCT_COLORWAY_ALREADY_EXISTS: ['Такой код цветомодели уже есть у этой версии.', 'That colourway code already exists on this version.'],
    PRODUCT_COLORWAY_BATCH_CODE_DUPLICATE: ['Код цвета повторяется в списке — каждая строка нужна со своим кодом.', 'A colour code repeats in the list — each row needs its own code.'],
    PRODUCT_COLORWAY_BATCH_SIZE_INVALID: ['Заполните хотя бы одну строку.', 'Fill in at least one row.'],
    PRODUCT_IDENTITY_SNAPSHOT_IMMUTABLE: ['Значение уже зафиксировано и не меняется — заведите новую версию модели.', 'The value is frozen and cannot be changed \u2014 open a new style version.'],
    PRODUCT_STYLE_REFERENCE_POSITION_CONFLICT: ['Такая позиция на доске референсов уже занята.', 'That position on the reference board is already taken.'],
    PRODUCT_STYLE_REFERENCE_IMAGE_URI_INVALID: ['Укажите ссылку на изображение.', 'Enter an image link.'],
    PRODUCT_STYLE_REFERENCE_SORT_ORDER_INVALID: ['Порядок должен быть неотрицательным числом.', 'Order must be a non-negative number.'],
  };
  function styleErrorMessage(problem) {
    const pair = STYLE_ERRORS[String(problem?.code || '')];
    return pair ? text(pair[0], pair[1]) : (problem?.message || I18N.t('common.requestError'));
  }

  // Состав бренда. Рабочее пространство несёт только членство самого читателя, поэтому форма
  // назначения могла назвать единственного коллегу — его самого, — да ещё сгенерированным
  // идентификатором, потому что больше в членстве ничего нет.
  //
  // Загрузчик жил здесь, пока спрашивал о составе один экран. Теперь спрашивают два (матрица
  // ролей — тот же вопрос), и он вынесен в `brand-roster.js`: второй кэш того же ответа означал бы
  // два состояния загрузки и два способа разойтись.
  function brandRoster(brandId) {
    const shared = window.SynthaBrandRoster;
    if (!shared) return null;
    return shared.roster(brandId, { onLoaded: () => { if (state.view === 'styles') renderApp(); } });
  }
  function personName(member) { return window.SynthaBrandRoster?.personName(member) ?? (member.displayName || member.email || member.userId); }

  function assignDesk(product, role, roleLabel) {
    const roster = brandRoster(product.brandId);
    if (!roster) {
      toast(text('Загружаем состав бренда…', 'Loading the brand roster…'));
      return;
    }
    if (!roster.length) {
      toast(text('В бренде нет активных участников, которым можно передать стол.', 'The brand has no active members to hand the desk to.'), 'error');
      return;
    }
    const person = select('userId', roster.map((member) => [member.userId, `${personName(member)} · ${statusLabel(member.role)}`]), { required: true });
    openForm({
      title: text(`Назначить: ${roleLabel}`, `Assign: ${roleLabel}`),
      hint: text('Стол закрепляется за сотрудником бренда, которому принадлежит модель.', 'A desk is held by a member of the brand that owns the style.'),
      fields: [field(text('Кто', 'Who'), person)],
      submitLabel: text('Назначить', 'Assign'),
      onSubmit: async (values) => {
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/responsibilities`, { role, userId: values.userId });
        toast(text('Стол закреплён.', 'The desk is assigned.'), 'success');
      },
    });
  }

  async function releaseDesk(person, roleLabel) {
    const accepted = await confirmAction({
      title: text('Освободить стол', 'Release desk'),
      question: text(
        `${person.displayName || person.email || person.userId} перестанет отвечать за «${roleLabel}».`,
        `${person.displayName || person.email || person.userId} will no longer answer for "${roleLabel}".`,
      ),
      confirmLabel: text('Освободить', 'Release'),
      danger: true,
    });
    if (!accepted) return;
    try {
      await mutate(`/v2/product/responsibilities/${encodeURIComponent(person.id)}/release`, {});
      await reload();
      renderApp();
      toast(text('Стол освобождён.', 'The desk is free.'), 'success');
    } catch (problem) { toast(styleErrorMessage(problem), 'error'); }
  }

  function teamPanel(product) {
    // Warm the roster while the tab is open, so pressing «Назначить» opens a filled form rather than
    // asking the reader to press it twice.
    brandRoster(product.brandId);
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    const list = el('div', { className: 'od-desk-list' });
    ROLE_LABELS.forEach(([role, ru, en]) => {
      const roleLabel = text(ru, en);
      const row = el('div', { className: 'od-desk-row' });
      const held = Array.isArray(product.responsibilities?.[role]) ? product.responsibilities[role] : [];
      const names = el('div', { className: 'od-desk-people' });
      names.append(el('strong', { rawText: roleLabel }));
      if (held.length) {
        held.forEach((person) => {
          const chip = el('span', { className: 'od-desk-person' });
          chip.append(el('span', { rawText: person.displayName || person.email || person.userId }));
          if (manage && person.id) {
            const drop = el('button', { className: 'od-desk-release', type: 'button', title: text('Освободить стол', 'Release desk'), rawText: '\u00d7' });
            drop.addEventListener('click', () => { void releaseDesk(person, roleLabel); });
            chip.append(drop);
          }
          names.append(chip);
        });
      } else names.append(el('span', { className: 'muted', rawText: text('стол пуст', 'no one yet') }));
      row.append(names);
      if (manage) {
        const assign = el('button', { className: 'button small', type: 'button', rawText: text('Назначить', 'Assign') });
        assign.addEventListener('click', () => assignDesk(product, role, roleLabel));
        row.append(assign);
      }
      list.append(row);
    });
    return list;
  }

  // Справочник цветов (`colour.colour`): форма заведения цветомодели всегда предлагала только
  // свободный ввод кода/названия, хотя домен принимает управляемую ссылку на справочник (`colorRef`)
  // с самого начала пакетного заведения (`feat/bulk-colorway-creation`) — она просто не была ничем
  // заполнена ни в одиночной форме, ни в пакетной. Тот же приём чтения справочника, что уже несёт
  // доска технологических узлов чуть ниже — `GET /v2/libraries/colour.colour/entries`, глобальный
  // кеш на уровне окна, список один раз на восемь governed-записей.
  const colourLibraryState = window.SynthaColourLibraryState
    || (window.SynthaColourLibraryState = { items: null, loading: false, failed: false });

  function loadColourLibrary() {
    if (colourLibraryState.items || colourLibraryState.loading || colourLibraryState.failed) return;
    colourLibraryState.loading = true;
    api('/v2/libraries/colour.colour/entries?limit=200')
      .then((page) => { colourLibraryState.items = Array.isArray(page?.items) ? page.items : []; })
      .catch(() => { colourLibraryState.failed = true; })
      .finally(() => { colourLibraryState.loading = false; if (state.view === 'styles') renderApp(); });
  }
  function colourRefOptions() {
    const library = colourLibraryState.items || [];
    return [
      ['', text('— свободный ввод —', '— free text —')],
      ...library.map((entry) => [`${entry.id}|${entry.version}`, `${entry.code} · ${I18N.getLocale?.() === 'en' ? entry.nameEn : entry.nameRu}${entry.attributes?.pantone ? ` · Pantone ${entry.attributes.pantone}` : ''}`]),
    ];
  }
  // Форма не реактивна — поля строятся один раз как обычные DOM-узлы, а не перерисовываются из
  // состояния, — поэтому «выбор подставляет название» сделан прямым `change`-слушателем на сам
  // `<select>`, трогающим соседние узлы по ссылке, а не декларативным связыванием.
  function colourRefSelect(name, onSelect) {
    const control = select(name, colourRefOptions());
    control.addEventListener('change', () => {
      if (!control.value) return;
      const [entryId] = control.value.split('|');
      const entry = (colourLibraryState.items || []).find((candidate) => candidate.id === entryId);
      if (entry) onSelect(entry);
    });
    return control;
  }
  function colorRefFromValue(rawValue) {
    if (!rawValue) return {};
    const [entryId, version] = rawValue.split('|');
    return { colorRef: { entryId, version: Number(version) } };
  }

  function addColorway(item) {
    const product = item.product;
    if (!product.styleVersionId) {
      toast(text('У модели ещё нет версии, к которой можно добавить цвет.', 'This style has no version to add a colour to yet.'), 'error');
      return;
    }
    loadColourLibrary();
    const nameRuField = input('nameRu', 'text', { required: true, minlength: '2', maxlength: '160' });
    const nameEnField = input('nameEn', 'text', { required: true, minlength: '2', maxlength: '160' });
    const swatchField = input('swatchHex', 'color', { value: '#1d2939' });
    const colourField = colourRefSelect('colourRef', (entry) => {
      nameRuField.value = entry.nameRu;
      nameEnField.value = entry.nameEn;
      if (entry.attributes?.hex) swatchField.value = entry.attributes.hex;
    });
    openForm({
      title: text('Добавить цветомодель', 'Add a colourway'),
      hint: text('Артикул цветомодели складывается из кода модели и кода цвета. Цвет из справочника подставляет название и образец — их можно поправить вручную.', 'The colourway article is the style code joined to the colour code. A library colour fills in the name and swatch, which can still be edited by hand.'),
      fields: [
        field(text('Код цвета', 'Colour code'), input('colorwayCode', 'text', { required: true, maxlength: '32', pattern: '[A-Za-z0-9._-]{2,32}' })),
        field(text('Цвет из справочника', 'Governed colour'), colourField),
        field(text('Название RU', 'Name RU'), nameRuField),
        field(text('Название EN', 'Name EN'), nameEnField),
        field(text('Образец цвета', 'Swatch'), swatchField),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        await mutate(`/v2/product/style-versions/${encodeURIComponent(product.styleVersionId)}/colorways`, {
          colorwayCode: values.colorwayCode.trim().toUpperCase(),
          nameRu: values.nameRu.trim(),
          nameEn: values.nameEn.trim(),
          swatchHex: values.swatchHex,
          ...colorRefFromValue(values.colourRef),
        });
        toast(text('Цветомодель добавлена.', 'The colourway is added.'), 'success');
      },
    });
  }

  // Несколько цветов одной семьи ткани заводились по одной форме на цвет. Строки, оставленные
  // пустыми (без кода цвета), просто пропускаются — форма не требует заполнять все шесть разом.
  const COLORWAY_BATCH_ROWS = 6;
  function addColorwaysBatch(item) {
    const product = item.product;
    if (!product.styleVersionId) {
      toast(text('У модели ещё нет версии, к которой можно добавить цвет.', 'This style has no version to add a colour to yet.'), 'error');
      return;
    }
    loadColourLibrary();
    const fields = [];
    for (let row = 1; row <= COLORWAY_BATCH_ROWS; row += 1) {
      const nameRuField = input(`nameRu${row}`, 'text', { minlength: '2', maxlength: '160' });
      const nameEnField = input(`nameEn${row}`, 'text', { minlength: '2', maxlength: '160' });
      const swatchField = input(`swatchHex${row}`, 'color', { value: '#1d2939' });
      const colourField = colourRefSelect(`colourRef${row}`, (entry) => {
        nameRuField.value = entry.nameRu;
        nameEnField.value = entry.nameEn;
        if (entry.attributes?.hex) swatchField.value = entry.attributes.hex;
      });
      fields.push(field(text(`${row}. Код цвета`, `${row}. Colour code`), input(`colorwayCode${row}`, 'text', { maxlength: '32', pattern: '[A-Za-z0-9._-]{2,32}' })));
      fields.push(field(text('Цвет из справочника', 'Governed colour'), colourField));
      fields.push(field(text('Название RU', 'Name RU'), nameRuField));
      fields.push(field(text('Название EN', 'Name EN'), nameEnField));
      fields.push(field(text('Образец цвета', 'Swatch'), swatchField));
    }
    openForm({
      title: text('Добавить несколько цветомоделей', 'Add several colourways'),
      hint: text('Заполните столько строк, сколько нужно — пустые строки без кода цвета пропускаются.', 'Fill in as many rows as you need — a row with no colour code is skipped.'),
      fields,
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        const items = [];
        for (let row = 1; row <= COLORWAY_BATCH_ROWS; row += 1) {
          const colorwayCode = (values[`colorwayCode${row}`] || '').trim();
          if (!colorwayCode) continue;
          const nameRu = (values[`nameRu${row}`] || '').trim();
          const nameEn = (values[`nameEn${row}`] || '').trim();
          if (!nameRu || !nameEn) { throw new Error(text(`Строка ${row}: заполните название на обоих языках.`, `Row ${row}: fill in the name in both languages.`)); }
          items.push({ colorwayCode: colorwayCode.toUpperCase(), nameRu, nameEn, swatchHex: values[`swatchHex${row}`], ...colorRefFromValue(values[`colourRef${row}`]) });
        }
        if (!items.length) throw Object.assign(new Error(), { code: 'PRODUCT_COLORWAY_BATCH_SIZE_INVALID' });
        const created = await mutate(`/v2/product/style-versions/${encodeURIComponent(product.styleVersionId)}/colorways/batch`, { items });
        toast(text(`Добавлено цветомоделей: ${created.length}.`, `${created.length} colourway(s) added.`), 'success');
      },
    });
  }

  function addMedia(item) {
    const product = item.product;
    const colorways = colorwaysOf(item);
    openForm({
      title: text('Добавить изображение', 'Add an image'),
      hint: text('Ссылка на изображение. Изображение без цветомодели становится общим для всей версии.', 'A link to the image. One with no colourway belongs to the whole version.'),
      fields: [
        field(text('Цветомодель', 'Colourway'), select('colorwayId', [['', text('— вся версия —', '\u2014 the whole version \u2014')], ...colorways.map((entry) => [entry.id, `${entry.colorwayCode} · ${entry.nameRu || entry.nameEn}`])])),
        field(text('Ссылка', 'Link'), input('uri', 'url', { required: true, maxlength: '2000', placeholder: 'https://…' })),
        // Роли берутся из тех, что знает домен: `hero, gallery, detail, swatch, technical,
        // design_sketch, tech_pack_thumbnail, pattern, die_line, video, document` (PRODUCT_MEDIA_ROLES).
        // `video` и `document` здесь не предлагаются намеренно: форма добавляет изображение и сама
        // отправляет mediaType: 'image'.
        field(text('Роль', 'Role'), select('mediaRole', [['hero', text('Основное фото', 'Hero shot')], ['gallery', text('Галерея', 'Gallery')], ['detail', text('Деталь', 'Detail')], ['swatch', text('Образец цвета', 'Swatch')], ['technical', text('Технический эскиз', 'Technical sketch')], ['design_sketch', text('Дизайнерский эскиз', 'Design sketch')], ['tech_pack_thumbnail', text('Эскиз Tech Pack', 'Tech pack thumbnail')], ['pattern', text('Лекало', 'Pattern')], ['die_line', text('Контур детали', 'Die line')]])),
        field(text('Порядок', 'Order'), input('sortOrder', 'number', { required: true, min: '1', max: '999', value: String(mediaCountFor(item) + 1) })),
        // Название вида попадает только в печатный техпак (раздел «Изделие и поставщик»,
        // docs/backlog-not-yet-integrated.md, раздел J) — для фото оно просто ни на что не влияет,
        // поэтому поле необязательно и не привязано к конкретной роли.
        field(text('Название вида (для техпака)', 'View label (for the tech pack)'), input('viewLabel', 'text', { maxlength: '160', placeholder: text('например, «Внешний вид рубашки»', 'e.g. "Front view"') })),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        const viewLabel = values.viewLabel.trim();
        await mutate(`/v2/product/style-versions/${encodeURIComponent(product.styleVersionId)}/media`, {
          ...(values.colorwayId ? { colorwayId: values.colorwayId } : {}),
          mediaType: 'image',
          mediaRole: values.mediaRole,
          uri: values.uri.trim(),
          sortOrder: Number(values.sortOrder),
          ...(viewLabel ? { payload: { viewLabel } } : {}),
        });
        toast(text('Изображение добавлено.', 'The image is added.'), 'success');
      },
    });
  }

  function mediaCountFor(item) {
    const all = Array.isArray(state.workspace.media) ? state.workspace.media : [];
    return all.filter((entry) => entry.styleVersionId === item.product.styleVersionId).length;
  }

  // The expected field set for the style's category, fetched when the tab is opened. The register
  // knew only how many fields were expected, which is a number nobody can fill in.
  const ATTR = { byVersion: new Map(), loading: new Set() };
  function categoryCatalogue(styleVersionId) {
    if (!styleVersionId) return null;
    if (ATTR.byVersion.has(styleVersionId)) return ATTR.byVersion.get(styleVersionId);
    if (!ATTR.loading.has(styleVersionId)) {
      ATTR.loading.add(styleVersionId);
      queueMicrotask(async () => {
        try {
          const loaded = await api(`/v2/product/style-versions/${encodeURIComponent(styleVersionId)}/category-attributes`);
          ATTR.byVersion.set(styleVersionId, loaded);
        } catch (problem) {
          ATTR.byVersion.set(styleVersionId, { items: [], catalogVersion: null, error: styleErrorMessage(problem) });
        } finally {
          ATTR.loading.delete(styleVersionId);
          if (state.view === 'styles') renderApp();
        }
      });
    }
    return null;
  }

  function fillAttribute(product, definition, catalogVersion) {
    const dictionary = definition.dictionary;
    const control = definition.dataType === 'number' || definition.dataType === 'quantity'
      ? input('value', 'number', { required: true, step: 'any' })
      : input('value', 'text', { required: true, maxlength: '400' });
    openForm({
      title: text(`Заполнить: ${definition.nameRu}`, `Fill in: ${definition.nameEn}`),
      hint: dictionary
        ? text(`Значение берётся из справочника «${dictionary}».`, `The value comes from the "${dictionary}" dictionary.`)
        : text('Значение фиксируется вместе с версией модели и после этого не меняется.', 'The value is frozen with the style version and does not change afterwards.'),
      fields: [field(text(definition.nameRu, definition.nameEn), control)],
      submitLabel: text('Сохранить', 'Save'),
      onSubmit: async (values) => {
        const raw = String(values.value).trim();
        const numeric = definition.dataType === 'number' || definition.dataType === 'quantity';
        await mutate('/v2/product/attributes', {
          ownerType: 'style_version',
          ownerId: product.styleVersionId,
          attributeCode: definition.code,
          attributeCatalogVersion: catalogVersion,
          value: numeric ? Number(raw) : raw,
        });
        ATTR.byVersion.delete(product.styleVersionId);
        toast(text('Поле заполнено.', 'The field is filled.'), 'success');
      },
    });
  }

  function attributePanel(item) {
    const product = item.product;
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    const catalogue = categoryCatalogue(product.styleVersionId);
    if (!product.categoryEntryId) {
      return notice(text('У модели не выбрана категория, поэтому набор полей ещё не определён.', 'This style has no category yet, so the field set is not decided.'), 'warning');
    }
    if (!catalogue) return notice(text('Загрузка полей категории…', 'Loading the category fields…'));
    if (catalogue.error) return notice(catalogue.error, 'error');
    const items = catalogue.items || [];
    if (!items.length) return notice(text('Категория не требует дополнительных полей.', 'This category expects no extra fields.'));
    const filled = items.filter((entry) => entry.value !== null && entry.value !== undefined);
    const list = el('div', { className: 'od-attribute-list' });
    items.forEach((definition) => {
      const row = el('div', { className: `od-attribute-row ${definition.value === null || definition.value === undefined ? 'empty' : ''}`.trim() });
      const name = el('div', { className: 'od-attribute-name' });
      // Имя поля берётся из каталога; если сервер его не прислал, из словаря интерфейса по коду, и
      // только в последнюю очередь — сам код. Технический код (`common.net_weight`) читателю не
      // адресован: он остаётся подсказкой при наведении, а не подписью под названием.
      const named = I18N.getLocale?.() === 'en' ? definition.nameEn : definition.nameRu;
      const dictionary = I18N.t(definition.code);
      name.append(el('strong', { rawText: named || (dictionary !== definition.code ? dictionary : definition.code) }));
      name.title = definition.code;
      const value = el('div', { className: 'od-attribute-value' });
      const shown = definition.entryNameRu || definition.entryNameEn
        ? (I18N.getLocale?.() === 'en' ? definition.entryNameEn : definition.entryNameRu)
        : formatAttributeValue(definition.value);
      const structured = !(definition.entryNameRu || definition.entryNameEn) ? attributeParts(definition.value) : [];
      if (structured.length) {
        structured.forEach(([label, content]) => {
          const part = el('div', { className: 'od-attribute-part' });
          part.append(el('span', { className: 'od-attribute-part-label', rawText: label }), el('span', { rawText: content }));
          value.append(part);
        });
      } else {
        value.append(el('span', { rawText: shown ?? '\u2014' }));
      }
      row.append(name, value);
      if (manage && (definition.value === null || definition.value === undefined)) {
        const fill = el('button', { className: 'button small', type: 'button', rawText: text('Заполнить', 'Fill in') });
        fill.addEventListener('click', () => fillAttribute(product, definition, catalogue.catalogVersion));
        row.append(fill);
      }
      list.append(row);
    });
    const summary = notice(text(
      `Заполнено ${filled.length} из ${items.length} полей, которые предполагает категория «${dimensionLabel(product)}».`,
      `${filled.length} of ${items.length} fields expected by the ${dimensionLabel(product)} category are filled.`,
    ), filled.length === items.length ? 'success' : filled.length ? '' : 'warning');
    const wrap = document.createDocumentFragment();
    wrap.append(summary, list);
    return wrap;
  }

  // Структурное значение атрибута читается как таблица «параметр — значение», а не как дамп ключей:
  // подписи полей, значений и единиц живут в словаре рантайма (`attr.part.*`, `attr.value.*`,
  // `attr.unit.*`), логические значения — «да/нет». Чего в словаре нет, печатается читаемым словом.
  function attributeWord(prefix, key) {
    const wanted = `${prefix}${key}`;
    const translated = I18N.t(wanted);
    return translated === wanted ? null : translated;
  }
  function attributePartLabel(key) {
    const known = attributeWord('attr.part.', key);
    if (known) return known;
    const words = String(key).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(key);
  }
  function attributeScalar(key, value) {
    if (value === true) return I18N.t('attr.yes');
    if (value === false) return I18N.t('attr.no');
    if (typeof value === 'number') {
      const unit = attributeWord('attr.unit.', key);
      const number = I18N.formatNumber(value, { maximumFractionDigits: 6 });
      return unit ? `${number}\u00a0${unit}` : number;
    }
    if (Array.isArray(value)) {
      // «welt, welt, inner» — один и тот же вид дважды читается как «прорезной × 2».
      const counted = new Map();
      value.forEach((item) => { const shown = attributeScalar(key, item); counted.set(shown, (counted.get(shown) || 0) + 1); });
      return [...counted].map(([shown, times]) => (times > 1 ? `${shown} \u00d7 ${times}` : shown)).join(', ') || '\u2014';
    }
    if (value && typeof value === 'object') return attributeParts(value).map(([label, shown]) => `${label}: ${shown}`).join('; ');
    const raw = String(value);
    return attributeWord('attr.value.', raw.toLowerCase()) || raw.replace(/_/g, ' ');
  }
  // Пары «параметр — значение» структурного значения; для скаляра и массива — null (печатается строкой).
  function attributeParts(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    // Количество с единицей — `{ value, unit }` — это одно значение, а не две строки.
    const keys = Object.keys(value);
    if (keys.length === 2 && typeof value.value === 'number' && typeof value.unit === 'string') {
      return [[attributePartLabel('value'), I18N.formatUnit(value.value, value.unit)]];
    }
    return keys.map((key) => [attributePartLabel(key), attributeScalar(key, value[key])]);
  }
  function formatAttributeValue(value) {
    if (value === null || value === undefined) return null;
    if (value && typeof value === 'object' && !Array.isArray(value)) return attributeParts(value).map(([label, shown]) => `${label}: ${shown}`).join('; ');
    return attributeScalar('', value);
  }

  function colorwayActions(item) {
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, item.product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    if (!manage) return null;
    // Загружается здесь, пока открыта вкладка «Цветомодели», — не в момент нажатия «Добавить», —
    // чтобы справочник уже успел прийти к тому моменту, когда человек откроет форму.
    loadColourLibrary();
    const row = el('div', { className: 'od-inline-actions' });
    const colour = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить цветомодель', 'Add a colourway') });
    colour.addEventListener('click', () => addColorway(item));
    const colourBatch = el('button', { className: 'button small', type: 'button', rawText: text('Добавить несколько цветов', 'Add several colours') });
    colourBatch.addEventListener('click', () => addColorwaysBatch(item));
    const image = el('button', { className: 'button small', type: 'button', rawText: text('Добавить изображение', 'Add an image') });
    image.addEventListener('click', () => addMedia(item));
    row.append(colour, colourBatch, image);
    const scale = el('button', { className: 'button small', type: 'button', rawText: text('Создать размерную шкалу', 'Create a size scale') });
    scale.addEventListener('click', () => chainForms()?.createSizeScaleForm({ brandId: item.product.brandId }).catch((problem) => toast(styleErrorMessage(problem), 'error')));
    row.append(scale);
    return row;
  }

  // Сертификация продукта: заключение внешнего органа (OEKO-TEX, GOTS, GRS и т. п.) о стиле.
  // Тот же приём ленивой подгрузки по styleId, что и у `sizeLineState` чуть ниже: своя карта
  // данных/загрузки/отказа, а не поле воркспейса — сертификаты не нужны на каждом экране со
  // списком моделей, только когда открыта эта вкладка инспектора.
  const certificationState = window.SynthaProductCertificationState
    || (window.SynthaProductCertificationState = { data: {}, loading: {}, failed: {}, denied: {} });
  certificationState.denied = certificationState.denied || {};

  function loadCertifications(styleId) {
    if (certificationState.data[styleId] || certificationState.loading[styleId] || certificationState.failed[styleId]) return;
    certificationState.loading[styleId] = true;
    api(`/v2/product/styles/${encodeURIComponent(styleId)}/certifications`)
      .then((value) => { certificationState.data[styleId] = Array.isArray(value) ? value : []; })
      .catch((problem) => { certificationState.failed[styleId] = true; if (problem?.forbidden) certificationState.denied[styleId] = true; })
      .finally(() => { certificationState.loading[styleId] = false; if (state.view === 'styles') renderApp(); });
  }
  function invalidateCertifications(styleId) {
    delete certificationState.data[styleId];
    delete certificationState.failed[styleId];
  }

  function certificationStatusLabel(status) {
    const labels = {
      draft: [text('черновик', 'draft'), ''],
      issued: [text('выставлен', 'issued'), 'success'],
      superseded: [text('заменён', 'superseded'), ''],
    };
    const pair = labels[status] || [status, ''];
    return el('span', { className: `badge ${pair[1]}`.trim(), rawText: pair[0] });
  }

  function addCertification(item) {
    const product = item.product;
    openForm({
      title: text('Добавить сертификат', 'Add a certificate'),
      hint: text('Заключение внешнего органа о соответствии стиля стандарту.', 'An external body’s attestation that the style meets a standard.'),
      fields: [
        field(text('Стандарт', 'Standard'), input('certificationType', 'text', { required: true, minlength: '2', maxlength: '200', placeholder: 'OEKO-TEX Standard 100' })),
        field(text('Номер сертификата', 'Certificate number'), input('certificateNumber', 'text', { required: true, maxlength: '120' })),
        field(text('Орган выдачи', 'Issuing body'), input('issuingBody', 'text', { required: true, minlength: '2', maxlength: '200' })),
        field(text('Действует с', 'Valid from'), input('validFrom', 'date')),
        field(text('Действует по', 'Valid to'), input('validTo', 'date')),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        await mutate('/v2/product-certifications', {
          styleId: product.id,
          certificationType: values.certificationType.trim(),
          certificateNumber: values.certificateNumber.trim(),
          issuingBody: values.issuingBody.trim(),
          validFrom: values.validFrom || null,
          validTo: values.validTo || null,
        });
        invalidateCertifications(product.id);
        toast(text('Сертификат добавлен как черновик.', 'The certificate was added as a draft.'), 'success');
      },
    });
  }

  function supersedeCertification(product, certification) {
    openForm({
      title: text('Продлить сертификат', 'Renew the certificate'),
      hint: text('Прежний сертификат будет заменён новым; старый останется в истории.', 'The prior certificate will be marked superseded; the old one stays in the history.'),
      fields: [
        field(text('Новый номер сертификата', 'New certificate number'), input('replacementCertificateNumber', 'text', { required: true, maxlength: '120' })),
        field(text('Орган выдачи', 'Issuing body'), input('issuingBody', 'text', { value: certification.issuingBody, minlength: '2', maxlength: '200' })),
        field(text('Действует с', 'Valid from'), input('validFrom', 'date', { value: certification.validFrom || '' })),
        field(text('Действует по', 'Valid to'), input('validTo', 'date', { value: certification.validTo || '' })),
      ],
      submitLabel: text('Продлить', 'Renew'),
      onSubmit: async (values) => {
        await mutate(`/v2/product-certifications/${encodeURIComponent(certification.id)}/supersede`, {
          expectedVersion: certification.version,
          replacementCertificateNumber: values.replacementCertificateNumber.trim(),
          issuingBody: values.issuingBody.trim(),
          validFrom: values.validFrom || null,
          validTo: values.validTo || null,
        });
        invalidateCertifications(product.id);
        toast(text('Сертификат продлён.', 'The certificate was renewed.'), 'success');
      },
    });
  }

  function issueCertification(product, certification) {
    return actionButton(text('Выставить', 'Issue'), async () => {
      await mutate(`/v2/product-certifications/${encodeURIComponent(certification.id)}/issue`, { expectedVersion: certification.version });
      invalidateCertifications(product.id);
    });
  }

  function certificationActions(item) {
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, item.product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_CERTIFICATION_MANAGE);
    if (!manage) return null;
    const row = el('div', { className: 'od-inline-actions' });
    const add = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить сертификат', 'Add a certificate') });
    add.addEventListener('click', () => addCertification(item));
    row.append(add);
    return row;
  }

  function certificationPanel(item) {
    const product = item.product;
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_CERTIFICATION_MANAGE);
    // Сертификаты читает тот, у кого есть право на их чтение. Остальным сервер ответил бы отказом, и
    // вкладка молчала: запрос не уходит, а вкладка говорит, что раздел закрыт для роли.
    const caps = window.SynthaUiCapabilities;
    if (caps && !caps.hasForOrganisation(state.workspace, product.brandId, caps.CAPABILITIES.PRODUCT_CERTIFICATION_READ)) return noAccessNotice();
    loadCertifications(product.id);
    if (certificationState.denied[product.id]) return noAccessNotice();
    if (certificationState.failed[product.id]) return notice(text('Сертификаты недоступны.', 'Certificates are unavailable.'));
    const rows = certificationState.data[product.id];
    if (!rows) return notice(text('Загрузка…', 'Loading…'));
    if (!rows.length) return notice(text('У модели пока нет сертификатов.', 'This style has no certificates yet.'));
    return odMiniTable(
      [text('Стандарт', 'Standard'), text('Номер', 'Number'), text('Орган', 'Issuing body'), text('Действует', 'Valid'), text('Статус', 'Status'), ''],
      rows.map((certification) => [
        certification.certificationType,
        certification.certificateNumber,
        certification.issuingBody,
        [certification.validFrom || '—', certification.validTo || '—'].join(' … '),
        certificationStatusLabel(certification.status),
        manage && certification.status === 'draft' ? issueCertification(product, certification)
          : (manage && certification.status === 'issued' ? (() => {
              const button = el('button', { className: 'button small', type: 'button', rawText: text('Продлить', 'Renew') });
              button.addEventListener('click', () => supersedeCertification(product, certification));
              return button;
            })() : null),
      ]),
    );
  }

  // \u0420\u044f\u0434 \u0433\u0440\u0443\u0437\u0438\u0442\u0441\u044f \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u044b\u043c \u0437\u0430\u043f\u0440\u043e\u0441\u043e\u043c: \u043e\u043d \u0441\u043e\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044f \u0438\u0437 \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0435\u0439 \u0432\u0441\u0435\u0445 \u0440\u0430\u0437\u043c\u0435\u0440\u043e\u0432 \u0441\u0442\u0438\u043b\u044f, \u0438 \u0442\u044f\u043d\u0443\u0442\u044c
  // \u0435\u0433\u043e \u0434\u043b\u044f \u043a\u0430\u0436\u0434\u043e\u0439 \u0441\u0442\u0440\u043e\u043a\u0438 \u0440\u0435\u0435\u0441\u0442\u0440\u0430 \u0440\u0430\u0434\u0438 \u043e\u0434\u043d\u043e\u0439 \u043e\u0442\u043a\u0440\u044b\u0442\u043e\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u0431\u044b\u043b\u043e \u0431\u044b \u0440\u0430\u0441\u0442\u043e\u0447\u0438\u0442\u0435\u043b\u044c\u043d\u043e.
  // Доска референсов на стиле — тот же приём ленивой подгрузки по styleId и своей карты данных/загрузки/отказа, что и у сертификатов чуть выше: боард привязан к самому стилю, не к версии.
  const styleReferenceState = window.SynthaProductStyleReferenceState
    || (window.SynthaProductStyleReferenceState = { data: {}, loading: {}, failed: {} });

  function loadStyleReferences(styleId) {
    if (styleReferenceState.data[styleId] || styleReferenceState.loading[styleId] || styleReferenceState.failed[styleId]) return;
    styleReferenceState.loading[styleId] = true;
    api(`/v2/product/styles/${encodeURIComponent(styleId)}`)
      .then((value) => { styleReferenceState.data[styleId] = Array.isArray(value?.styleReferences) ? value.styleReferences : []; })
      .catch(() => { styleReferenceState.failed[styleId] = true; })
      .finally(() => { styleReferenceState.loading[styleId] = false; if (state.view === 'styles') renderApp(); });
  }
  function invalidateStyleReferences(styleId) {
    delete styleReferenceState.data[styleId];
    delete styleReferenceState.failed[styleId];
  }

  // Сам список стилей уже загружен в `state.workspace.productStyles` (реестр «Модели» на рабочем
  // столе), поэтому выбор «похожего изделия» не требует отдельного запроса — ровно тот же приём,
  // что и у выбора цвета из справочника (`colourRefOptions`), только источник не библиотека, а уже
  // загруженный реестр собственного бренда.
  function linkedStyleOptions(product) {
    const styles = (state.workspace?.productStyles || [])
      .filter((candidate) => candidate.brandId === product.brandId && candidate.id !== product.id)
      .sort((left, right) => String(left.styleCode).localeCompare(String(right.styleCode)));
    return [
      ['', text('— не выбрано —', '— none —')],
      ...styles.map((candidate) => [candidate.id, `${candidate.styleCode} · ${title(candidate)}`]),
    ];
  }

  function addStyleReference(item) {
    const product = item.product;
    const rows = styleReferenceState.data[product.id] || [];
    openForm({
      title: text('Добавить референс', 'Add a reference'),
      hint: text('Модель прошлого сезона, референс посадки или детали — вход в разработку, не версия стиля.', 'A past-season model, a fit or a detail reference — design-research input, not a style version.'),
      fields: [
        field(text('Ссылка на изображение', 'Image link'), input('imageUri', 'text', { required: true, maxlength: '2048' })),
        field(text('Похожее изделие (аналог из каталога)', 'Similar product (analog from the catalog)'), select('linkedStyleId', linkedStyleOptions(product))),
        field(text('Модель/сезон прошлого сезона', 'Prior-season model'), input('referencedModel', 'text', { maxlength: '160' })),
        field(text('Сезон', 'Season'), input('season', 'text', { maxlength: '40' })),
        field(text('Комментарий', 'Comment'), input('comment', 'text', { maxlength: '1000' })),
        field(text('Порядок', 'Order'), input('sortOrder', 'number', { required: true, min: '0', max: '999', value: String(rows.length) })),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/references`, {
          imageUri: values.imageUri.trim(),
          referencedModel: values.referencedModel?.trim() || undefined,
          season: values.season?.trim() || undefined,
          comment: values.comment?.trim() || undefined,
          linkedStyleId: values.linkedStyleId || undefined,
          sortOrder: Number(values.sortOrder),
        });
        invalidateStyleReferences(product.id);
        toast(text('Референс добавлен.', 'The reference was added.'), 'success');
      },
    });
  }

  function styleReferenceActions(item) {
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, item.product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    if (!manage) return null;
    const row = el('div', { className: 'od-inline-actions' });
    const add = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить референс', 'Add a reference') });
    add.addEventListener('click', () => addStyleReference(item));
    row.append(add);
    return row;
  }

  function styleReferencePanel(item) {
    const product = item.product;
    loadStyleReferences(product.id);
    if (styleReferenceState.failed[product.id]) return notice(text('Доска референсов недоступна.', 'The reference board is unavailable.'));
    const rows = styleReferenceState.data[product.id];
    if (!rows) return notice(text('Загрузка…', 'Loading…'));
    if (!rows.length) return notice(text('На доске пока нет референсов.', 'The reference board is empty so far.'));
    const grid = el('div', { className: 'od-reference-grid' });
    [...rows].sort((a, b) => a.sortOrder - b.sortOrder).forEach((reference) => {
      const tile = el('figure', { className: 'od-reference-tile' });
      const referenceSrc = imageSource(reference.imageUri);
      tile.append(referenceSrc
        ? el('img', { className: 'od-thumb', src: referenceSrc, alt: reference.referencedModel || product.styleCode, loading: 'lazy' })
        : imagePlaceholder(reference.imageUri));
      const caption = el('figcaption', {});
      if (reference.referencedModel) caption.append(el('strong', { rawText: reference.referencedModel }));
      if (reference.season) caption.append(el('span', { rawText: ` · ${reference.season}` }));
      if (reference.linkedStyleCode) caption.append(el('span', { className: 'badge', rawText: `${text('Аналог', 'Analog')}: ${reference.linkedStyleCode}` }));
      if (reference.comment) caption.append(el('p', { rawText: reference.comment }));
      tile.append(caption);
      grid.append(tile);
    });
    return grid;
  }

  // Доска технологических узлов на стиле — справочник `design.construction_node` заведён с самого
  // начала (последовательность операций / BOL), но ни разу не был виден с самого стиля. Узел
  // выбирается из уже каталогизированного справочника (тот же чтениемый всем `GET
  // /v2/libraries/:code/entries`, каким уже пользуется экран «Библиотеки»), а не вписывается свободным текстом.
  const constructionNodeLibraryState = window.SynthaConstructionNodeLibraryState
    || (window.SynthaConstructionNodeLibraryState = { items: null, loading: false, failed: false });

  function loadConstructionNodeLibrary() {
    if (constructionNodeLibraryState.items || constructionNodeLibraryState.loading || constructionNodeLibraryState.failed) return;
    constructionNodeLibraryState.loading = true;
    api('/v2/libraries/design.construction_node/entries?limit=200')
      .then((page) => { constructionNodeLibraryState.items = Array.isArray(page?.items) ? page.items : []; })
      .catch(() => { constructionNodeLibraryState.failed = true; })
      .finally(() => { constructionNodeLibraryState.loading = false; if (state.view === 'styles') renderApp(); });
  }
  function constructionNodeEntry(entryId) {
    return (constructionNodeLibraryState.items || []).find((entry) => entry.id === entryId);
  }
  function constructionNodeLabel(entryId) {
    const entry = constructionNodeEntry(entryId);
    if (!entry) return entryId;
    return `${entry.code} · ${I18N.getLocale?.() === 'en' ? entry.nameEn : entry.nameRu}`;
  }

  const styleConstructionNodeState = window.SynthaProductStyleConstructionNodeState
    || (window.SynthaProductStyleConstructionNodeState = { data: {}, loading: {}, failed: {} });

  function loadStyleConstructionNodes(styleId) {
    if (styleConstructionNodeState.data[styleId] || styleConstructionNodeState.loading[styleId] || styleConstructionNodeState.failed[styleId]) return;
    styleConstructionNodeState.loading[styleId] = true;
    api(`/v2/product/styles/${encodeURIComponent(styleId)}`)
      .then((value) => { styleConstructionNodeState.data[styleId] = Array.isArray(value?.styleConstructionNodes) ? value.styleConstructionNodes : []; })
      .catch(() => { styleConstructionNodeState.failed[styleId] = true; })
      .finally(() => { styleConstructionNodeState.loading[styleId] = false; if (state.view === 'styles') renderApp(); });
  }
  function invalidateStyleConstructionNodes(styleId) {
    delete styleConstructionNodeState.data[styleId];
    delete styleConstructionNodeState.failed[styleId];
  }

  function addConstructionNode(item) {
    const product = item.product;
    const rows = styleConstructionNodeState.data[product.id] || [];
    const library = constructionNodeLibraryState.items || [];
    if (!library.length) {
      toast(text('Справочник узлов ещё загружается, попробуйте ещё раз.', 'The node library is still loading, try again.'), 'error');
      return;
    }
    const alreadyAttached = new Set(rows.map((value) => value.mdmRef.entryId));
    const options = library
      .filter((entry) => !alreadyAttached.has(entry.id))
      .map((entry) => [`${entry.id}|${entry.version}`, `${entry.code} · ${I18N.getLocale?.() === 'en' ? entry.nameEn : entry.nameRu}`]);
    if (!options.length) {
      toast(text('Все узлы из справочника уже на доске.', 'Every node in the library is already on the board.'), 'error');
      return;
    }
    openForm({
      title: text('Добавить узел', 'Add a construction node'),
      hint: text('Узел выбирается из уже каталогизированного справочника — не вписывается свободным текстом.', 'The node is chosen from the already-catalogued library, not typed freely.'),
      fields: [
        field(text('Узел', 'Construction node'), select('nodeRef', options)),
        field(text('Примечание', 'Note'), input('note', 'text', { maxlength: '1000' })),
        field(text('Порядок', 'Order'), input('sortOrder', 'number', { required: true, min: '0', max: '999', value: String(rows.length) })),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        const [entryId, version] = values.nodeRef.split('|');
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/construction-nodes`, {
          mdmRef: { entryId, version: Number(version) },
          note: values.note?.trim() || undefined,
          sortOrder: Number(values.sortOrder),
        });
        invalidateStyleConstructionNodes(product.id);
        toast(text('Узел добавлен.', 'The construction node was added.'), 'success');
      },
    });
  }

  function styleConstructionNodeActions(item) {
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, item.product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    if (!manage) return null;
    const row = el('div', { className: 'od-inline-actions' });
    const add = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить узел', 'Add a construction node') });
    add.addEventListener('click', () => addConstructionNode(item));
    row.append(add);
    return row;
  }

  function styleConstructionNodePanel(item) {
    const product = item.product;
    loadConstructionNodeLibrary();
    loadStyleConstructionNodes(product.id);
    if (styleConstructionNodeState.failed[product.id]) return notice(text('Доска узлов недоступна.', 'The construction node board is unavailable.'));
    const rows = styleConstructionNodeState.data[product.id];
    if (!rows) return notice(text('Загрузка…', 'Loading…'));
    if (!rows.length) return notice(text('На доске пока нет узлов.', 'The construction node board is empty so far.'));
    return odMiniTable(
      [text('Узел', 'Node'), text('Примечание', 'Note')],
      [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((node) => [constructionNodeLabel(node.mdmRef.entryId), node.note || '—']),
    );
  }

  // Квотирование продукта: RFQ уже существует как собственный, независимый от заказа бэкенд
  // (`sourcing/public.mjs`, `createRfq` требует только опубликованный SKU и опубликованную BOM) — но
  // ни разу не был виден с самой карточки продукта, только из отдельного раздела «Запросы цен». Этот
  // блок ничего не добавляет на бэкенд: то же самое чтение `GET /v2/rfqs?sku=...`, каким уже
  // пользуется sourcing.js, просто адресованное сразу по всем легаси-кодам SKU этого стиля (агрегат
  // стиля уже несёт `colorways[].skus[].legacyCatalogSku`). Право на чтение отдельное —
  // `sourcing.read`, не `product.read` — поэтому вкладка проверяет его сама, тем же приёмом, что и
  // `performancePanel` чуть выше проверяет `margin.read`.
  const RFQ_STATUS_LABELS = {
    draft: ['Черновик', 'Draft'], issued: ['Отправлен', 'Issued'], quoted: ['Есть котировки', 'Quoted'],
    awarded: ['Победитель выбран', 'Awarded'], allocated: ['В производстве', 'Allocated'], cancelled: ['Отменён', 'Cancelled'],
  };
  function rfqStatusBadge(status) {
    const pair = RFQ_STATUS_LABELS[status] || [statusLabel(status), statusLabel(status)];
    const tone = status === 'allocated' ? 'success' : (status === 'cancelled' ? '' : (status ? 'warning' : ''));
    return el('span', { className: `badge ${tone}`.trim(), rawText: text(pair[0], pair[1]) });
  }
  const styleQuotationState = window.SynthaProductStyleQuotationState
    || (window.SynthaProductStyleQuotationState = { data: {}, loading: {}, failed: {} });

  function loadStyleQuotations(styleId) {
    if (styleQuotationState.data[styleId] || styleQuotationState.loading[styleId] || styleQuotationState.failed[styleId]) return;
    styleQuotationState.loading[styleId] = true;
    api(`/v2/product/styles/${encodeURIComponent(styleId)}`)
      .then(async (aggregate) => {
        const skuCodes = [...new Set((aggregate?.colorways || []).flatMap((colorway) => (colorway.skus || []).map((sku) => sku.legacyCatalogSku).filter(Boolean)))];
        if (!skuCodes.length) { styleQuotationState.data[styleId] = []; return; }
        const pages = await Promise.all(skuCodes.map((sku) => api(`/v2/rfqs?${new URLSearchParams({ sku, limit: '50' }).toString()}`).catch(() => ({ items: [] }))));
        const rfqs = pages.flatMap((page) => (Array.isArray(page?.items) ? page.items : []));
        rfqs.sort((a, b) => String(a.rfqCode).localeCompare(String(b.rfqCode)));
        styleQuotationState.data[styleId] = rfqs;
      })
      .catch(() => { styleQuotationState.failed[styleId] = true; })
      .finally(() => { styleQuotationState.loading[styleId] = false; if (state.view === 'styles') renderApp(); });
  }
  function invalidateStyleQuotations(styleId) {
    delete styleQuotationState.data[styleId];
    delete styleQuotationState.failed[styleId];
  }

  function styleQuotationPanel(item) {
    const product = item.product;
    if (!window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, window.SynthaUiCapabilities.CAPABILITIES.SOURCING_READ)) {
      return notice(text('Раздел закупки недоступен вашей роли.', 'Sourcing is not available to your role.'));
    }
    loadStyleQuotations(product.id);
    const wrap = document.createDocumentFragment();
    const goToSourcing = el('button', { className: 'button small', type: 'button', rawText: text('Перейти в «Запросы цен»', 'Open in Sourcing') });
    goToSourcing.addEventListener('click', () => { state.view = 'rfqs'; renderApp(); });
    const refresh = el('button', { className: 'button small', type: 'button', rawText: text('Обновить', 'Refresh') });
    refresh.addEventListener('click', () => { invalidateStyleQuotations(product.id); renderApp(); });
    const actions = el('div', { className: 'od-inline-actions' });
    actions.append(goToSourcing, refresh);
    wrap.append(actions);
    if (styleQuotationState.failed[product.id]) { wrap.append(notice(text('Не удалось загрузить запросы цены.', 'RFQs could not be loaded.'))); return wrap; }
    const rows = styleQuotationState.data[product.id];
    if (!rows) { wrap.append(notice(text('Загрузка…', 'Loading…'))); return wrap; }
    if (!rows.length) { wrap.append(notice(text('По SKU этого стиля пока нет запросов цены.', 'No RFQs exist yet for this style’s SKUs.'))); return wrap; }
    wrap.append(odMiniTable(
      ['RFQ', 'SKU', text('Статус', 'Status'), text('Количество', 'Quantity'), text('Ответ до', 'Response due'), text('Поставка до', 'Delivery due')],
      rows.map((rfq) => [rfq.rfqCode, rfq.sku, rfqStatusBadge(rfq.status), String(rfq.targetQuantity ?? '—'), rfq.responseDueAt ? rfq.responseDueAt.slice(0, 10) : '—', rfq.deliveryDueAt ? rfq.deliveryDueAt.slice(0, 10) : '—']),
    ));
    return wrap;
  }

  const sizeLineState = window.SynthaBomSizeLineState
    || (window.SynthaBomSizeLineState = { data: {}, loading: {}, failed: {} });

  function loadSizeLine(styleId) {
    if (sizeLineState.data[styleId] || sizeLineState.loading[styleId] || sizeLineState.failed[styleId]) return;
    sizeLineState.loading[styleId] = true;
    api(`/v2/product/styles/${encodeURIComponent(styleId)}/bom-size-line`)
      .then((value) => { sizeLineState.data[styleId] = value; })
      .catch(() => { sizeLineState.failed[styleId] = true; })
      .finally(() => { sizeLineState.loading[styleId] = false; if (state.view === 'styles') renderApp(); });
  }

  function sizeLineExceptionLabel(code) {
    const labels = {
      'size-without-published-bom': ['\u0420\u0430\u0437\u043c\u0435\u0440 \u0431\u0435\u0437 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u043e\u0439 \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0438', 'Size without a published bill'],
      'material-missing-in-size': ['\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u043f\u0440\u043e\u043f\u0430\u043b \u0432 \u0440\u0430\u0437\u043c\u0435\u0440\u0435', 'Material missing in a size'],
      'consumption-not-graded': ['\u0420\u0430\u0441\u0445\u043e\u0434 \u043d\u0435 \u0440\u0430\u0441\u0442\u0451\u0442 \u0441 \u0440\u0430\u0437\u043c\u0435\u0440\u043e\u043c', 'Consumption does not grow with size'],
    };
    const pair = labels[code];
    return pair ? text(pair[0], pair[1]) : code;
  }

  function sizeLinePanel(product) {
    const styleId = product.id;
    loadSizeLine(styleId);
    const view = sizeLineState.data[styleId];
    if (sizeLineState.failed[styleId]) return notice(text('\u0420\u044f\u0434 \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d.', 'The bill size line is unavailable.'));
    if (!view) return notice(text('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026'));
    if (!view.sizes.length) {
      return notice(text('\u0423 \u0441\u0442\u0438\u043b\u044f \u043d\u0435\u0442 SKU \u0441 \u0440\u0430\u0437\u043c\u0435\u0440\u0430\u043c\u0438, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0440\u044f\u0434\u0430 \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0438 \u043d\u0435\u0442.',
        'This style has no sized SKU, so there is no size line.'));
    }

    const holder = document.createDocumentFragment();
    holder.append(odMiniTable(
      [text('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b', 'Material'), text('\u041a\u043e\u043c\u043f\u043e\u043d\u0435\u043d\u0442', 'Component'), ...view.sizes.map((size) => size.sizeCode), text('\u0420\u0430\u0437\u0431\u0440\u043e\u0441', 'Spread')],
      view.materials.map((material) => [
        material.isMain ? `${material.materialCode} \u2605` : material.materialCode,
        material.component || '\u2014',
        ...material.consumption.map((cell) => (cell && cell.quantity !== null
          ? `${I18N.formatNumber(cell.quantity, { maximumFractionDigits: 4 })} ${material.unit}`
          : '\u2014')),
        material.graded
          ? `${I18N.formatNumber(material.minQuantity, { maximumFractionDigits: 4 })}\u2013${I18N.formatNumber(material.maxQuantity, { maximumFractionDigits: 4 })}`
          : text('\u043e\u0434\u043d\u0430 \u0446\u0438\u0444\u0440\u0430', 'one figure'),
      ]),
    ));

    holder.append(odMiniTable(
      [text('\u0420\u0430\u0437\u043c\u0435\u0440', 'Size'), text('\u0412\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u044c', 'Bill'), text('\u0418\u0442\u043e\u0433', 'Total')],
      view.sizes.map((size) => [
        size.sizeCode,
        size.bomStatus === 'published' ? text('\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u0430', 'published') : (size.bomStatus || text('\u043d\u0435\u0442', 'none')),
        size.bomTotalCost === null ? '\u2014' : `${I18N.formatNumber(size.bomTotalCost, { maximumFractionDigits: 2 })} ${view.currency || ''}`,
      ]),
    ));

    if (view.exceptions.length) {
      holder.append(odMiniTable(
        [text('\u0420\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u0435', 'Exception'), text('\u0420\u0430\u0437\u043c\u0435\u0440', 'Size'), text('\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b', 'Material'), text('\u041f\u043e\u0434\u0440\u043e\u0431\u043d\u043e\u0441\u0442\u044c', 'Detail')],
        view.exceptions.map((exception) => [
          sizeLineExceptionLabel(exception.code), exception.sizeCode, exception.materialCode || '\u2014', exception.detail,
        ]),
      ));
      // \u0420\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u044f \u043d\u0430\u0437\u0432\u0430\u043d\u044b, \u043d\u043e \u043d\u0438 \u043e\u0434\u043d\u043e \u0438\u0437 \u043d\u0438\u0445 \u043d\u0435 \u043e\u0442\u043a\u0430\u0437: \u0440\u0430\u0441\u0445\u043e\u0434 \u043c\u043e\u0436\u0435\u0442 \u043d\u0435 \u0440\u0430\u0441\u0442\u0438 \u0441 \u0440\u0430\u0437\u043c\u0435\u0440\u043e\u043c \u0437\u0430\u043a\u043e\u043d\u043d\u043e \u2014
      // \u0440\u0430\u0441\u043a\u043b\u0430\u0434\u043a\u0430 \u043d\u0430 \u0440\u0430\u0437\u043d\u044b\u0445 \u0440\u0430\u0437\u043c\u0435\u0440\u0430\u0445 \u043b\u043e\u0436\u0438\u0442\u0441\u044f \u043f\u043e-\u0440\u0430\u0437\u043d\u043e\u043c\u0443, \u2014 \u0438 \u0437\u0430\u043f\u0440\u0435\u0449\u0430\u0442\u044c \u044d\u0442\u043e \u0437\u043d\u0430\u0447\u0438\u043b\u043e \u0431\u044b \u0437\u0430\u043f\u0440\u0435\u0442\u0438\u0442\u044c
      // \u043f\u0440\u0430\u0432\u0434\u0443. \u0420\u0435\u0448\u0430\u0435\u0442 \u0447\u0435\u043b\u043e\u0432\u0435\u043a, \u0430 \u044d\u043a\u0440\u0430\u043d \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442.
      holder.append(notice(text(
        '\u042d\u0442\u043e \u043f\u043e\u0434\u043e\u0437\u0440\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043c\u0435\u0441\u0442\u0430, \u0430 \u043d\u0435 \u043e\u0448\u0438\u0431\u043a\u0438: \u043a\u0430\u0436\u0434\u043e\u0435 \u0438\u0437 \u043d\u0438\u0445 \u0431\u044b\u0432\u0430\u0435\u0442 \u0438 \u043d\u0430\u043c\u0435\u0440\u0435\u043d\u043d\u044b\u043c. \u0420\u0435\u0448\u0430\u0435\u0442 \u0430\u0432\u0442\u043e\u0440 \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0438.',
        'These are suspicious, not wrong: each can be deliberate. The bill author decides.'), 'warning'));
    } else if (view.sizes.length === 1) {
      holder.append(notice(text(
        '\u0423 \u0441\u0442\u0438\u043b\u044f \u043e\u0434\u0438\u043d \u0440\u0430\u0437\u043c\u0435\u0440, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0441\u0440\u0430\u0432\u043d\u0438\u0432\u0430\u0442\u044c \u0440\u044f\u0434 \u043d\u0435 \u0441 \u0447\u0435\u043c: \u0433\u0440\u0430\u0434\u0430\u0446\u0438\u044f \u0440\u0430\u0441\u0445\u043e\u0434\u0430 \u0432\u0438\u0434\u043d\u0430 \u043d\u0430\u0447\u0438\u043d\u0430\u044f \u0441 \u0434\u0432\u0443\u0445 \u0440\u0430\u0437\u043c\u0435\u0440\u043e\u0432.',
        'This style has one size, so there is nothing to compare: grading shows from two sizes upward.')));
    } else {
      holder.append(notice(text('\u0420\u044f\u0434 \u0441\u0445\u043e\u0434\u0438\u0442\u0441\u044f: \u0440\u0430\u0441\u0445\u043e\u0434 \u0440\u0430\u0441\u0442\u0451\u0442 \u0441 \u0440\u0430\u0437\u043c\u0435\u0440\u043e\u043c, \u043f\u0440\u043e\u043f\u0443\u0441\u043a\u043e\u0432 \u043d\u0435\u0442.',
        'The size line is consistent: consumption grows with size and nothing is missing.'), 'success'));
    }
    return holder;
  }

  // Разбор готовности и следующий шаг за ней живут своим модулем: вкладка показывает статус, а
  // «чего именно недостаёт» — это отдельный снимок, который читается по требованию.
  function readinessPanelModule() { return window.SynthaProductReadinessPanel || null; }
  function readinessDimensions(product) {
    const panel = readinessPanelModule();
    return panel ? panel.dimensionsPanel(product, { onLoaded: () => { if (state.view === 'styles') renderApp(); } }) : null;
  }
  function readinessAssessAction(product) {
    const assessment = window.SynthaProductReadinessAssessment;
    return assessment ? assessment.assessAction(product) : null;
  }
  function readinessPackRatioTemplateAction(product) {
    const assessment = window.SynthaProductReadinessAssessment;
    return assessment ? assessment.packRatioTemplateAction(product) : null;
  }
  function readinessProjectionAction(product) {
    const panel = readinessPanelModule();
    return panel ? panel.projectionAction(product) : null;
  }

  // Шаги цепочки «модель → версия → коллекция» живут в `product-chain-forms.js`; здесь только кнопки
  // на карточке. Скрипт грузится раньше этого файла, но обращение — в момент нажатия, не при загрузке.
  function chainForms() { return window.SynthaProductChainForms || null; }
  function chainActions(product) {
    const forms = chainForms();
    if (!forms || !forms.mayManageProducts(product.brandId)) return null;
    const row = el('div', { className: 'od-inline-actions' });
    const version = el('button', { className: 'button small', type: 'button', rawText: text('Новая версия модели', 'New style version') });
    version.addEventListener('click', () => forms.newStyleVersionForm(product).catch((problem) => toast(styleErrorMessage(problem), 'error')));
    const collection = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить в коллекцию', 'Add to a collection') });
    collection.addEventListener('click', () => { try { forms.addToCollectionForm({ product }); } catch (problem) { toast(styleErrorMessage(problem), 'error'); } });
    row.append(version, collection);
    return row;
  }
  function registryActions() {
    const forms = chainForms();
    if (!forms) return null;
    const caps = window.SynthaUiCapabilities;
    const mayManage = (state.workspace?.organisations || []).some((org) => org.type === 'brand' && forms.mayManageProducts(org.id)) && caps;
    if (!mayManage) return null;
    const row = el('div', { className: 'od-inline-actions' });
    const create = el('button', { className: 'button primary', type: 'button', rawText: text('Создать модель', 'Create a style') });
    create.addEventListener('click', () => forms.createStyleForm().catch((problem) => toast(styleErrorMessage(problem), 'error')));
    const scale = el('button', { className: 'button', type: 'button', rawText: text('Создать размерную шкалу', 'Create a size scale') });
    scale.addEventListener('click', () => forms.createSizeScaleForm().catch((problem) => toast(styleErrorMessage(problem), 'error')));
    row.append(create, scale);
    return row;
  }

  function inspector(item) {
    const product = item.product;
    const risks = item.risks.length
      ? odMiniTable([text('Проверка', 'Gate'), text('Уровень', 'Severity')], item.risks.map((risk) => [riskLabel(risk.code), statusBadge(risk.severity)]))
      : notice(text('Цепочка «Модель → Готовность → Коммерческая проекция» замкнута.', 'Product Master → Readiness → Commercial Projection chain is complete.'), 'success');
    return odInspector({
      title: title(product),
      subtitle: `${product.styleCode} · v${product.styleVersionNo || '—'}`,
      status: product.lifecycleStatus,
      preview: true,
      tabs: [
        {
          // \u0420\u0430\u0437\u043c\u0435\u0440\u043d\u044b\u0439 \u0440\u044f\u0434 \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0438. \u0421\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f \u0432\u0435\u0434\u0451\u0442\u0441\u044f \u043d\u0430 \u043a\u0430\u0436\u0434\u044b\u0439 \u0440\u0430\u0437\u043c\u0435\u0440 \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e \u2014 \u044d\u0442\u043e \u0432\u0435\u0440\u043d\u043e,
          // \u0440\u0430\u0441\u0445\u043e\u0434 \u043d\u0430 48-\u0439 \u0431\u043e\u043b\u044c\u0448\u0435, \u0447\u0435\u043c \u043d\u0430 40-\u0439, \u2014 \u043d\u043e \u0431\u0435\u0437 \u0440\u044f\u0434\u0430 \u0430\u0432\u0442\u043e\u0440 \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0441\u0440\u0430\u0432\u043d\u0438\u0442\u044c \u0438\u0445 \u043c\u0435\u0436\u0434\u0443
          // \u0441\u043e\u0431\u043e\u0439, \u0430 \u043e\u043f\u0435\u0447\u0430\u0442\u043a\u0443 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043c\u0435\u043d\u043d\u043e \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0435.
          label: text('\u0420\u044f\u0434 \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0438', 'Bill size line'),
          content: [sizeLinePanel(product)],
        },
        {
          label: text('\u041f\u0440\u043e\u0434\u0443\u043a\u0442', 'Product'),
          fields: [
            { label: text('Артикул', 'Style code'), value: product.styleCode || '—' },
            { label: text('Идентификатор', 'Identifier'), value: shortId(product.id), title: product.id },
            { label: text('Версия', 'Version'), value: product.styleVersionNo ? `v${product.styleVersionNo}` : '—', title: product.styleVersionId || '' },
            { label: text('Цветовые решения', 'Colorways'), value: item.colorwayCount },
            { label: text('Товарные SKU', 'Product SKU'), value: item.productSkuCount },
            { label: text('Пол', 'Gender'), value: gender(product) || '—' },
            { label: text('Возрастная группа', 'Age group'), value: dimension(product, 'common.age_group') || '—' },
            { label: text('Посадка', 'Fit'), value: dimension(product, 'apparel.fit') || '—' },
            { label: text('Новизна', 'Novelty'), value: dimension(product, 'common.novelty') || '—' },
            { label: text('Сезон', 'Season'), value: dimension(product, 'common.operating_season') || '—' },
          ],
          content: [chainActions(product)].filter(Boolean),
        },
        {
          label: text('Готовность', 'Readiness'),
          fields: [
            { label: text('Оценка готовности', 'Readiness'), value: product.readinessSnapshotId ? `${statusLabel(product.readinessStatus)} · ${item.readinessPercent}%` : text('Не оценён', 'Not assessed') },
            { label: text('Связка с каталогом', 'Catalogue link'), value: `${item.legacyCatalogLinkCount}/${item.productSkuCount}` },
          ],
          content: [risks, readinessDimensions(product), readinessAssessAction(product), readinessPackRatioTemplateAction(product), readinessProjectionAction(product)].filter(Boolean),
        },
        {
          label: text('Сертификация', 'Certification'),
          content: [certificationActions(item), certificationPanel(item)].filter(Boolean),
        },
        {
          label: text('Цветомодели', 'Colourways'),
          fields: [
            { label: text('Цветомоделей', 'Colourways'), value: colorwaysOf(item).length },
            { label: text('С управляемым цветом', 'With a governed colour'), value: colorwaysOf(item).filter((entry) => entry.pantone).length },
          ],
          content: [colorwayActions(item), colorwayPanel(item)],
        },
        {
          label: text('Референсы', 'References'),
          content: [styleReferenceActions(item), styleReferencePanel(item)].filter(Boolean),
        },
        {
          label: text('Квотирование', 'Quotation'),
          content: [styleQuotationPanel(item)],
        },
        {
          label: text('Технологические узлы', 'Construction nodes'),
          content: [styleConstructionNodeActions(item), styleConstructionNodePanel(item)].filter(Boolean),
        },
        {
          label: text('Состояние', 'State'),
          fields: [
            { label: text('Текущее состояние', 'Current state'), value: statusLabel(product.lifecycleStatus) },
            // Версия модели — та, что в заголовке («v2»), а не счётчик правок записи: единица рядом с «v2»
            // читалась как противоречие.
            { label: text('Версия модели', 'Style version'), value: product.styleVersionNo ? `v${product.styleVersionNo}` : '—' },
          ],
          content: [lifecycleRail(product), ...transitionButtons(item)],
        },
        {
          label: text('Атрибуты категории', 'Category attributes'),
          content: [attributePanel(item)],
        },
        {
          label: text('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History'),
          content: [historyPanel(item)],
        },
        {
          label: text('\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0430\u0442\u0440\u0438\u0431\u0443\u0442\u043e\u0432', 'Attribute changes'),
          content: [changesPanel(item)],
        },
        {
          label: text('Команда', 'Team'),
          content: [
            Object.keys(product.responsibilities || {}).length
              ? null
              : notice(text('Ответственные не назначены. Пока стол пуст, вопрос по модели некому адресовать.', 'No desks are assigned yet. While a desk is empty there is nobody to address a question about this style to.'), 'warning'),
            teamPanel(product),
          ],
        },
        {
          label: text('Коммерция', 'Commercial'),
          fields: [
            { label: text('Коммерческая проекция', 'Commercial projection'), value: product.commercialProjectionId ? `v${product.commercialProjectionVersionNo} · ${statusLabel(product.commercialProjectionStatus)}` : text('Не опубликована', 'Not published') },
          ],
        },
      ],
      actions: [],
    });
  }

  // Worst first: blocked, then not yet assessed, then ready. A person opening a readiness view is
  // looking for what is holding the season up, not for an alphabet.
  function readinessRank(item) {
    const status = item.product?.readinessStatus;
    if (item.risks?.length) return 0;
    if (status === 'blocked') return 1;
    if (status !== 'ready') return 2;
    return 3;
  }
  function projectionRank(item) {
    if (!item.readinessReady) return 0;
    if (!item.projected) return 1;
    return 2;
  }

  function renderStyles() {
    ensureLifecycle();
    const registry = core.buildRegistry(state.workspace);
    const header = odHeader('styles', [
      { id: 'registry', label: text('Реестр моделей', 'Product Master') },
      { id: 'readiness', label: text('Готовность', 'Readiness') },
      { id: 'publication', label: text('Коммерческая проекция', 'Commercial projection') },
      { id: 'exceptions', label: text('Исключения', 'Exceptions') },
    ], [
      { label: text('Модели', 'Styles'), value: registry.summary.total, detail: `${registry.summary.productSkus} ${text('товарных SKU', 'product SKU')}` },
      { label: text('Готовы', 'Ready'), value: registry.summary.ready, detail: `${registry.summary.averageReadiness}% ${text('средняя готовность', 'average readiness')}` },
      { label: text('Проекции', 'Projected'), value: registry.summary.projected, detail: text('опубликованы неизменяемо', 'immutable published') },
      { label: text('Заблокированы', 'Blocked'), value: registry.summary.blocked, detail: `${registry.summary.notAssessed} ${text('не оценено', 'not assessed')}` },
      { label: text('Связка с каталогом', 'Catalogue bridge'), value: registry.summary.bridgeIncomplete, detail: text('неполные связи legacy SKU', 'incomplete legacy SKU links') },
    ], [], text('Поиск модели или версии', 'Search style or version'), registryActions());

    // The two middle tabs are named for a view and were built as exception lists: «Готовность» kept
    // only the styles that are not ready, «Коммерческая проекция» only those without one. With a
    // season in good shape both are empty by construction, so a tab promising a readiness view showed
    // a blank table under the register's own headers — and the screen's own KPI strip said «Готовы 14»
    // three inches above it.
    //
    // They show every style now, ordered so that whatever needs attention is at the top. An empty
    // readiness view then means there are no styles, not that everything is fine, which is the only
    // reading that cannot mislead. «Исключения» stays a filter, because that is what it is called.
    let rows = registry.styles;
    if (header.active === 'readiness') {
      rows = [...rows].sort((left, right) => readinessRank(left) - readinessRank(right)
        || String(left.product.styleCode).localeCompare(String(right.product.styleCode)));
    }
    if (header.active === 'publication') {
      rows = [...rows].sort((left, right) => projectionRank(left) - projectionRank(right)
        || String(left.product.styleCode).localeCompare(String(right.product.styleCode)));
    }
    if (header.active === 'exceptions') rows = rows.filter((item) => item.risks.length);

    const content = odRegistry({
      scope: 'od-styles', filterScope: 'styles', rows, rowKey: (item) => item.product.id,
      statusAccessor: (item) => item.product.lifecycleStatus,
      columns: [
        { key: 'image', label: text('Изображение', 'Image'), className: 'od-thumb-cell', render: productThumb },
        { key: 'styleCode', label: text('Код модели', 'Style code'), value: (item) => item.product.styleCode },
        { key: 'title', label: text('Название', 'Title'), value: (item) => title(item.product) },
        { key: 'version', label: text('Версия', 'Version'), value: (item) => `v${item.product.styleVersionNo || '—'}` },
        { key: 'lifecycle', label: text('Статус', 'Lifecycle'), render: (item) => statusBadge(item.product.lifecycleStatus) },
        { key: 'placeholder', label: text('Плейсхолдер', 'Placeholder'), value: (item) => item.product.placeholderCode || '—', title: (item) => item.product.placeholderNameRu || '' },
        { key: 'buyer', label: text('Байер', 'Buyer'), value: (item) => people(item.product, 'buyer') || '—' },
        { key: 'productManager', label: text('Продуктовый менеджер', 'Product manager'), value: (item) => people(item.product, 'product_manager') || '—' },
        { key: 'fabricManager', label: text('Менеджер по тканям', 'Fabric manager'), value: (item) => people(item.product, 'fabric_manager') || '—' },
        { key: 'technologist', label: text('Технолог', 'Technologist'), value: (item) => people(item.product, 'technologist') || '—' },
        { key: 'fit', label: text('Посадка', 'Fit'), value: (item) => dimension(item.product, 'apparel.fit') || '—' },
        { key: 'novelty', label: text('Новизна', 'Novelty'), value: (item) => dimension(item.product, 'common.novelty') || '—' },
        { key: 'gender', label: text('Пол', 'Gender'), value: (item) => gender(item.product) || '—' },
        { key: 'ageGroup', label: text('Возрастная группа', 'Age group'), value: (item) => dimension(item.product, 'common.age_group') || '—' },
        { key: 'season', label: text('Сезон', 'Season'), value: (item) => dimension(item.product, 'common.operating_season') || '—' },
        { key: 'colorways', label: text('Цвета', 'Colorways'), value: (item) => item.colorwayCount },
        { key: 'productSkus', label: text('Товарные SKU', 'Product SKU'), value: (item) => item.productSkuCount },
        { key: 'readiness', label: text('Готовность', 'Readiness'), render: readiness },
        { key: 'gate', label: text('Проверка', 'Gate'), render: readinessBadge },
        { key: 'projection', label: text('Проекция', 'Projection'), render: projectionBadge },
      ],
      inspector,
    });
    return odPage(text('Канонический Product Master', 'Canonical Product Master'), header, content);
  }

  const previousRenderView = renderView;
  renderView = function renderStyleView() { return state.view === 'styles' ? renderStyles() : previousRenderView(); };
})();
